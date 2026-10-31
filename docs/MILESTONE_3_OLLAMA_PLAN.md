# Milestone 3: Ollama integration plan (proposal for approval)

Date: October 31, 2026. Branch: `milestone-3-ai-matching` at `ad195ea`, with both GitHub workflows passing. Status: **plan only.** Nothing is installed, no model is downloaded, and no code is changed for Ollama yet.

The strategy change: CareerOS uses free AI running locally through Ollama. The Claude provider stays in the code as an optional future integration, **disabled**. No paid API call has ever been made. The approved Anthropic live evaluation is cancelled and was never run.

## 1. What exists and is kept

| Component | State | Reused for Ollama |
| --- | --- | --- |
| FastAPI AI service (`ai-service/`) | Signed requests, shared fail-closed replay store, per-request provider choice, contract v2 | Yes, unchanged |
| Rules engine | Default and always available; proficiency fix, 0 false "supported" on the fictional set | Stays the default and the comparison baseline |
| Provider interface (`app/providers/base.py`) | `match()` returns findings, usage, provider request id | Ollama is a new implementation |
| Prompt v1 and output schema (`anthropic_prompt.py`) | Provider-neutral text and JSON schema | Moved to a shared module and used by both |
| Strict validation (Python and TypeScript) | Any overreaching finding discards the response | Applies to Ollama output too |
| Consent v2, allow-list, method choice UI | Built for the cloud provider | Extended with a third method; see section 4 |
| Cost ledger and budgets | Cloud only | Not needed: Ollama is free, so runs record billing state NONE |
| Evaluation harness, 16 fictional cases | Rules, mock, replay, live (Anthropic) | New free `ollama` mode |
| CI | App and AI service workflows passing | Ollama is tested with mocked HTTP; no model runs in CI |

**Claude stays disabled:** `AI_CLOUD_ENABLED=false` (now also in local `.env`), `AI_PROVIDERS=rules` in the AI service, and no Anthropic key anywhere. The code and its mocked tests remain, so it could be switched on later only by an explicit configuration change you approve.

## 2. Hardware (measured on this laptop)

| Item | Finding | Impact |
| --- | --- | --- |
| GPU | NVIDIA GeForce RTX 5060 Laptop GPU, **8 GB VRAM** (8,151 MiB; 7,941 MiB free), driver 591.74 | 7–9B models at 4-bit fit; 12B+ won't fit fully |
| Display | The Intel integrated GPU drives the display | Nearly all NVIDIA VRAM is available to Ollama |
| CPU | Intel Core Ultra 7 356H, 16 cores | Fine for any CPU spill-over, but much slower than GPU |
| RAM | 31.4 GB total, **3.8 GB free** at inspection; Docker Desktop's VM holds about 15.3 GB | Models must stay on the GPU. With Docker running, little RAM is left for spill-over |
| Disk | C: 587 GB free | Plenty; each candidate model is 3–8 GB |
| OS | Windows 11 Home, build 26200, 64-bit | Native Ollama for Windows is supported |
| Docker | Docker Desktop 29.7.2 on WSL2 (default distro `docker-desktop`), **NVIDIA container runtime available** | Ollama could also run in Docker with the GPU, but native is simpler here (section 3) |
| Ollama | **Not installed** | Installation needs your approval |

## 3. Model recommendation

Candidates confirmed in Ollama's library (sizes are download sizes at the default quantization):

| Model | Size | Context | Fit on 8 GB | Notes |
| --- | --- | --- | --- | --- |
| **`qwen3.5:9b`** (recommended first choice) | 6.6 GB | 256K (we'd use 8K) | Fits on the GPU with an 8K context; tight | Newest generation; thinking mode can be switched off; tools; widely recommended as the 8 GB default |
| **`qwen3:8b`** (recommended second choice) | 5.2 GB | 40K | Comfortable; leaves room for a 16K context | Mature, widely used with Ollama structured outputs; thinking can be switched off; slightly weaker than 3.5 |
| `qwen3.5:4b` (speed fallback) | 3.3 GB | 256K | Very comfortable | Fastest; noticeably weaker on judgment-heavy requirements |
| `gemma4:12b` | 7.7 GB | 256K | Too tight: spills to CPU and RAM | Not recommended on this hardware |
| `gpt-oss:20b`, `qwen3:14b` | 9–12 GB | n/a | Don't fit | Not recommended |

**Recommendation:** download `qwen3.5:9b` and `qwen3:8b` (about 12 GB total), run the free offline evaluation on both, and pick by results. Expected tradeoffs:
- **Accuracy:** `qwen3.5:9b` is likely the more accurate on requirement judgment (synonyms such as Postgres vs PostgreSQL, "possible" vs "gap").
- **Speed and stability:** `qwen3:8b` leaves VRAM headroom for longer prompts and is likely somewhat faster. Our largest fictional case (50 requirements, 200 evidence entries) needs a larger context, and `qwen3.5:9b` might partly spill to CPU there.
- **Structured JSON:** both support Ollama's schema-constrained `format`, and our strict validators catch anything that slips through.
- Thinking (reasoning) mode would be **off** by default for speed. The evaluation can test it on one model.
- `qwen3.5:4b` is the fallback if latency is unacceptable.

These are expectations, not measurements. The evaluation decides, and nothing is downloaded until you approve.

**Native Ollama for Windows, not Docker:**
- Native uses the RTX 5060 directly and avoids Docker's 15 GB VM memory budget.
- It listens only on `127.0.0.1:11434` by default.
- The Docker image (`ollama/ollama` with the NVIDIA runtime) remains an option if you'd rather keep everything in containers.

## 4. Ollama provider design

**AI service** (`ai-service/app/providers/ollama.py`, implementing the existing interface):
- **The request:** `POST {OLLAMA_URL}/api/chat` with `stream: false`. The JSON schema goes in `format`, and the schema is also repeated in the prompt (Ollama recommends this). Options: `temperature: 0`, a fixed `seed`, `num_ctx` (8K by default), and `num_predict` (an output cap). Thinking off. `keep_alive` keeps the model loaded for 10 minutes.
- **Shared prompt:** the same system prompt v1 and data delimiters as before. `method_version` becomes `ollama/<model>/prompt-v1`.
- **Configuration:**
  - `AI_OLLAMA_URL`: default `http://127.0.0.1:11434`. Only localhost, or an explicitly allowed private address; refused for public hosts.
  - `AI_OLLAMA_MODEL`: must be on an approved list (`qwen3.5:9b`, `qwen3:8b`, `qwen3.5:4b`).
  - `AI_OLLAMA_NUM_CTX` and `AI_OLLAMA_TIMEOUT_SECONDS`.
- **Two separate provider flags** replace the single `local` flag: "costs nothing" and "needs strict validation". Ollama is free (billing NONE, no reservations) but **strictly validated** like any language model.
- **One request at a time:** an 8 GB GPU should run one generation at a time, so a queue serializes them, with a wait timeout that returns 503 `provider_busy`.
- **Errors:**

  | Situation | Result |
  | --- | --- |
  | Connection refused | 503 `provider_unavailable` (rules still works) |
  | Model not pulled | 503 with a clear code |
  | Timeout | 504 |
  | Output isn't valid JSON | 502 `provider_output_rejected` |
  | Truncated output (`done_reason: length`) | 502 `provider_output_truncated` |

  `billed` is always "no".
- **Readiness:** `GET /api/version`, plus a check through `/api/tags` that the configured model is installed.
- **Logging:** model, durations, token counts, and outcome only, never prompt text. This matches the existing rules.

**Next.js:**
- A third method in the run form: "Local AI (`qwen3.5:9b` via Ollama)", alongside the rules engine (still the default). Claude stays hidden while disabled.
- Enabled only with `AI_LOCAL_LLM_ENABLED=true` and an allow-list, like cloud analysis.
- **Consent:** no third-party consent is needed while Ollama runs on CareerOS-controlled hardware, because nothing leaves your machine. The page still says plainly which model runs and where. If Ollama is ever reached over a network (see section 6), the wording must say so. That would be a consent-version bump.
- **Timeouts:** the Next.js call timeout becomes configurable per provider. A local 9B model may need 20–60 s on large requests; the evaluation will measure this. The Vercel function limit matters for production (section 6).
- **Limits:** the existing daily count and attempt caps apply; there's no cost ledger.

**Tests (no model needed):**
- Ollama HTTP mocked with the same approach as the Anthropic tests, covering success, invalid JSON, truncation, refused connection, timeout, a missing model, the queue limit, and log hygiene.
- Next.js unit and integration tests for the new method.
- An end-to-end browser test against a small Ollama-API mock, like `devtools/mock_anthropic.py`.
- CI never downloads a model.

**Evaluation:** a new free `--mode ollama --model <name>` in `evals/run_eval.py` runs the same 16 fictional cases × 3 runs locally. It reports false "supported", injection results, consistency, rejection rate, latency (p50/p95), and GPU or CPU placement (`ollama ps`), compared with the rules engine. The pass criteria are the ones already approved: 0 false "supported", 0 injection effects, ≤ 5% rejected, ≥ 80% agreement. The latency target is to be agreed for local hardware.

## 5. Proposed steps

1. **With your approval:** install Ollama for Windows, confirm it uses the GPU, and pull `qwen3.5:9b` and `qwen3:8b`.
2. Split the provider flags; move the prompt to a shared module (no behavior change; all current tests must still pass).
3. Ollama provider, configuration, mocked tests, and readiness check.
4. `ollama` evaluation mode; run both models on the fictional set and recommend one with measurements.
5. Next.js method choice, configuration, wording, tests, and the browser test with the mock.
6. Docs, security review, full checks, report. Stop for review.

## 6. Open questions

Your message was cut off after "Design an Ollama provider using the existing FastAPI provider interface. R…", and its title mentions a **Remote Access Plan**. I need the rest of the brief before planning that part. The main questions:
- **Where will Ollama run for the deployed site?** Production Next.js on Vercel can't reach `127.0.0.1` on your laptop. Options include:
  - a private tunnel to your laptop (for example Tailscale or Cloudflare Tunnel), with the AI service on the laptop and the existing HMAC signing and replay protection
  - local use only
  - a GPU host later

  Each changes the privacy wording and availability: the laptop has to be on.
- **What should "remote access" cover:** using CareerOS from your phone or another computer, or the hosted site reaching your laptop's AI?
- Any latency expectation for local analysis.
