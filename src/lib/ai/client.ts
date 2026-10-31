import "server-only";
import type { MatchRequest } from "@/lib/ai/evidence";
import type { TokenUsage } from "@/lib/ai/pricing";
import { signedHeaders } from "@/lib/ai/signing";
import { parseProviderRequestId, parseUsage } from "@/lib/ai/client-parsing";

// Signed calls from the Next.js server to the AI service. Never imported by client components.

export const SERVICE_TIMEOUT_MS = 45_000;

/** Whether a provider may have charged for the request (see ai-service/app/errors.py). */
export type Billed = "no" | "yes" | "unknown";

export const SERVICE_ERROR_CODES = [
  "service_unavailable",
  "service_timeout",
  "service_rejected",
  "replay_store_unavailable",
  "provider_timeout",
  "provider_output_rejected",
  "provider_refused",
  "provider_output_truncated",
  "provider_busy",
  "provider_unavailable",
  "provider_request_rejected",
  "provider_error",
  "over_budget",
  "invalid_response",
] as const;
export type AiServiceErrorCode = (typeof SERVICE_ERROR_CODES)[number];

export class AiServiceError extends Error {
  constructor(
    public code: AiServiceErrorCode,
    public billed: Billed = "no",
    public usage: TokenUsage | null = null,
    public providerRequestId: string | null = null,
  ) {
    super(code);
  }
}

type Fetch = typeof fetch;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function errorFromResponse(status: number, body: unknown): AiServiceError {
  const error = isObject(body) && isObject(body.error) ? body.error : null;
  const code = error && (SERVICE_ERROR_CODES as readonly unknown[]).includes(error.code) ? (error.code as AiServiceErrorCode) : null;
  const billedValue = error?.billed;
  // Without a trustworthy body, a server-side failure might have been billed.
  const billed: Billed = billedValue === "no" || billedValue === "yes" || billedValue === "unknown" ? billedValue : status >= 500 ? "unknown" : "no";
  const usage = error ? parseUsage(error.usage) : null;
  const providerRequestId = error ? parseProviderRequestId(error.provider_request_id) : null;
  if (code) return new AiServiceError(code, billed, usage, providerRequestId);
  if (status === 504) return new AiServiceError("provider_timeout", billed);
  if (status === 502) return new AiServiceError("provider_output_rejected", billed, usage, providerRequestId);
  return new AiServiceError(status >= 500 ? "service_unavailable" : "service_rejected", billed, usage, providerRequestId);
}

function refusedConnection(error: unknown): boolean {
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
  return cause?.code === "ECONNREFUSED";
}

export async function callMatchService(
  config: { serviceUrl: string; secret: string },
  request: MatchRequest,
  fetchImpl: Fetch = fetch,
): Promise<unknown> {
  const body = JSON.stringify(request);
  let response: Response;
  try {
    response = await fetchImpl(`${config.serviceUrl}/v1/match`, {
      method: "POST",
      headers: signedHeaders(config.secret, request.request_id, body),
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
    });
  } catch (error) {
    // A refused connection never reached the service. Anything else (timeouts, resets) may have
    // happened after the service called a provider, so its billing is unknown.
    if (error instanceof DOMException && error.name === "TimeoutError") throw new AiServiceError("service_timeout", "unknown");
    throw new AiServiceError("service_unavailable", refusedConnection(error) ? "no" : "unknown");
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    if (!response.ok) throw errorFromResponse(response.status, null);
    throw new AiServiceError("invalid_response", "unknown");
  }
  if (!response.ok) throw errorFromResponse(response.status, parsed);
  return parsed;
}
