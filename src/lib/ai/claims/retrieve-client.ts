import { postSigned, SUGGEST_TIMEOUT_MS } from "@/lib/ai/client";

/** Shadow retrieval on the local bridge. No real user reaches this: only the evaluation runner calls it. */
export const callRetrieveService = (config: { serviceUrl: string; secret: string }, request: { request_id: string }) =>
  postSigned(config, "/v1/retrieve", request.request_id, request, fetch, SUGGEST_TIMEOUT_MS);
