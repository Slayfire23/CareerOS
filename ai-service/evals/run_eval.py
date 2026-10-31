"""Evaluation harness for requirement analysis. Fictional data only (evals/cases.json).

Modes (default: rules):
  rules          deterministic baseline, offline
  mock           the Anthropic provider end to end against the local mock API, offline
  replay DIR     recorded Messages API responses (from a live run) through the real parser and
                 strict validators, offline; this is how a live run is re-scored for free
  live           real Claude Sonnet 5.5 calls. Only with owner approval. Requires
                 EVAL_ANTHROPIC_API_KEY (a dedicated evaluation workspace key, set in the
                 environment only), --approve-spend-usd, --confirm-live, and
                 --spend-limit-confirmed (the owner confirmed the workspace Console spend limit).

Live-mode guarantees:
  - At most MAX_LIVE_CALLS message requests, enforced in the HTTP transport. No retries of any
    kind: the SDK's are off, and the provider's rate-limit retry is disabled.
  - Before every request, the worst case of that request plus everything confirmed or unresolved
    so far must fit inside the approved amount, or the run stops.
  - Charges are confirmed only from reported usage; anything uncertain is held at its worst case.
  - The run stops on a safety-critical failure (see SAFETY_STOP_CODES and safety_problem()).
  - The key is read from the environment and is never printed, logged, or written to disk.

    uv run python -m evals.run_eval --mode rules
    uv run python -m evals.run_eval --mode replay evals/recordings/<run>
"""

import argparse
import asyncio
import json
import logging
import os
import secrets
import statistics
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import httpx2
from anthropic import AsyncAnthropic

from app.config import Settings
from app.errors import ServiceError
from app.matching.service import run_match
from app.providers.anthropic import AnthropicProvider
from app.providers.anthropic_prompt import build_user_message, prompt_size_bound
from app.providers.rules import RulesProvider
from app.schemas import MatchRequest, TokenBudget

CASES_FILE = Path(__file__).with_name("cases.json")
MODEL = "claude-sonnet-5-5"
# Verified October 30, 2026 (docs/ANTHROPIC_VERIFIED_FACTS.md). USD per million tokens.
PRICE_PER_MTOK = {"input": 2.0, "output": 10.0}
MAX_OUTPUT_TOKENS = 6_000
MAX_LIVE_CALLS = 48  # approved: 16 fictional cases x 3 runs
FICTIONAL_KEY = "sk-ant-test.not.a.real.key.000000000000000000"
TARGETS = {"rejection_rate": 0.05, "agreement": 0.80, "p95_latency_s": 30.0, "mean_cost_usd": 0.06}
# Failures that point at the key, workspace, billing, spend limit, or our own request: stop at once.
SAFETY_STOP_CODES = {
    "provider_unavailable",
    "provider_request_rejected",
    "provider_busy",
    "budget_required",
    "over_budget",
}


@dataclass
class Case:
    id: str
    request: MatchRequest
    allowed: dict[int, set[str]]
    injection: bool = False
    # Requirements the injected text tries to change; only their verdicts count as injection effects.
    injection_targets: frozenset[int] = frozenset()


@dataclass
class Outcome:
    case_id: str
    run: int
    status: str  # "ok" | "rejected" | "error"
    code: str | None = None
    verdicts: dict[int, str] = field(default_factory=dict)
    latency_s: float = 0.0
    usage: dict | None = None
    cost_usd: float = 0.0
    billed: str = "no"  # "no" | "yes" | "unknown"
    model: str | None = None
    worst_usd: float = 0.0
    input_bound: int = 0


def expand_id(short: str) -> str:
    kind, number = short.split(":")
    return f"{kind}:00000000-0000-4000-8000-{int(number):012d}"


def _large_case(as_of: str) -> Case:
    """The contract maximums: 50 requirements and 200 evidence entries."""
    evidence = [
        {"id": expand_id(f"skill:{i + 1}"), "kind": "skill", "name": f"Fictool{i}"} for i in range(100)
    ]
    evidence += [
        {
            "id": expand_id(f"project:{i + 1}"),
            "kind": "project",
            "title": f"Invented project {i}",
            "skills": [f"Fictool{i}"],
        }
        for i in range(100)
    ]
    requirements = [
        {"index": i, "text": f"Proficiency in Fictool{i}", "category": "Skills", "priority": "Required"}
        for i in range(50)
    ]
    request = MatchRequest.model_validate(
        {
            "request_id": str(uuid.uuid4()),
            "as_of_month": as_of,
            "requirements": requirements,
            "evidence": evidence,
        }
    )
    return Case("contract-maximums", request, {i: {"supported"} for i in range(50)})


def load_cases(path: Path = CASES_FILE, include_large: bool = True) -> list[Case]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("fictional") is not True:
        raise ValueError("The evaluation file must be marked fictional.")
    cases = []
    for raw in data["cases"]:
        if raw.get("fictional") is not True:
            raise ValueError(f"Case {raw.get('id')} is not marked fictional; refusing to use it.")
        requirements = [
            {k: v for k, v in r.items() if k not in ("allowed", "injection_target")} | {"index": i}
            for i, r in enumerate(raw["requirements"])
        ]
        targets = frozenset(i for i, r in enumerate(raw["requirements"]) if r.get("injection_target"))
        evidence = [e | {"id": expand_id(e["id"])} for e in raw["evidence"]]
        request = MatchRequest.model_validate(
            {
                "request_id": str(uuid.uuid4()),
                "as_of_month": data["as_of_month"],
                "requirements": requirements,
                "evidence": evidence,
            }
        )
        allowed = {i: set(r["allowed"]) for i, r in enumerate(raw["requirements"])}
        if raw.get("injection", False) and not targets:
            raise ValueError(f"Injection case {raw['id']} must mark its injection_target requirement.")
        cases.append(Case(raw["id"], request, allowed, raw.get("injection", False), targets))
    if include_large:
        cases.append(_large_case(data["as_of_month"]))
    return cases


def input_bound(request: MatchRequest) -> int:
    return prompt_size_bound(build_user_message(request))


def worst_case_usd(request: MatchRequest) -> float:
    """Every input token the byte bound allows, plus the full output allowance, at verified prices."""
    return (
        input_bound(request) * PRICE_PER_MTOK["input"] + MAX_OUTPUT_TOKENS * PRICE_PER_MTOK["output"]
    ) / 1_000_000


def usage_usd(usage: dict | None) -> float:
    if not usage:
        return 0.0
    return (
        usage["input_tokens"] * PRICE_PER_MTOK["input"] + usage["output_tokens"] * PRICE_PER_MTOK["output"]
    ) / 1_000_000


def planned_worst_case_usd(cases: list[Case], runs: int) -> float:
    return runs * sum(worst_case_usd(c.request) for c in cases)


def _settings(key: str = FICTIONAL_KEY) -> Settings:
    return Settings(  # type: ignore[call-arg]
        _env_file=None,
        environment="test",
        service_secret=secrets.token_hex(24),  # unused: the harness never serves HTTP
        providers="rules,anthropic",
        replay_store_url="redis://127.0.0.1:6379/0",  # not used by the harness
        anthropic_api_key=key,
    )


def _cloud_request(case: Case) -> MatchRequest:
    budget = TokenBudget(
        max_input_tokens=input_bound(case.request) + 1_000, max_output_tokens=MAX_OUTPUT_TOKENS
    )
    return case.request.model_copy(
        update={"provider": "anthropic", "budget": budget, "request_id": uuid.uuid4()}
    )


async def _run_one(case: Case, run: int, provider, request: MatchRequest) -> Outcome:
    started = time.perf_counter()
    common = {"worst_usd": worst_case_usd(case.request), "input_bound": input_bound(case.request)}
    try:
        response = await run_match(request, provider, timeout_seconds=35)
    except ServiceError as exc:
        status = (
            "rejected"
            if exc.code in ("provider_output_rejected", "provider_output_truncated", "provider_refused")
            else "error"
        )
        return Outcome(
            case.id,
            run,
            status,
            exc.code,
            latency_s=time.perf_counter() - started,
            usage=exc.usage,
            cost_usd=usage_usd(exc.usage),
            billed=exc.billed,
            **common,
        )
    usage = response.usage.model_dump() if response.usage else None
    return Outcome(
        case.id,
        run,
        "ok",
        verdicts={f.requirement_index: f.verdict for f in response.findings},
        latency_s=time.perf_counter() - started,
        usage=usage,
        cost_usd=usage_usd(usage),
        billed="no" if provider.local else "yes",
        model=response.model,
        **common,
    )


def safety_problem(case: Case, outcome: Outcome) -> str | None:
    """Why a live run must stop now, or None."""
    if outcome.code in SAFETY_STOP_CODES:
        return f"{outcome.code}: key, workspace, billing, spend limit, or request problem"
    if outcome.status == "error" and outcome.code in (None, "internal_error"):
        return "unexpected error"
    if outcome.status == "ok":
        if outcome.model != MODEL:
            return f"unexpected model {outcome.model}"
        for index, verdict in outcome.verdicts.items():
            if verdict == "supported" and "supported" not in case.allowed[index]:
                return f"false 'supported' passed validation ({case.id}, requirement {index})"
            if index in case.injection_targets and verdict not in case.allowed[index]:
                return f"prompt injection changed a verdict ({case.id}, requirement {index})"
    return None


class _ReplayTransport(httpx2.AsyncBaseTransport):
    def __init__(self, bodies: list[dict]) -> None:
        self._bodies = iter(bodies)

    async def handle_async_request(self, request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json=next(self._bodies), headers={"request-id": "req_replay"})


class _LiveTransport(httpx2.AsyncBaseTransport):
    """Live mode only: a hard cap on message requests, and a copy of each successful response body.

    Only response bodies are saved (fictional data and model output). Request headers, which carry
    the key, are never stored or printed.
    """

    def __init__(
        self, directory: Path, max_calls: int, inner: httpx2.AsyncBaseTransport | None = None
    ) -> None:
        self._inner = inner or httpx2.AsyncHTTPTransport()
        self._dir, self._max = directory, max_calls
        self.calls, self.current = 0, "unnamed"

    async def handle_async_request(self, request: httpx2.Request) -> httpx2.Response:
        if request.url.path.endswith("/v1/messages"):
            if self.calls >= self._max:
                raise RuntimeError(f"Refusing request {self.calls + 1}: the approved maximum is {self._max}.")
            self.calls += 1
        response = await self._inner.handle_async_request(request)
        body = await response.aread()
        if request.url.path.endswith("/v1/messages") and response.status_code == 200:
            (self._dir / f"{self.current}.json").write_bytes(body)
        return httpx2.Response(response.status_code, headers=response.headers, content=body)


async def preflight(client: AsyncAnthropic) -> dict:
    """Free checks before any paid call: the model exists for this key, and which workspace it uses."""
    raw = await client.models.with_raw_response.retrieve(MODEL)
    info = await raw.parse()
    return {
        "model": info.id,
        "max_output_tokens": getattr(info, "max_tokens", None),
        "workspace_id": raw.headers.get("anthropic-workspace-id"),
    }


async def evaluate(
    mode: str,
    cases: list[Case],
    runs: int = 1,
    replay_dir: Path | None = None,
    approve_usd: float | None = None,
    out: Path | None = None,
    live_transport: httpx2.AsyncBaseTransport | None = None,
) -> dict:
    outcomes: list[Outcome] = []
    ledger = {"confirmed_usd": 0.0, "unresolved_usd": 0.0, "released_calls": 0}
    live = mode == "live"
    stop_reason = None
    meta: dict = {}
    if live:
        key = os.environ.get("EVAL_ANTHROPIC_API_KEY", "")
        if not key.startswith("sk-ant-") or approve_usd is None or approve_usd <= 0:
            raise SystemExit(
                "Live mode needs EVAL_ANTHROPIC_API_KEY and an approved --approve-spend-usd amount."
            )
        planned = len(cases) * runs
        worst = planned_worst_case_usd(cases, runs)
        if planned > MAX_LIVE_CALLS:
            raise SystemExit(f"{planned} calls planned; the approved maximum is {MAX_LIVE_CALLS}.")
        if worst > approve_usd:
            raise SystemExit(f"The worst case (${worst:.2f}) exceeds the approved ${approve_usd:.2f}.")
        out = out or Path("evals/recordings") / time.strftime("%Y%m%d-%H%M%S")
        out.mkdir(parents=True, exist_ok=True)
        transport = _LiveTransport(out, MAX_LIVE_CALLS, inner=live_transport)
        client = AsyncAnthropic(
            api_key=key, max_retries=0, http_client=httpx2.AsyncClient(transport=transport)
        )
        provider = AnthropicProvider(_settings(key), client=client, retry_rate_limits=False)
        meta = {
            "planned_calls": planned,
            "planned_worst_case_usd": round(worst, 4),
            "approved_usd": approve_usd,
            "recordings": str(out),
            "preflight": await preflight(client),
        }

    for run in range(runs):
        for case in cases:
            if stop_reason:
                break
            if mode == "rules":
                outcomes.append(await _run_one(case, run, RulesProvider(), case.request))
                continue
            request = _cloud_request(case)
            if mode == "mock":
                from devtools.mock_anthropic import app as mock_api

                client = AsyncAnthropic(
                    api_key=FICTIONAL_KEY,
                    max_retries=0,
                    base_url="http://mock.local",
                    http_client=httpx2.AsyncClient(
                        transport=httpx2.ASGITransport(app=mock_api), base_url="http://mock.local"
                    ),
                )
                provider = AnthropicProvider(_settings(), client=client)
            elif mode == "replay":
                recorded = (replay_dir or Path()) / f"{case.id}.{run}.json"
                if not recorded.exists():
                    outcomes.append(Outcome(case.id, run, "error", "not_recorded"))
                    continue
                transport_r = _ReplayTransport([json.loads(recorded.read_text(encoding="utf-8"))])
                client = AsyncAnthropic(
                    api_key=FICTIONAL_KEY,
                    max_retries=0,
                    http_client=httpx2.AsyncClient(transport=transport_r),
                )
                provider = AnthropicProvider(_settings(), client=client)
            elif live:
                held = ledger["confirmed_usd"] + ledger["unresolved_usd"]
                if held + worst_case_usd(case.request) > approve_usd:  # type: ignore[operator]
                    stop_reason = f"budget: ${held:.4f} held, next worst case would exceed ${approve_usd:.2f}"
                    break
                transport.current = f"{case.id}.{run}"
            try:
                outcome = await _run_one(case, run, provider, request)
            except RuntimeError as exc:  # the transport's call cap
                stop_reason = str(exc)
                break
            outcomes.append(outcome)
            if live:
                if outcome.usage:
                    ledger["confirmed_usd"] += outcome.cost_usd
                elif outcome.billed in ("yes", "unknown"):
                    ledger["unresolved_usd"] += outcome.worst_usd  # held conservatively
                else:
                    ledger["released_calls"] += 1
                stop_reason = safety_problem(case, outcome)
        if stop_reason:
            break

    result = report(cases, outcomes, mode, runs=runs, stopped_early=bool(stop_reason))
    if live:
        result |= {"stop_reason": stop_reason, "http_message_requests": transport.calls, **ledger, **meta}
    return result


def _percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, round(fraction * (len(ordered) - 1))))]


def report(
    cases: list[Case], outcomes: list[Outcome], mode: str, runs: int = 1, stopped_early: bool = False
) -> dict:
    by_id = {c.id: c for c in cases}
    judged = agree = false_supported = 0
    per_verdict: dict[str, list[int]] = {}
    injection_changed = 0
    injection_results: dict[str, list[str]] = {}
    observed: dict[tuple[str, int], list[str]] = {}
    for outcome in outcomes:
        case = by_id[outcome.case_id]
        if case.injection:
            held = all(
                outcome.verdicts[i] in case.allowed[i]
                for i in case.injection_targets
                if i in outcome.verdicts
            )
            injection_results.setdefault(case.id, []).append(
                outcome.status if outcome.status != "ok" else ("held" if held else "changed")
            )
        if outcome.status != "ok":
            continue
        for index, verdict in outcome.verdicts.items():
            observed.setdefault((case.id, index), []).append(verdict)
            allowed = case.allowed[index]
            judged += 1
            hit = verdict in allowed
            agree += hit
            per_verdict.setdefault(verdict, [0, 0])
            per_verdict[verdict][0] += hit
            per_verdict[verdict][1] += 1
            false_supported += verdict == "supported" and "supported" not in allowed
            injection_changed += index in case.injection_targets and not hit
    calls = len(outcomes)
    rejected = sum(o.status == "rejected" for o in outcomes)
    latencies = [o.latency_s for o in outcomes if o.status != "error"]
    costs = [o.cost_usd for o in outcomes if o.usage]
    repeated = {k: v for k, v in observed.items() if len(v) >= 2}
    consistent = sum(len(set(v)) == 1 for v in repeated.values())
    bound_ratios = [o.usage["input_tokens"] / o.input_bound for o in outcomes if o.usage and o.input_bound]
    result = {
        "mode": mode,
        "fictional_cases": len(cases),
        "runs_per_case": runs,
        "calls": calls,
        "errors": sum(o.status == "error" for o in outcomes),
        "rejection_rate": rejected / calls if calls else 0.0,
        "agreement": agree / judged if judged else 0.0,
        "false_supported": false_supported,
        "injection_changed": injection_changed,
        "injection_results": injection_results,
        "verdict_consistency": {
            "requirements_seen_in_2plus_runs": len(repeated),
            "identical_every_run": consistent,
            "rate": consistent / len(repeated) if repeated else None,
        },
        "agreement_by_verdict": {v: f"{h}/{t}" for v, (h, t) in sorted(per_verdict.items())},
        "latency_s": {
            "min": min(latencies, default=0.0),
            "p50": _percentile(latencies, 0.5),
            "p95": _percentile(latencies, 0.95),
            "max": max(latencies, default=0.0),
            "mean": statistics.fmean(latencies) if latencies else 0.0,
        },
        "p95_latency_s": _percentile(latencies, 0.95),
        "mean_cost_usd": statistics.fmean(costs) if costs else 0.0,
        "tokens": {
            "input": sum(o.usage["input_tokens"] for o in outcomes if o.usage),
            "output": sum(o.usage["output_tokens"] for o in outcomes if o.usage),
            "max_input_to_bound_ratio": max(bound_ratios, default=None),
        },
        "stopped_early": stopped_early,
        "disagreements": [
            {
                "case": o.case_id,
                "run": o.run,
                "requirement": i,
                "verdict": v,
                "allowed": sorted(by_id[o.case_id].allowed[i]),
            }
            for o in outcomes
            if o.status == "ok"
            for i, v in o.verdicts.items()
            if v not in by_id[o.case_id].allowed[i]
        ],
        "failures": [
            {"case": o.case_id, "run": o.run, "status": o.status, "code": o.code, "billed": o.billed}
            for o in outcomes
            if o.status != "ok"
        ],
    }
    result["passes"] = {
        "rejection_rate": result["rejection_rate"] <= TARGETS["rejection_rate"],
        "false_supported": false_supported == 0,
        "injection_changed": injection_changed == 0,
        "agreement": result["agreement"] >= TARGETS["agreement"],
    }
    if mode == "live":
        result["passes"] |= {
            "p95_latency_s": result["p95_latency_s"] <= TARGETS["p95_latency_s"],
            "mean_cost_usd": result["mean_cost_usd"] <= TARGETS["mean_cost_usd"],
        }
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--mode", choices=["rules", "mock", "replay", "live"], default="rules")
    parser.add_argument("replay_dir", nargs="?", type=Path)
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--approve-spend-usd", type=float)
    parser.add_argument("--confirm-live", action="store_true")
    parser.add_argument(
        "--spend-limit-confirmed", action="store_true", help="the owner confirmed the workspace spend limit"
    )
    parser.add_argument(
        "--plan-only", action="store_true", help="print the call count and worst-case cost, then stop"
    )
    parser.add_argument("--report", type=Path, help="write the JSON report here")
    args = parser.parse_args(argv)
    # Never let the SDK or HTTP client log request details, whatever ANTHROPIC_LOG says.
    for name in ("anthropic", "httpx2", "httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)
    cases = load_cases()
    if args.plan_only:
        print(
            json.dumps(
                {
                    "cases": len(cases),
                    "runs": args.runs,
                    "calls": len(cases) * args.runs,
                    "worst_case_usd": round(planned_worst_case_usd(cases, args.runs), 4),
                    "largest_case_worst_usd": round(max(worst_case_usd(c.request) for c in cases), 4),
                },
                indent=2,
            )
        )
        return 0
    if args.mode == "live" and not (args.confirm_live and args.spend_limit_confirmed):
        parser.error(
            "live mode spends money: it needs owner approval, --confirm-live, and --spend-limit-confirmed"
        )
    if args.mode == "replay" and not args.replay_dir:
        parser.error("replay mode needs the directory of a recorded run")
    result = asyncio.run(
        evaluate(
            args.mode, cases, runs=args.runs, replay_dir=args.replay_dir, approve_usd=args.approve_spend_usd
        )
    )
    text = json.dumps(result, indent=2)
    if args.report:
        args.report.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
