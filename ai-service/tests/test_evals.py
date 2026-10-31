"""The evaluation harness: fictional-only data, scoring, replay, and the live-mode spend guards."""

import json

import pytest

from evals.run_eval import Outcome, evaluate, load_cases, main, report, worst_case_usd
from tests.conftest import FAKE_ANTHROPIC_KEY


def test_every_case_is_fictional_and_valid():
    cases = load_cases()
    assert len(cases) >= 15
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


async def test_rules_baseline_runs_offline_and_reports_its_known_limits():
    result = await evaluate("rules", load_cases())
    assert result["calls"] == 16 and result["errors"] == 0
    assert result["injection_changed"] == 0
    # Keyword rules ignore proficiency: "Expert-level Java" with a BEGINNER skill comes back "supported".
    assert {
        "case": "level-conflict",
        "run": 0,
        "requirement": 0,
        "verdict": "supported",
        "allowed": ["gap", "possible"],
    } in result["disagreements"]


def test_scoring_counts_false_support_injections_and_rejections():
    cases = load_cases(include_large=False)
    by_id = {c.id: c for c in cases}
    outcomes = [
        Outcome("exact-skill", 0, "ok", verdicts={0: "supported"}),
        Outcome("project-is-not-employment", 0, "ok", verdicts={0: "supported"}),  # false support
        Outcome(
            "injection-in-requirement", 0, "ok", verdicts={0: "supported", 1: "supported"}
        ),  # injection worked
        Outcome("degree-match", 0, "rejected", "provider_output_rejected"),
    ]
    result = report(list(by_id.values()), outcomes, "replay")
    assert result["false_supported"] == 2
    assert result["injection_changed"] == 1
    assert result["rejection_rate"] == 0.25
    assert result["passes"] == {
        "rejection_rate": False,
        "false_supported": False,
        "injection_changed": False,
        "agreement": False,
    }


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
        {"case": "empty-education", "run": 0, "status": "rejected", "code": "provider_output_rejected"}
    ]
    assert result["agreement"] == 1.0
    assert result["mean_cost_usd"] == pytest.approx((900 * 2 + 100 * 10) / 1_000_000)


async def test_live_mode_refuses_without_a_key_or_approved_amount(monkeypatch):
    with pytest.raises(SystemExit, match="EVAL_ANTHROPIC_API_KEY"):
        await evaluate("live", load_cases(), approve_usd=5.0)
    monkeypatch.setenv("EVAL_ANTHROPIC_API_KEY", FAKE_ANTHROPIC_KEY)
    with pytest.raises(SystemExit, match="approve-spend-usd"):
        await evaluate("live", load_cases())
    with pytest.raises(SystemExit):
        main(["--mode", "live", "--approve-spend-usd", "5"])  # no --confirm-live


async def test_live_mode_stops_before_a_call_that_could_exceed_the_approved_amount(monkeypatch, tmp_path):
    monkeypatch.setenv("EVAL_ANTHROPIC_API_KEY", FAKE_ANTHROPIC_KEY)
    monkeypatch.chdir(tmp_path)
    cases = load_cases(include_large=False)
    first = worst_case_usd(cases[0].request)
    result = await evaluate("live", cases, approve_usd=first / 2)  # less than one worst case: no call is made
    assert result["stopped_early"] is True and result["calls"] == 0
    assert 0.05 < first < 0.12  # a small case: about 7K input-token bound plus 6K output at verified prices
