// Prices for cost reservations and confirmed charges, in tenths of a micro-USD per token
// (so $2 per million tokens is 20). Verified on October 30, 2026 against Anthropic's pricing page
// (docs/ANTHROPIC_VERIFIED_FACTS.md); re-check before any paid call. A model missing here cannot
// be used: cost would be unknowable, so the analysis is refused.

export type TokenUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number };

type Price = { input: number; cacheWrite: number; cacheRead: number; output: number };

export const MODEL_PRICES: Record<string, Price> = {
  // Claude Sonnet 5.5: $2 input, $2.50 5-minute cache write, $0.10 cache read, $10 output per MTok.
  "claude-sonnet-5-5": { input: 20, cacheWrite: 25, cacheRead: 1, output: 100 },
};

export function priceFor(model: string): Price | null {
  return Object.hasOwn(MODEL_PRICES, model) ? MODEL_PRICES[model] : null;
}

/** Charge computed from provider-reported usage, rounded up to the next micro-USD. */
export function costMicroUsd(model: string, usage: TokenUsage): number {
  const price = priceFor(model);
  if (!price) throw new Error(`No price for model ${model}`);
  const tenths =
    usage.input_tokens * price.input +
    usage.cache_creation_input_tokens * price.cacheWrite +
    usage.cache_read_input_tokens * price.cacheRead +
    usage.output_tokens * price.output;
  return Math.ceil(tenths / 10);
}

/** Worst case for one call: every input token at the highest input rate, plus full output. */
export function reservationMicroUsd(model: string, maxInputTokens: number, maxOutputTokens: number): number {
  const price = priceFor(model);
  if (!price) throw new Error(`No price for model ${model}`);
  return Math.ceil((maxInputTokens * Math.max(price.input, price.cacheWrite) + maxOutputTokens * price.output) / 10);
}

export const formatUsd = (microUsd: number) => `$${(microUsd / 1_000_000).toFixed(2)}`;
