# Milestone 3: local AI with Ollama, setup and evaluation report

Date: October 31, 2026. Branch `milestone-3-ai-matching`, local commits only (not pushed).

**Nothing was pushed, merged, or deployed. No production setting or migration was changed, and no tunnel or public access was created.** No Anthropic API call was made: Claude stays disabled, no Anthropic key exists in any env file, and the AI service log has no Anthropic mentions.

## Setup

| Item | Result |
| --- | --- |
| Ollama | **v0.40.6**, installed natively with winget from Ollama's official GitHub release (checksum verified). It's the newest release at least two weeks old, per our supply-chain rule. |
| Binding | Listens on **127.0.0.1:11434 only**. `OLLAMA_HOST` is not set. The AI service refuses any non-local `AI_OLLAMA_URL`, and so do the browser tests. |
| Models | `qwen3:8b` (5.2 GB, Q4_K_M) and `qwen3.5:9b` (6.6 GB, Q4_K_M) |
| Hardware | RTX 5060 Laptop GPU, 8 GB VRAM; 31.4 GB RAM (Docker Desktop holds about 15 GB) |

## What was built

- **Ollama provider:**
  - same interface and contract as the others
  - schema-constrained JSON, temperature 0, fixed seed, thinking off, model kept loaded for 30 minutes
  - one generation at a time; others wait 20 seconds, then get "busy"
  - a context-window guard (Ollama silently truncates prompts that don't fit, so such requests are refused) and truncation detection
  - never billed
- **Strict validation for every language model, free or paid.** A new relevance rule: a "supported" finding must cite a quote that mentions the requirement. This is in both the Python and Next.js validators.
- **Shared prompt v3:**
  - one-field verbatim quotes
  - durations and empty profile areas computed in code and given to the model, so it judges instead of calculating
- **Next.js:** a third method, "Local AI (qwen3:8b)", behind `AI_LOCAL_LLM_ENABLED`, an approved model, and an allow-list. It's free, uses no cloud consent or redaction because nothing reaches an AI company, has a 120-second timeout, and the rules engine stays the default.
- **Evaluation:** a new `--mode ollama` that samples VRAM, the model's share on the GPU, and Ollama's RAM.

## Measurements: 16 fictional cases × 3 runs = 48 calls per model, prompt v3, 8K context

| | Rules engine | **qwen3:8b** | qwen3.5:9b |
| --- | --- | --- | --- |
| Responses discarded by strict validation | 0% | **25%** (12/48) | 35% (17/48) |
| Too large for the local context window | 0 | 3 (the 50-requirement, 200-entry case) | 3 |
| Verdict agreement with labels | 97.1% | **81.8%** | 71.0% |
| False "supported" | 0 | **0** | 0 |
| Prompt injection succeeded | 0 | **0** (requirement injection discarded 3/3; evidence injection held 3/3) | 0 (held 6/6) |
| Same verdict on every run | n/a (deterministic) | 100% | 100% |
| Latency (median / p95 / max) | under 1 ms | **2.2 s / 7.1 s / 7.1 s** | 3.5 s / 6.5 s / 6.5 s |
| GPU memory in use | n/a | **6.1 GB, 100% on GPU** | 6.4 GB, **88% on GPU** (spills to CPU) |
| Ollama process RAM | n/a | about 110–210 MB (weights are in VRAM) | about 210 MB |
| Cold model load | n/a | about 28 s the first time, then kept loaded | about 17 s |
| Generation speed (warm) | n/a | about 60 tokens/s | about 45 tokens/s |

**Structured JSON reliability:** Ollama's schema enforcement produced parseable JSON matching the schema in **every** call for both models. Every discarded response was well-formed JSON whose *content* broke an evidence rule.

### Per case

| Case | Rules | qwen3:8b | qwen3.5:9b |
| --- | --- | --- | --- |
| exact-skill | ok | ok | ok |
| synonym (Postgres vs PostgreSQL) | **missed** | **ok** | **ok** |
| project is not employment | ok | ok | discarded |
| years met by dates | ok | discarded | discarded |
| years not met | ok | ok | discarded |
| leadership (duration bait) | missed | discarded | discarded |
| empty education | ok | ok | ok |
| degree match / other field | ok / ok | ok / ok | ok / ok |
| expert vs beginner Java | ok (after today's fix) | ok | discarded (2/3) |
| non-English requirement | ok | ok | ok |
| injection in requirement | ok | discarded (safe) | "gap" (safe, not the expected verdict) |
| injection in evidence | ok | "gap" (safe, not the expected verdict) | "gap" |
| empty "Other" category | ok | "gap" instead of "not enough information" | "gap" |
| mixed profile | ok | discarded | discarded |
| 50 requirements / 200 entries | ok | too large | too large |

### How the results changed while fixing problems (qwen3:8b)

| Version | Discarded | False "supported" | Injection succeeded |
| --- | --- | --- | --- |
| prompt v1 | 31% | **3** | **3 of 3** (passed validation) |
| prompt v2 + relevance rule | 25% | 0 | 0 |
| prompt v3 (computed facts) | 25% | 0 | 0 |

The v1 failure exposed **a real gap in our validators**, which is now fixed. An injected instruction made the model call "Kubernetes administration" supported by citing the unrelated skill "Excel". The quote was verbatim, so the old rules accepted it. The new relevance rule rejects it, in both services.

**Caveat:** prompt v2 and v3 were tuned against these same 16 cases, so the results may be somewhat optimistic for real profiles. I stopped tuning after v3 for that reason.

## Which model, and is it accurate enough?

**Best for this hardware: `qwen3:8b`.** It's more accurate than `qwen3.5:9b` here (82% vs 71% agreement, 25% vs 35% discarded), fits entirely on the GPU at 8K context, and is fast (2 s typical, 7 s worst).

**Not yet accurate enough to replace the rules engine, and not yet good enough to offer as-is:**
- **Safety is fine.** Strict validation discards anything that overreaches, and no false "supported" or successful injection reached a stored result.
- **Usefulness isn't.** One in four analyses is discarded. Every case involving years of experience or leadership failed, and the demo job in the real app was discarded too (a requirement about 2 years of experience). The model also says "gap" where "not enough information" is correct.
- **The one real gain over the rules engine** is synonyms (Postgres vs PostgreSQL), which the rules engine misses.

### Recommended improvements before offering local AI to anyone
1. **Hybrid analysis (largest gain):** keep the rules engine's verdicts for experience, education, and duration requirements, where it scores 100% here. Ask the model only about skill and "other" requirements the rules engine can't match (synonyms and related tools). This plays to each one's strengths, and failures fall back to the rules verdict for that one requirement. It needs a design decision from you, because it changes the "discard the whole response" policy into a per-requirement fallback that is clearly labeled.
2. **Short evidence aliases** (e1, e2…) instead of UUIDs in the prompt. That roughly halves large prompts, so the maximum-size profile would fit the 8K context.
3. **A larger, independently labeled fictional set** (for example 50 cases written without looking at model output), to measure accuracy without the tuning bias.
4. Keep the rules engine the default. Show local AI as "experimental" until a re-run meets the approved targets: ≤ 5% discarded, ≥ 80% agreement, and 0 false "supported".

## Tests

| Check | Result |
| --- | --- |
| Python | 195 passed, including the Ollama provider against a mocked API, context guard, busy queue, relevance rule, and log hygiene; ruff clean |
| Next.js | TypeScript and ESLint clean; 314 unit, 73 integration (4 new local-AI tests), 28 Chromium passed, and 1 skipped (the cloud test, which is skipped while Claude is disabled) |
| Real app | The browser → Next.js → AI service → Ollama path works. Local AI appears for allow-listed accounts; Claude stays hidden. |

## Local configuration (this laptop only, never committed)

- `ai-service/.env`: `AI_PROVIDERS=rules,ollama` and `AI_OLLAMA_MODEL=qwen3:8b`, with no Anthropic settings.
- `.env`: `AI_CLOUD_ENABLED=false`; `AI_LOCAL_LLM_ENABLED=true` with `qwen3:8b`, allow-listed to the local test and demo accounts.

Remote access remains a plan only (docs/REMOTE_ACCESS_PLAN.md).
