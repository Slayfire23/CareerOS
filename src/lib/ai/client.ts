import "server-only";
import type { MatchRequest } from "@/lib/ai/evidence";
import { signedHeaders } from "@/lib/ai/signing";

// Signed calls from the Next.js server to the AI service. Never imported by client components.

export const SERVICE_TIMEOUT_MS = 45_000;

export type AiServiceErrorCode =
  | "service_unavailable"
  | "service_timeout"
  | "service_rejected"
  | "provider_timeout"
  | "provider_output_rejected"
  | "invalid_response";

export class AiServiceError extends Error {
  constructor(public code: AiServiceErrorCode) {
    super(code);
  }
}

type Fetch = typeof fetch;

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
    throw new AiServiceError(error instanceof DOMException && error.name === "TimeoutError" ? "service_timeout" : "service_unavailable");
  }
  if (response.status === 504) throw new AiServiceError("provider_timeout");
  if (response.status === 502) throw new AiServiceError("provider_output_rejected");
  if (!response.ok) throw new AiServiceError(response.status >= 500 ? "service_unavailable" : "service_rejected");
  try {
    return await response.json();
  } catch {
    throw new AiServiceError("invalid_response");
  }
}
