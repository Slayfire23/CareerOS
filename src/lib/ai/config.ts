import "server-only";

// Server-only configuration for the AI service. None of these values may use the NEXT_PUBLIC_
// prefix: the secret signs requests and must never reach the browser.

export const DEFAULT_DAILY_LIMIT = 20;
/// Providers Next.js will accept results from. Phase 2: the deterministic rules engine only.
export const ALLOWED_PROVIDERS = ["rules"] as const;
/// Providers that run inside our own service and send nothing to a third-party AI provider.
export const LOCAL_PROVIDERS = new Set<string>(["rules"]);

export type AiConfig =
  | { enabled: true; serviceUrl: string; secret: string; dailyLimit: number; provider: (typeof ALLOWED_PROVIDERS)[number] }
  | { enabled: false; reason: string };

export function readAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const serviceUrl = env.AI_SERVICE_URL?.trim();
  const secret = env.AI_SERVICE_SECRET ?? "";
  if (!serviceUrl || !secret) return { enabled: false, reason: "AI analysis is not configured." };
  if (secret.length < 32) return { enabled: false, reason: "AI_SERVICE_SECRET must be at least 32 characters." };

  let url: URL;
  try {
    url = new URL(serviceUrl);
  } catch {
    return { enabled: false, reason: "AI_SERVICE_URL is not a valid URL." };
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    return { enabled: false, reason: "AI_SERVICE_URL must use HTTPS (plain HTTP is allowed for localhost only)." };
  }
  if (url.username || url.password || url.search || url.hash) {
    return { enabled: false, reason: "AI_SERVICE_URL must not contain credentials, a query, or a fragment." };
  }

  const provider = env.AI_ANALYSIS_PROVIDER?.trim() || "rules";
  if (!(ALLOWED_PROVIDERS as readonly string[]).includes(provider)) {
    return { enabled: false, reason: `AI provider "${provider}" is not enabled.` };
  }

  const rawLimit = env.AI_ANALYSIS_DAILY_LIMIT?.trim();
  const dailyLimit = rawLimit ? Number(rawLimit) : DEFAULT_DAILY_LIMIT;
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1000) {
    return { enabled: false, reason: "AI_ANALYSIS_DAILY_LIMIT must be a whole number from 1 to 1000." };
  }

  return {
    enabled: true,
    serviceUrl: url.origin + url.pathname.replace(/\/$/, ""),
    secret,
    dailyLimit,
    provider: provider as (typeof ALLOWED_PROVIDERS)[number],
  };
}
