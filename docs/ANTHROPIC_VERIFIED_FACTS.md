# Anthropic API facts verified for Phase 3

Checked October 30, 2026 against Anthropic's official documentation at platform.claude.com/docs. Re-check before any paid call or deployment; prices and limits can change.

| Topic | Verified fact | Source |
| --- | --- | --- |
| Model ID | `claude-sonnet-5-5` (Claude Sonnet 5.5). Dateless IDs are pinned snapshots; the alias is the same string. Retirement not sooner than September 28, 2027 | Models overview |
| Limits | 1M-token context, 128K max output (synchronous Messages API) | Models overview |
| Thinking | Adaptive by default, default effort `high`. `thinking: {type: "disabled"}` returns 400 on Sonnet 5.5; the lowest setting is `{type: "between_tools"}` (400 at `xhigh`/`max` effort) | Models overview; API errors |
| Forced tool use | `tool_choice` `any`/`tool` returns 400 on Sonnet 5.5; use `auto` or structured outputs | API errors |
| Thinking billing | Thinking tokens are billed as output tokens even when not returned, and count toward `max_tokens` | Thinking |
| Price | Input $2/MTok; output $10/MTok; 5-minute cache write $2.50/MTok; 1-hour cache write $4/MTok; cache hits $0.10/MTok | Pricing |
| Long context | No long-context surcharge for Sonnet 5.5 (full 1M window at standard rates) | Pricing |
| Data residency | `inference_geo: "us"` applies a 1.1× multiplier; the default `global` uses standard prices. CareerOS uses the default | Pricing |
| Structured outputs | Supported on `claude-sonnet-5-5` via `output_config.format` (Python `client.messages.parse(output_format=PydanticModel)`). Objects need `additionalProperties: false`; `enum`, `const`, `anyOf`, internal `$ref` and simple `pattern` are supported; `minLength`/`maxLength`, `minimum`/`maximum` and `maxItems` aren't (the SDK moves them into descriptions and validates them afterwards) | Structured outputs |
| Output not guaranteed | With `stop_reason: "refusal"` (HTTP 200, tokens billed) or `"max_tokens"`, output may not match the schema. Check `stop_reason` before parsing. Enum values may differ in letter case | Structured outputs |
| Errors | 400 `invalid_request_error` (also returned when a **spend limit you set** is reached: "You have reached your specified … usage limits"); 401 authentication; 402 billing; 403 permission; 404 not found; 409 conflict; 413 request too large; 429 rate limit (or the tier spend cap, with `error.details.error_code = "enforced_spend_limit_reached"` and no `retry-after`); 500 api_error; 504 timeout_error; 529 overloaded | API errors; Rate limits |
| Request ID | Every response has a `request-id` header, also `_request_id` on Python SDK responses and `request_id` in error bodies | API errors |
| Python SDK | Exceptions: `BadRequestError` (400), `AuthenticationError` (401), `PermissionDeniedError` (403), `NotFoundError` (404), `ConflictError` (409), `UnprocessableEntityError` (422), `RateLimitError` (429), `InternalServerError` (≥500), `APIConnectionError` (no response), `APITimeoutError` (timeout). Default `max_retries=2` (retries connection errors, 408, 409, 429, ≥500) and 10-minute timeout; both configurable. HTTP layer is `httpx2`; a custom `http_client` can be passed (used for mocked tests). SDK 2.0.0 is the first to send API version `2026-10-21` | Python SDK |
| Spend limits | Organization spend limit on the Console Billing page (monthly, cannot exceed the tier cap). Workspace spend limits can be set per workspace, but not on the default workspace. Reaching a limit you set returns 400 | Rate limits |
| Rate limits | Sonnet 5.5, Start tier: 4,000 RPM, 2M input tokens/min, 400K output tokens/min (not a constraint at CareerOS volume) | Rate limits |

## What the docs don't state, and how CareerOS treats it

- **Whether 5xx, 529 and 504 responses are billed** isn't stated. A request that got no usable response but may have been processed is recorded as **unresolved**: the full reservation stays held against the budget until reconciled.
- **Rejected before processing**: rejections with a 4xx status, including 429 rate limits and spend-limit 400s, are treated as not billed.
- **Network timeouts on our side** are always unresolved.
