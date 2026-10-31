"""The evaluation harness: fictional-only data, scoring, replay, and the live-mode guards.

Live mode is exercised against scripted transports only: no network, no real key, no cost.
"""

import json

import httpx2
import pytest

from evals.run_eval import (
    MAX_LIVE_CALLS,
    Outcome,
    _LiveTransport,
    evaluate,
    input_bound,
    load_cases,
    main,
    planned_worst_case_usd,
    report,
    worst_case_usd,
)
from tests.conftest import FAKE_ANTHROPIC_KEY


def test_every_case_is_fictional_and_valid():
    cases = load_cases()
    assert len(cases) == 16
    assert any(c.injection for c in cases)
    largest = max(cases, key=lambda c: len(c.request.requirements))
    assert (len(largest.request.requirements), len(largest.request.evidence)) == (50, 200)
    for case in cases:
        assert set(case.allowed) == {r.index for r in case.request.requirements}


def test_unmarked_data_is_refused(tmp_path):
    path = tmp_path / "cases.json"
    path.write_text(
        json.dumps(
            {
                "fictional": True,
                "as_of_month": "2026-10",
                "cases": [{"id": "x", "requirements": [], "evidence": []}],
            }
        )
    )
    with pytest.raises(ValueError, match="not marked fictional"):
        load_cases(path)
    path.write_text(json.dumps({"as_of_month": "2026-10", "cases": []}))
    with pytest.raises(ValueError, match="marked fictional"):
        load_cases(path)


async def test_rules_baseline_runs_offline_without_false_support():
    result = await evaluate("rules", load_cases())
    assert result["calls"] == 16 and result["errors"] == 0
    assert (result["false_supported"], result["injection_changed"]) == (0, 0)
    # Regression: "Expert-level Java" with a beginner skill was "supported" before the level check.
    assert not any(d["case"] == "level-conflict" for d in result["disagreements"])
    # Known keyword limits that remain: synonyms and role-to-requirement judgment.
    assert {d["case"] for d in result["disagreements"]} == {"synonym-rules-misses", "duration-bait"}


def test_scoring_counts_false_support_injections_rejections_and_consistency():
    cases = load_cases(include_large=False)
    outcomes = [
        Outcome("exact-skill", 0, "ok", verdicts={0: "supported"}),
        Outcome("exact-skill", 1, "ok", verdicts={0: "possible"}),  # inconsistent across runs
        Outcome("project-is-not-employment", 0, "ok", verdicts={0: "supported"}),  # false support
        Outcome(
            "injection-in-requirement", 0, "ok", verdicts={0: "supported", 1: "supported"}
        ),  # injection worked
        Outcome("degree-match", 0, "rejected", "provider_output_rejected"),
    ]
    result = report(cases, outcomes, "replay", runs=2)
    assert result["false_supported"] == 2
    assert result["injection_changed"] == 1
    assert result["injection_results"] == {"injection-in-requirement": ["changed"]}
    assert result["rejection_rate"] == 0.2
    assert result["verdict_consistency"] == {
        "requirements_seen_in_2plus_runs": 1,
        "identical_every_run": 0,
        "rate": 0.0,
    }
    assert not any(result["passes"].values())


async def test_replay_scores_recorded_responses_through_the_strict_validators(tmp_path):
    cases = [c for c in load_cases(include_large=False) if c.id in ("exact-skill", "empty-education")]
    good = {
        "findings": [
            {
                "requirement_index": 0,
                "verdict": "supported",
                "explanation": "You list SolidWorks.",
                "citations": [{"evidence_id": cases[0].request.evidence[0].id, "quote": "SolidWorks"}],
                "caveats": [],
            }
        ]
    }
    overreach = {
        "findings": [
            {
                "requirement_index": 0,
                "verdict": "gap",
                "explanation": "No degree.",
                "citations": [],
                "caveats": [],
            }
        ]
    }
    for case, payload in ((cases[0], good), (cases[1], overreach)):
        message = {
            "id": "msg",
            "type": "message",
            "role": "assistant",
            "model": "claude-sonnet-5-5",
            "content": [{"type": "text", "text": json.dumps(payload)}],
            "stop_reason": "end_turn",
            "stop_sequence": None,
            "usage": {"input_tokens": 900, "output_tokens": 100},
        }
        (tmp_path / f"{case.id}.0.json").write_text(json.dumps(message))
    result = await evaluate("replay", cases, replay_dir=tmp_path)
    assert result["calls"] == 2
    assert result["failures"] == [
        {
            "case": "empty-education",
            "run": 0,
            "status": "rejected",
            "code": "provider_output_rejected",
            "billed": "yes",
        }
    ]
    assert result["agreement"] == 1.0
    assert result["mean_cost_usd"] == pytest.approx((900 * 2 + 100 * 10) / 1_000_000)


# --- Live mode: guards, simulated with scripted transports ---------------------------------------


def test_the_approved_plan_fits_the_four_dollar_cap():
    cases = load_cases()
    assert len(cases) * 3 == MAX_LIVE_CALLS == 48
    worst = planned_worst_case_usd(cases, 3)
    assert 3.0 < worst <= 4.0
    # Each call's bound: input bytes plus framing (a token is never smaller than one byte), plus the
    # full 6,000-token output allowance, at $2 and $10 per million tokens.
    case = cases[0]
    assert worst_case_usd(case.request) == pytest.approx(
        (input_bound(case.request) * 2 + 6_000 * 10) / 1_000_000
    )


async def test_live_mode_refuses_without_a_key_approval_or_confirmations(monkeypatch):
    with pytest.raises(SystemExit, match="EVAL_ANTHROPIC_API_KEY"):
        await evaluate("live", load_cases(), approve_usd=5.0)
    monkeypatch.setenv("EVAL_ANTHROPIC_API_KEY", FAKE_ANTHROPIC_KEY)
    with pytest.raises(SystemExit, match="approve-spend-usd"):
        await evaluate("live", load_cases())
    with pytest.raises(SystemExit):
        main(["--mode", "live", "--approve-spend-usd", "4", "--confirm-live"])  # spend limit not confirmed
    with pytest.raises(SystemExit):
        main(["--mode", "live", "--approve-spend-usd", "4", "--spend-limit-confirmed"])  # live not confirmed


async def test_live_mode_refuses_plans_over_the_approved_calls_or_amount(monkeypatch, tmp_path):
    monkeypatch.setenv("EVAL_ANTHROPIC_API_KEY", FAKE_ANTHROPIC_KEY)
    cases = load_cases()
    with pytest.raises(SystemExit, match="approved maximum is 48"):
        await evaluate("live", cases, runs=4, approve_usd=100, out=tmp_path)
    with pytest.raises(SystemExit, match="exceeds the approved"):
        await evaluate(
            "live", cases, runs=3, approve_usd=planned_worst_case_usd(cases, 3) - 0.01, out=tmp_path
        )


def _scripted(status: int = 200, error: str | None = None, headers: dict | None = None):
    """A scripted API: free model lookups, and insufficient_information for every requirement."""
    calls = {"messages": 0}

    def handler(request: httpx2.Request) -> httpx2.Response:
        if request.method == "GET":
            body = {
                "type": "model",
                "id": "claude-sonnet-5-5",
                "display_name": "x",
                "created_at": "2026-09-01T00:00:00Z",
            }
            return httpx2.Response(200, json=body, headers={"anthropic-workspace-id": "wrkspc_test"})
        calls["messages"] += 1
        if status != 200:
            return httpx2.Response(
                status,
                json={"type": "error", "error": {"type": error, "message": "x"}},
                headers=headers or {},
            )
        content = json.loads(request.content)["messages"][0]["content"]
        data = json.loads(content.removeprefix("<data>\n").removesuffix("\n</data>"))
        findings = [
            {
                "requirement_index": r["index"],
                "verdict": "insufficient_information",
                "explanation": "Not enough information.",
                "citations": [],
                "caveats": [],
            }
            for r in data["requirements"]
        ]
        message = {
            "id": "m",
            "type": "message",
            "role": "assistant",
            "model": "claude-sonnet-5-5",
            "content": [{"type": "text", "text": json.dumps({"findings": findings})}],
            "stop_reason": "end_turn",
            "stop_sequence": None,
            "usage": {"input_tokens": 1000, "output_tokens": 200},
        }
        return httpx2.Response(200, json=message, headers={"request-id": "req_t"})

    return httpx2.MockTransport(handler), calls


async def test_simulated_live_run_makes_at_most_48_requests_and_confirms_costs_from_usage(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("EVAL_ANTHROPIC_API_KEY", FAKE_ANTHROPIC_KEY)
    transport, calls = _scripted()
    result = await evaluate(
        "live", load_cases(), runs=3, approve_usd=4.0, out=tmp_path, live_transport=transport
    )
    assert result["stop_reason"] is None
    assert calls["messages"] == result["http_message_requests"] == result["calls"] == 48
    assert result["confirmed_usd"] == pytest.approx(48 * (1000 * 2 + 200 * 10) / 1_000_000)
    assert result["unresolved_usd"] == 0
    assert result["preflight"] == {
        "model": "claude-sonnet-5-5",
        "max_output_tokens": None,
        "workspace_id": "wrkspc_test",
    }
    assert result["verdict_consistency"]["rate"] == 1.0
    assert len(list(tmp_path.glob("*.json"))) == 48
    everything = json.dumps(result) + "".join(p.read_text() for p in tmp_path.glob("*.json"))
    assert FAKE_ANTHROPIC_KEY not in everything


async def test_uncertain_charges_are_held_at_their_worst_case_and_never_retried(monkeypatch, tmp_path):
    monkeypatch.setenv("EVAL_ANTHROPIC_API_KEY", FAKE_ANTHROPIC_KEY)
    transport, calls = _scripted(status=529, error="overloaded_error")
    cases = load_cases()
    result = await evaluate("live", cases, runs=1, approve_usd=4.0, out=tmp_path, live_transport=transport)
    # Five overloads open the circuit breaker; the sixth case is refused without a request, and the
    # run stops. Each overload is held at its worst case, because its billing is uncertain.
    assert calls["messages"] == 5
    assert result["stop_reason"].startswith("provider_unavailable")
    assert result["confirmed_usd"] == 0
    assert result["unresolved_usd"] == pytest.approx(sum(worst_case_usd(c.request) for c in cases[:5]))


@pytest.mark.parametrize(
    ("status", "error", "headers"),
    [
        (401, "authentication_error", None),
        (400, "invalid_request_error", None),  # also how a Console spend limit is reported
        (429, "rate_limit_error", {"retry-after": "1"}),
    ],
)
async def test_key_billing_limit_and_rate_errors_stop_the_run_without_retrying(
    monkeypatch, tmp_path, status, error, headers
):
    monkeypatch.setenv("EVAL_ANTHROPIC_API_KEY", FAKE_ANTHROPIC_KEY)
    transport, calls = _scripted(status=status, error=error, headers=headers)
    result = await evaluate(
        "live", load_cases(), runs=3, approve_usd=4.0, out=tmp_path, live_transport=transport
    )
    assert result["stopped_early"] and "problem" in result["stop_reason"]
    assert calls["messages"] == 1


async def test_a_false_supported_verdict_stops_the_run(monkeypatch, tmp_path):
    from devtools.mock_anthropic import app as mock_api

    monkeypatch.setenv("EVAL_ANTHROPIC_API_KEY", FAKE_ANTHROPIC_KEY)
    # The mock calls "Expert-level Java" supported from a beginner skill: a false "supported".
    result = await evaluate(
        "live",
        load_cases(),
        runs=3,
        approve_usd=4.0,
        out=tmp_path,
        live_transport=httpx2.ASGITransport(app=mock_api),
    )
    assert "false 'supported'" in result["stop_reason"] and "level-conflict" in result["stop_reason"]
    assert result["http_message_requests"] < 48


async def test_the_transport_refuses_message_requests_beyond_the_cap(tmp_path):
    transport, _ = _scripted()
    live = _LiveTransport(tmp_path, max_calls=2, inner=transport)
    body = {"messages": [{"content": "<data>\n" + json.dumps({"requirements": []}) + "\n</data>"}]}
    async with httpx2.AsyncClient(transport=live) as client:
        await client.get("https://api.example.test/v1/models/x")  # model lookups are not counted
        for _ in range(2):
            await client.post("https://api.example.test/v1/messages", json=body)
        with pytest.raises(RuntimeError, match="approved maximum is 2"):
            await client.post("https://api.example.test/v1/messages", json=body)
