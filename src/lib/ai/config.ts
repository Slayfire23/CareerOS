import "server-only";
import { priceFor } from "@/lib/ai/pricing";

// Server-only configuration for the AI service. None of these values may use the NEXT_PUBLIC_
// prefix: the secret signs requests and must never reach the browser. No AI provider key is ever
// configured here; the Anthropic key lives only in the AI service's environment.

export const DEFAULT_DAILY_LIMIT = 20;
/// Every run counts toward this cap, including failures that never reached an analysis.
export const ATTEMPT_MULTIPLIER = 3;
/// The only cloud model approved (decision D1). Changing it needs a reviewed code change.
export const CLOUD_MODEL = "claude-sonnet-5-5";
/// Upper bounds for one cloud call; the reservation is computed from them.
export const CLOUD_MAX_INPUT_TOKENS = 40_000;
export const CLOUD_MAX_OUTPUT_TOKENS = 6_000;
/// Providers that run inside our own service and send nothing to a third-party AI provider.
export const LOCAL_PROVIDERS = new Set<string>(["rules"]);

export type CloudConfig = {
  provider: "anthropic";
  model: typeof CLOUD_MODEL;
  userDailyMicroUsd: number;
  globalDailyMicroUsd: number;
  globalMonthlyMicroUsd: number;
  allowedUserIds: ReadonlySet<string>;
};

export type AiConfig =
  | {
      enabled: true;
      serviceUrl: string;
      secret: string;
      dailyLimit: number;
      attemptLimit: number;
      /** null unless the cloud provider is fully configured; reason says why. */
      cloud: CloudConfig | null;
      cloudReason: string | null;
    }
  | { enabled: false; reason: string };

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function usd(value: string | undefined): number | null {
  if (!value?.trim() || !/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Math.round(Number(value) * 1_000_000);
  return amount > 0 && amount <= 1_000_000_000 ? amount : null;
}

/** The cloud provider is off unless every setting is present and valid (fail closed). */
function readCloud(env: Record<string, string | undefined>): { cloud: CloudConfig | null; reason: string | null } {
  if (env.AI_CLOUD_ENABLED?.trim() !== "true") return { cloud: null, reason: "Cloud analysis is turned off." };
  if (!priceFor(CLOUD_MODEL)) return { cloud: null, reason: "No verified price for the cloud model." };
  const userDaily = usd(env.AI_COST_USER_DAILY_USD);
  const globalDaily = usd(env.AI_COST_GLOBAL_DAILY_USD);
  const globalMonthly = usd(env.AI_COST_GLOBAL_MONTHLY_USD);
  if (!userDaily || !globalDaily || !globalMonthly) {
    return { cloud: null, reason: "Cloud cost limits are missing or invalid." };
  }
  const allowed = (env.AI_CLOUD_ALLOWED_USERS ?? "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length || allowed.some(id => !UUID.test(id))) {
    return { cloud: null, reason: "AI_CLOUD_ALLOWED_USERS must list one or more user ids." };
  }
  return {
    cloud: {
      provider: "anthropic",
      model: CLOUD_MODEL,
      userDailyMicroUsd: userDaily,
      globalDailyMicroUsd: globalDaily,
      globalMonthlyMicroUsd: globalMonthly,
      allowedUserIds: new Set(allowed),
    },
    reason: null,
  };
}

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

  const rawLimit = env.AI_ANALYSIS_DAILY_LIMIT?.trim();
  const dailyLimit = rawLimit ? Number(rawLimit) : DEFAULT_DAILY_LIMIT;
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1000) {
    return { enabled: false, reason: "AI_ANALYSIS_DAILY_LIMIT must be a whole number from 1 to 1000." };
  }

  const { cloud, reason } = readCloud(env);
  return {
    enabled: true,
    serviceUrl: url.origin + url.pathname.replace(/\/$/, ""),
    secret,
    dailyLimit,
    attemptLimit: dailyLimit * ATTEMPT_MULTIPLIER,
    cloud,
    cloudReason: reason,
  };
}
