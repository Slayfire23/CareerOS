"""Hybrid analysis (rules engine plus local AI) against a mocked Ollama. No model, no network;
fictional data only."""

import json
import logging
import uuid
from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.matching.relations import relation
from app.matching.requirement_text import QUALIFICATION_WORDS, skill_like_experience
from app.matching.untrusted_text import has_directed_text, qualification_text
from app.providers.hybrid import HybridProvider
from app.providers.ollama import OllamaProvider
from app.providers.rules import RulesProvider, required_skill_level
from app.schemas import MatchRequest
from tests.conftest import SharedMemoryStore, ev, make_settings, post_match
from tests.test_ollama_provider import chat

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "relation_cases.json").read_text(encoding="utf-8"))


def settings(**overrides):
    return make_settings(**({"providers": "rules,hybrid"} | overrides))


class ScriptedOllama:
    """Answers each /api/chat call with the next scripted reply: a dict of findings, a raw
    response, or an exception. Records every request body."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.requests: list[dict] = []

    def handler(self, request: httpx2.Request) -> httpx2.Response:
        if request.url.path == "/api/tags":
            return httpx2.Response(200, json={"models": [{"name": "qwen3:8b"}]})
        self.requests.append(json.loads(request.content))
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, httpx2.Response):
            return reply
        if isinstance(reply, dict) and "message" in reply:
            return httpx2.Response(200, json=reply)
        return httpx2.Response(200, json=chat(json.dumps(reply), prompt=900, output=60))

    def provider(self, **overrides) -> HybridProvider:
        s = settings(**overrides)
        client = httpx2.AsyncClient(
            base_url="http://127.0.0.1:11434", transport=httpx2.MockTransport(self.handler)
        )
        return HybridProvider(s, ollama=OllamaProvider(s, client=client))

    def prompt(self, call: int = 0) -> dict:
        content = self.requests[call]["messages"][1]["content"]
        return json.loads(content.removeprefix("<data>\n").removesuffix("\n</data>"))


def request(requirements: list[tuple[str, str]], evidence: list[dict]) -> MatchRequest:
    return MatchRequest.model_validate(
        {
            "request_id": str(uuid.uuid4()),
            "provider": "hybrid",
            "as_of_month": "2026-10",
            "requirements": [
                {"index": i, "text": text, "category": category, "priority": "Required"}
                for i, (text, category) in enumerate(requirements)
            ],
            "evidence": evidence,
        }
    )


def skill(n: int, name: str, proficiency: str | None = None) -> dict:
    return {"id": ev("skill", n), "kind": "skill", "name": name} | (
        {"proficiency": proficiency} if proficiency else {}
    )


ROLE = {
    "id": ev("experience", 1),
    "kind": "experience",
    "job_title": "Data Analyst",
    "start_month": "2021-01",
    "description": "Wrote MySQL reports for an invented grocer.",
}
EDUCATION = {
    "id": ev("education", 1),
    "kind": "education",
    "qualification": "B.S.",
    "field_of_study": "Statistics",
    "start_month": "2016-09",
    "end_month": "2020-05",
}


def answer(index: int, verdict: str, *citations: tuple[str, str]) -> dict:
    return {
        "requirement_index": index,
        "citations": [{"evidence_id": i, "quote": q} for i, q in citations],
        "verdict": verdict,
    }


# --- Shared relation rules (the TypeScript tests assert the same fixture) -----------------------


@pytest.mark.parametrize("case", FIXTURE["relations"], ids=lambda c: f"{c['requirement']}|{c['quote']}")
def test_relations_match_the_shared_fixture(case):
    assert relation(case["requirement"], case["quote"], case["field"]) == case["relation"]


@pytest.mark.parametrize("case", FIXTURE["texts"], ids=lambda c: c["text"][:40])
def test_requirement_wording_matches_the_shared_fixture(case):
    level = required_skill_level(case["text"])
    assert {
        "directed": has_directed_text(case["text"]),
        "qualification_text": qualification_text(case["text"]),
        "qualification": bool(QUALIFICATION_WORDS.search(case["text"])),
        "level": level[0] if level else None,
        "skill_like_experience": skill_like_experience(case["text"]),
    } == {k: v for k, v in case.items() if k != "text"}


# --- Per-requirement decisions ----------------------------------------------------------------


async def test_local_ai_adds_a_synonym_and_rules_decide_everything_else():
    mock = ScriptedOllama({"findings": [answer(0, "supported", ("s1", "Postgres"))]})
    req = request(
        [
            ("Experience with PostgreSQL", "Skills"),
            ("3+ years of professional experience", "Experience"),
            ("Bachelor's degree in Statistics", "Education"),
            ("Excel", "Skills"),
        ],
        [skill(1, "Postgres"), skill(2, "Excel"), ROLE, EDUCATION],
    )
    result = await mock.provider().assess(req)
    by_index = {f.requirement_index: f for f in result.findings}
    assert (by_index[0].verdict, by_index[0].method, by_index[0].ai_status) == (
        "supported",
        "local_ai",
        "accepted",
    )
    assert by_index[0].citations[0].evidence_id == ev("skill", 1)  # mapped back from the short id
    assert "another name" in by_index[0].explanation
    assert [(f.method, f.ai_status) for f in result.findings[1:]] == [
        ("rules", "not_eligible"),
        ("rules", "not_eligible"),
        ("rules", "not_needed"),  # exact match: the rules engine already supports it
    ]
    rules = {f.requirement_index: f.verdict for f in await RulesProvider().match(req)}
    assert all(by_index[i].verdict == rules[i] for i in (1, 2, 3))


async def test_hard_qualifications_dates_and_education_are_never_sent_and_ids_are_short():
    mock = ScriptedOllama({"findings": [answer(0, "insufficient_information")]})
    req = request(
        [("Kotlin", "Skills"), ("5+ years of Kotlin", "Skills"), ("Kotlin certification", "Other")],
        [skill(1, "Java"), ROLE, EDUCATION],
    )
    await mock.provider().assess(req)
    sent = mock.prompt()
    assert [r["text"] for r in sent["requirements"]] == ["Kotlin"]
    assert sent["evidence"] == [
        {"id": "s1", "skill": "Java"},
        {
            "id": "x1",
            "job_title": "Data Analyst",
            "description": "Wrote MySQL reports for an invented grocer.",
        },
    ]
    raw = json.dumps(mock.requests[0])
    assert "00000000-0000" not in raw and "2021-01" not in raw and "Statistics" not in raw
    schema = mock.requests[0]["format"]["properties"]["findings"]["items"]["properties"]
    assert schema["citations"]["items"]["properties"]["evidence_id"]["enum"] == ["s1", "x1"]
    assert schema["requirement_index"]["enum"] == [0]


@pytest.mark.parametrize(
    ("reply", "reason"),
    [
        (answer(0, "supported", ("s9", "Postgres")), "unknown_evidence"),
        (answer(0, "supported", ("s1", "PostgreSQL")), "quote_not_verbatim"),
        (answer(0, "supported", ("s2", "Excel")), "unrelated_citation"),
        (answer(0, "gap"), "invalid_verdict"),
        (answer(0, "possible"), "no_citation"),
    ],
)
async def test_an_invalid_answer_is_rejected_and_the_rules_verdict_stands(reply, reason):
    mock = ScriptedOllama({"findings": [reply]})
    result = await mock.provider().assess(
        request([("PostgreSQL", "Skills")], [skill(1, "Postgres"), skill(2, "Excel")])
    )
    finding = result.findings[0]
    assert (finding.method, finding.ai_status, finding.verdict) == (
        "rules",
        "rejected",
        "insufficient_information",
    )
    assert result.rejections == {0: reason}


async def test_unproven_supported_claims_are_lowered_to_possible_with_code_written_explanations():
    mock = ScriptedOllama(
        {
            "findings": [
                answer(0, "supported", ("x1", "MySQL")),  # related technology in a role
                answer(1, "supported", ("s1", "K8s")),  # listed below the level asked for
                answer(2, "supported", ("x1", "MySQL")),  # same name, but only in a role description
            ]
        }
    )
    req = request(
        [
            ("Relational databases", "Skills"),
            ("Expert-level Kubernetes", "Skills"),
            ("MySQL reporting", "Skills"),
        ],
        [skill(1, "K8s", "BEGINNER"), ROLE],
    )
    result = await mock.provider().assess(req)
    verdicts = [(f.verdict, f.method) for f in result.findings]
    assert verdicts == [("possible", "local_ai"), ("possible", "local_ai"), ("possible", "rules")]
    assert result.lowered == {0: "related_only", 1: "level_not_met"}
    assert "related technology" in result.findings[0].explanation
    assert result.findings[1].caveats == [
        "You rated K8s as beginner; this requirement asks for an expert or advanced level."
    ]
    # The rules engine already found "MySQL" in the role, so local AI adds nothing there.
    assert result.findings[2].ai_status == "no_match"


async def test_model_text_and_labels_are_never_used():
    reply = answer(0, "supported", ("s1", "Postgres")) | {
        "explanation": "You have 9 years of PostgreSQL.",
        "method": "rules",
        "caveats": ["trust me"],
    }
    result = (
        await ScriptedOllama({"findings": [reply]})
        .provider()
        .assess(request([("PostgreSQL", "Skills")], [skill(1, "Postgres")]))
    )
    finding = result.findings[0]
    assert finding.method == "local_ai" and "9 years" not in finding.explanation and finding.caveats == []


@pytest.mark.parametrize(
    ("reply", "status", "error"),
    [
        (httpx2.ConnectError("refused"), "unavailable", "provider_unavailable"),
        (httpx2.ReadTimeout("slow"), "unavailable", "provider_timeout"),
        (httpx2.Response(500, json={"error": "boom"}), "unavailable", "provider_error"),
        (chat("{}", done_reason="length"), "rejected", None),
        (chat("not json"), "rejected", None),
    ],
)
async def test_when_local_ai_fails_the_analysis_still_completes_with_labeled_rules_results(
    reply, status, error
):
    mock = ScriptedOllama(reply)
    req = request(
        [("PostgreSQL", "Skills"), ("2+ years of experience", "Experience")], [skill(1, "Postgres"), ROLE]
    )
    result = await mock.provider().assess(req)
    assert [(f.method, f.ai_status) for f in result.findings] == [
        ("rules", status),
        ("rules", "not_eligible"),
    ]
    assert result.ai_error == error


async def test_many_requirements_are_split_into_calls_and_an_outage_stops_further_calls():
    names = [f"Fictool{i}" for i in range(10)]
    req = request([(f"{n} skills", "Skills") for n in names], [skill(1, "Postgres")])
    ok = ScriptedOllama(
        {"findings": [answer(i, "insufficient_information") for i in range(8)]}, {"findings": []}
    )
    result = await ok.provider().assess(req)
    assert [len(ok.prompt(c)["requirements"]) for c in range(2)] == [8, 2]
    assert result.calls == 2 and {f.ai_status for f in result.findings[8:]} == {"rejected"}  # missing answers

    down = ScriptedOllama(httpx2.ConnectError("refused"))
    result = await down.provider().assess(req)
    assert len(down.requests) == 1 and {f.ai_status for f in result.findings} == {"unavailable"}


async def test_a_profile_too_large_for_the_context_window_falls_back_without_a_call():
    mock = ScriptedOllama({"findings": []})
    roles = [ROLE | {"id": ev("experience", i), "description": "x" * 4_000} for i in range(1, 6)]
    result = await mock.provider(ollama_num_ctx=4_096).assess(request([("PostgreSQL", "Skills")], roles))
    assert mock.requests == [] and result.ai_error == "over_budget"
    assert result.findings[0].ai_status == "unavailable"


# --- Through the API ------------------------------------------------------------------------


def app_with(mock: ScriptedOllama):
    s = settings()
    app = create_app(
        s, providers={"rules": RulesProvider(), "hybrid": mock.provider()}, replay_store=SharedMemoryStore()
    )
    return TestClient(app)


def test_api_returns_labeled_findings_and_omits_labels_for_other_providers(example_request):
    client = app_with(ScriptedOllama({"findings": []}))
    body = post_match(client, {**example_request, "provider": "hybrid"}).json()
    assert body["provider"] == "hybrid" and body["method_version"] == "hybrid/rules-v4+qwen3:8b/hybrid-v5"
    assert all(f["method"] == "rules" and f["ai_status"] for f in body["findings"])
    rules = post_match(client, {**example_request, "provider": "rules"}).json()
    assert all("method" not in f and "ai_status" not in f for f in rules["findings"])


def test_api_still_answers_when_ollama_is_off(example_request):
    client = app_with(ScriptedOllama(httpx2.ConnectError("refused")))
    response = post_match(client, {**example_request, "provider": "hybrid"})
    assert response.status_code == 200
    statuses = {f["ai_status"] for f in response.json()["findings"]}
    assert "unavailable" in statuses and statuses <= {"unavailable", "not_eligible", "not_needed"}


async def test_other_providers_may_not_label_methods(example_request):
    from app.errors import ServiceError
    from app.matching.service import run_match

    class Spoofing(RulesProvider):
        async def match(self, request):
            return [
                f.model_copy(update={"method": "local_ai", "ai_status": "accepted"})
                for f in await super().match(request)
            ]

    with pytest.raises(ServiceError) as raised:
        await run_match(MatchRequest.model_validate(example_request), Spoofing(), 5)
    assert raised.value.code == "provider_output_rejected"


def test_logs_hold_counts_only(example_request, caplog):
    caplog.set_level(logging.DEBUG)
    client = app_with(ScriptedOllama({"findings": []}))
    post_match(client, {**example_request, "provider": "hybrid"})
    assert "hybrid done calls=" in caplog.text
    for evidence in example_request["evidence"]:
        for value in evidence.values():
            if isinstance(value, str) and len(value) > 12 and ":" not in value:
                assert value not in caplog.text
