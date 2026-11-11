import type { TokenUsage } from "@/lib/ai/pricing";

// Strict parsing of the usage and request-id fields the AI service returns.

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Token usage from the service, or null when absent or malformed. */
export function parseUsage(value: unknown): TokenUsage | null {
  if (!isObject(value)) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10_000_000 ? v : null);
  const input = n(value.input_tokens), output = n(value.output_tokens);
  const cacheRead = value.cache_read_input_tokens === undefined ? 0 : n(value.cache_read_input_tokens);
  const cacheWrite = value.cache_creation_input_tokens === undefined ? 0 : n(value.cache_creation_input_tokens);
  if (input === null || output === null || cacheRead === null || cacheWrite === null) return null;
  return { input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite };
}

export function parseProviderRequestId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : null;
}
