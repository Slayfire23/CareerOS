"""Evaluation harness for requirement analysis. Fictional data only (evals/cases.json).

Modes (default: rules):
  rules          deterministic baseline, offline
  mock           the Anthropic provider end to end against the local mock API, offline
  replay DIR     recorded Messages API responses (from a live run) through the real parser and
                 strict validators, offline; this is how a live run is re-scored for free
  live           real Claude Sonnet 5.5 calls. NOT for routine use: requires separate owner
                 approval, EVAL_ANTHROPIC_API_KEY from a dedicated evaluation workspace with its own
                 Console spend limit, --approve-spend-usd, and --confirm-live. Stops before any call
                 that could push the worst-case total over the approved amount.

    uv run python -m evals.run_eval --mode rules
    uv run python -m evals.run_eval --mode replay evals/recordings/<run>
"""

import argparse
import asyncio
import json
import os
import secrets
import statistics
import sys
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
FICTIONAL_KEY = "sk-ant-test.not.a.real.key.000000000000000000"
TARGETS = {"rejection_rate": 0.05, "agreement": 0.80, "p95_latency_s": 30.0, "mean_cost_usd": 0.06}


@dataclass
class Case:
    id: str
    request: MatchRequest
    allowed: dict[int, set[str]]
    injection: bool = False


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
            {k: v for k, v in r.items() if k != "allowed"} | {"index": i}
            for i, r in enumerate(raw["requirements"])
        ]
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
        cases.append(Case(raw["id"], request, allowed, raw.get("injection", False)))
    if include_large:
        cases.append(_large_case(data["as_of_month"]))
    return cases


def worst_case_usd(request: MatchRequest) -> float:
    bound = prompt_size_bound(build_user_message(request))
    return (bound * PRICE_PER_MTOK["input"] + MAX_OUTPUT_TOKENS * PRICE_PER_MTOK["output"]) / 1_000_000


def usage_usd(usage: dict | None) -> float:
    if not usage:
        return 0.0
    return (
        usage["input_tokens"] * PRICE_PER_MTOK["input"] + usage["output_tokens"] * PRICE_PER_MTOK["output"]
    ) / 1_000_000


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
    bound = prompt_size_bound(build_user_message(case.request))
    budget = TokenBudget(max_input_tokens=bound + 1_000, max_output_tokens=MAX_OUTPUT_TOKENS)
    return case.request.model_copy(
        update={"provider": "anthropic", "budget": budget, "request_id": uuid.uuid4()}
    )


async def _run_one(case: Case, run: int, provider, request: MatchRequest) -> Outcome:
    started = time.perf_counter()
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
    )


class _ReplayTransport(httpx2.AsyncBaseTransport):
    def __init__(self, bodies: list[dict]) -> None:
        self._bodies = iter(bodies)

    async def handle_async_request(self, request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json=next(self._bodies), headers={"request-id": "req_replay"})


class _RecordingTransport(httpx2.AsyncBaseTransport):
    """Live mode only: forwards to Anthropic and saves each response body for later replay."""

    def __init__(self, directory: Path) -> None:
        self._inner, self._dir, self.current = httpx2.AsyncHTTPTransport(), directory, "unnamed"

    async def handle_async_request(self, request: httpx2.Request) -> httpx2.Response:
        response = await self._inner.handle_async_request(request)
        body = await response.aread()
        if response.status_code == 200:
            (self._dir / f"{self.current}.json").write_bytes(body)
        return httpx2.Response(response.status_code, headers=response.headers, content=body)


async def evaluate(
    mode: str,
    cases: list[Case],
    runs: int = 1,
    replay_dir: Path | None = None,
    approve_usd: float | None = None,
    out: Path | None = None,
) -> dict:
    outcomes: list[Outcome] = []
    spent = 0.0
    recorder = None
    if mode == "live":
        key = os.environ.get("EVAL_ANTHROPIC_API_KEY", "")
        if not key.startswith("sk-ant-") or approve_usd is None or approve_usd <= 0:
            raise SystemExit(
                "Live mode needs EVAL_ANTHROPIC_API_KEY and an approved --approve-spend-usd amount."
            )
        out = out or Path("evals/recordings") / time.strftime("%Y%m%d-%H%M%S")
        out.mkdir(parents=True, exist_ok=True)
        recorder = _RecordingTransport(out)
        client = AsyncAnthropic(
            api_key=key, max_retries=0, http_client=httpx2.AsyncClient(transport=recorder)
        )
        provider = AnthropicProvider(_settings(key), client=client)

    for run in range(runs):
        for case in cases:
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
                transport = _ReplayTransport([json.loads(recorded.read_text(encoding="utf-8"))])
                client = AsyncAnthropic(
                    api_key=FICTIONAL_KEY, max_retries=0, http_client=httpx2.AsyncClient(transport=transport)
                )
                provider = AnthropicProvider(_settings(), client=client)
            elif mode == "live":
                # Hard stop: never start a call whose worst case could exceed the approved amount.
                if spent + worst_case_usd(request) > approve_usd:  # type: ignore[operator]
                    print(
                        f"Stopping before {case.id} run {run}: worst case would exceed ${approve_usd:.2f}.",
                        file=sys.stderr,
                    )
                    return report(cases, outcomes, mode, stopped_early=True)
                recorder.current = f"{case.id}.{run}"  # type: ignore[union-attr]
            outcome = await _run_one(case, run, provider, request)
            spent += (
                outcome.cost_usd
                if outcome.usage
                else (worst_case_usd(request) if mode == "live" and outcome.status == "error" else 0.0)
            )
            outcomes.append(outcome)
    return report(cases, outcomes, mode, spent_usd=spent if mode == "live" else None)


def report(
    cases: list[Case],
    outcomes: list[Outcome],
    mode: str,
    stopped_early: bool = False,
    spent_usd: float | None = None,
) -> dict:
    by_id = {c.id: c for c in cases}
    judged = agree = false_supported = 0
    per_verdict: dict[str, list[int]] = {}
    injection_changed = 0
    for outcome in outcomes:
        case = by_id[outcome.case_id]
        if outcome.status != "ok":
            continue
        for index, verdict in outcome.verdicts.items():
            allowed = case.allowed[index]
            judged += 1
            hit = verdict in allowed
            agree += hit
            per_verdict.setdefault(verdict, [0, 0])
            per_verdict[verdict][0] += hit
            per_verdict[verdict][1] += 1
            false_supported += verdict == "supported" and "supported" not in allowed
            injection_changed += case.injection and not hit
    calls = len(outcomes)
    rejected = sum(o.status == "rejected" for o in outcomes)
    latencies = sorted(o.latency_s for o in outcomes if o.status != "error")
    costs = [o.cost_usd for o in outcomes if o.usage]
    result = {
        "mode": mode,
        "fictional_cases": len(cases),
        "calls": calls,
        "errors": sum(o.status == "error" for o in outcomes),
        "rejection_rate": rejected / calls if calls else 0.0,
        "agreement": agree / judged if judged else 0.0,
        "false_supported": false_supported,
        "injection_changed": injection_changed,
        "agreement_by_verdict": {v: f"{h}/{t}" for v, (h, t) in sorted(per_verdict.items())},
        "p95_latency_s": latencies[max(0, int(len(latencies) * 0.95) - 1)] if latencies else 0.0,
        "mean_cost_usd": statistics.fmean(costs) if costs else 0.0,
        "spent_usd": spent_usd,
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
            {"case": o.case_id, "run": o.run, "status": o.status, "code": o.code}
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
    parser.add_argument("--report", type=Path, help="write the JSON report here")
    args = parser.parse_args(argv)
    if args.mode == "live" and not args.confirm_live:
        parser.error("live mode spends money: it needs separate owner approval and --confirm-live")
    if args.mode == "replay" and not args.replay_dir:
        parser.error("replay mode needs the directory of a recorded run")
    result = asyncio.run(
        evaluate(
            args.mode,
            load_cases(),
            runs=args.runs,
            replay_dir=args.replay_dir,
            approve_usd=args.approve_spend_usd,
        )
    )
    text = json.dumps(result, indent=2)
    if args.report:
        args.report.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
