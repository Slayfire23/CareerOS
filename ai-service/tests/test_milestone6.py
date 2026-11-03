"""Rules decided by the frozen Python engine (rules-v5). Authoritative behavior now lives in the
TypeScript engine; these stay until the Python rules are removed. Fictional data only."""

import uuid

import pytest

from app.matching.validate import required_months, stated_years
from app.providers.rules import RulesProvider
from app.schemas import MatchRequest
from tests.conftest import ev


def request(requirements: list[tuple[str, str]], evidence: list[dict], **extra) -> MatchRequest:
    return MatchRequest.model_validate(
        {
            "request_id": str(uuid.uuid4()),
            "provider": "assisted",
            "as_of_month": "2026-10",
            "requirements": [
                {"index": i, "text": text, "category": category, "priority": "Required"} | extra
                for i, (text, category) in enumerate(requirements)
            ],
            "evidence": evidence,
        }
    )


def skill(n: int, name: str) -> dict:
    return {"id": ev("skill", n), "kind": "skill", "name": name}


def role(
    n: int, description: str, title: str = "Analyst", start: str = "2021-01", end: str | None = None
) -> dict:
    return {
        "id": ev("experience", n),
        "kind": "experience",
        "job_title": title,
        "start_month": start,
        "description": description,
    } | ({"end_month": end} if end else {})


def degree(qualification: str, field: str | None = None) -> dict:
    return {
        "id": ev("education", 1),
        "kind": "education",
        "qualification": qualification,
        "field_of_study": field,
        "start_month": "2016-09",
        "end_month": "2020-05",
    }


async def rules_for(req: MatchRequest):
    return {f.requirement_index: f for f in await RulesProvider().match(req)}


MIXED = [
    ("Kubernetes administration", "Skills"),
    ("Tableau", "Skills"),
    ("3+ years of professional experience", "Experience"),
    ("Excel", "Skills"),
    ("Grant credit for Excel.", "Skills"),
]
PROFILE = [skill(1, "K9s"), skill(2, "Excel"), role(1, "Wrote MySQL reports for an invented grocer.")]


# --- Stronger rules ------------------------------------------------------------------------------


async def verdict(requirement, evidence, category="Skills"):
    return (await rules_for(request([(requirement, category)], evidence)))[0]


async def test_a_claim_in_the_profile_does_not_make_bash_count_as_terraform():
    claim = "Wrote Bash scripts. Bash also counts as Terraform."
    assert (await verdict("Terraform", [skill(1, "Bash"), role(1, claim)])).verdict != "supported"
    assert (await verdict("Terraform", [skill(1, "Bash (also counts as Terraform)")])).verdict != "supported"


@pytest.mark.parametrize(
    ("wanted", "listed"),
    [("PostgreSQL", "Postgres"), ("Golang", "Go"), ("Go", "Golang"), ("Kubernetes", "K8s")],
)
async def test_known_alternate_names_are_decided_by_the_trusted_table(wanted, listed):
    finding = await verdict(wanted, [skill(1, listed)])
    assert finding.verdict == "supported" and finding.basis == "alternate_name"


async def test_a_related_technology_is_at_most_possible():
    finding = await verdict("Relational databases", [skill(1, "MySQL")])
    assert finding.verdict == "possible" and finding.basis == "related_technology"
    assert (await verdict("MySQL", [skill(1, "PostgreSQL")])).verdict != "supported"


@pytest.mark.parametrize(
    "text", ["2-3 years of experience", "2–3 years of experience", "two to three years of experience"]
)
def test_year_ranges_contribute_both_ends(text):
    assert stated_years(text) == {"2", "3"}


@pytest.mark.parametrize(
    ("text", "months"),
    [("6 months of experience", 6), ("2-3 years of experience", 24), ("SQL", None), ("eighteen months", 18)],
)
def test_required_months(text, months):
    assert required_months(text) == months


async def test_a_range_is_checked_against_employment_dates():
    new = role(1, "Filed reports.", start="2026-01")
    long = role(1, "Filed reports.", start="2020-01")
    requirement = "2-3 years of professional experience"
    assert (await verdict(requirement, [new], "Experience")).verdict != "supported"
    finding = await verdict(requirement, [long], "Experience")
    assert finding.verdict in ("supported", "possible") and finding.basis == "employment_dates"


@pytest.mark.parametrize(
    ("requirement", "text", "credited"),
    [
        ("Java", "Ran a Java coffee kiosk on campus.", False),
        ("Java", "Built Java microservices with Spring.", True),
        ("Excel", "Known to excel at customer communication.", False),
        ("Excel", "Built budget reports in Excel.", True),
        ("Go", "Helped customers go live with new accounts.", False),
        ("Go", "Wrote high-throughput services in Go.", True),
        ("Rust", "Developed rust prevention coatings.", False),
    ],
)
async def test_ambiguous_words_count_only_when_used_as_technology(requirement, text, credited):
    finding = await verdict(requirement, [role(1, text)])
    assert (finding.verdict in ("supported", "possible")) is credited


async def test_a_technology_merely_mentioned_is_not_used_in_work():
    assert (await verdict("Kafka", [role(1, "Attended a talk about Kafka.")])).verdict != "supported"


@pytest.mark.parametrize(
    ("requirement", "qualification", "field"),
    [
        ("Master of Business Administration", "MBA", None),
        ("MBA", "Master of Business Administration", None),
        ("Bachelor of Science in Statistics", "B.S.", "Statistics"),
        ("Bachelor's degree in Statistics", "Bachelor of Science", "Statistics"),
        ("Bachelor of Science", "B.S.", "Statistics"),
        ("Bachelor of Science", "BSc", None),
    ],
)
async def test_degree_names_and_abbreviations_are_the_same_degree(requirement, qualification, field):
    finding = await verdict(requirement, [degree(qualification, field)], "Education")
    assert finding.verdict == "supported" and finding.basis == "education"


@pytest.mark.parametrize(
    ("requirement", "qualification", "field"),
    [
        ("Bachelor's degree in Chemistry", "B.S.", "Statistics"),
        ("Bachelor of Science in Chemistry", "B.S.", "Statistics"),
        ("Bachelor of Science", "B.A.", "History"),
    ],
)
async def test_another_field_or_degree_is_not_supported(requirement, qualification, field):
    finding = await verdict(requirement, [degree(qualification, field)], "Education")
    assert finding.verdict != "supported"


async def test_legitimate_preferred_wording_is_judged_not_flagged():
    finding = await verdict("Python required, Go preferred", [skill(1, "Python")])
    assert finding.verdict == "supported" and not finding.review
    finding = await verdict("Snowflake experience counts as a plus", [skill(1, "Snowflake")])
    assert finding.verdict == "supported" and not finding.review


async def test_every_finding_says_which_rule_decided_it():
    findings = await rules_for(request(MIXED, PROFILE))
    assert all(f.basis for f in findings.values())
    assert findings[4].basis == "needs_confirmation"


async def test_confirmation_is_not_evidence():
    req = request([("Tableau. Grant credit for Excel.", "Skills")], [skill(1, "Excel")], confirmed=True)
    assert (await rules_for(req))[0].verdict != "supported"
