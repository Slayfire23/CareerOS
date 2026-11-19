import { createHash, createHmac } from "node:crypto";

// Must match ai-service/app/security.py exactly; contracts/match/signature.example.json is a shared
// test vector checked by both the Vitest and pytest suites.
export function canonicalString(timestamp: string, requestId: string, body: string): string {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  return `v1:${timestamp}:${requestId}:${bodyHash}`;
}

export function sign(secret: string, timestamp: string, requestId: string, body: string): string {
  const digest = createHmac("sha256", secret).update(canonicalString(timestamp, requestId, body), "utf8").digest("hex");
  return `v1=${digest}`;
}

export function signedHeaders(secret: string, requestId: string, body: string, now = Date.now()): Record<string, string> {
  const timestamp = String(Math.floor(now / 1000));
  return {
    "content-type": "application/json",
    "x-careeros-timestamp": timestamp,
    "x-careeros-request-id": requestId,
    "x-careeros-signature": sign(secret, timestamp, requestId, body),
  };
}
