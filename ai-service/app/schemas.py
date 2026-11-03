"""Request/response contract between Next.js and the AI service.

Next.js builds the request from the signed-in user's own, user-confirmed data. Every evidence
item carries a stable id (``<kind>:<uuid>``) and a fixed kind, so findings can cite exact profile
entries and code can tell employment apart from projects. Unknown fields are rejected everywhere.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_serializer,
    model_validator,
)

Month = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
EvidenceId = Annotated[
    str,
    StringConstraints(
        pattern=r"^(skill|experience|education|project):[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$"
    ),
]

Category = Literal["Skills", "Experience", "Education", "Other"]
Priority = Literal["Required", "Preferred", "Unspecified"]
Verdict = Literal["supported", "possible", "gap", "insufficient_information"]
# Hybrid analysis only: which method produced each finding, and what happened to local AI for it.
FindingMethod = Literal["rules", "local_ai"]
# Which deterministic rule decided a finding (shown to the person as where the result came from).
RuleBasis = Literal[
    "listed_skill",
    "alternate_name",
    "related_technology",
    "described_in_work",
    "project",
    "employment_dates",
    "role_description",
    "education",
    "no_evidence",
    "needs_confirmation",
]
AiStatus = Literal[
    "accepted", "not_eligible", "contains_instructions", "not_needed", "no_match", "rejected", "unavailable"
]
VERDICTS: tuple[Verdict, ...] = ("supported", "possible", "gap", "insufficient_information")


class Strict(BaseModel):
    # Validation errors never echo submitted values (profile or job text).
    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)


class Requirement(Strict):
    index: int = Field(ge=0, lt=50)
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    category: Category
    priority: Priority
    # The person confirmed in the job review that this is a real requirement (not an instruction).
    # It lets a flagged requirement be judged; it is never evidence that they meet it.
    confirmed: bool = False


class _Evidence(Strict):
    id: EvidenceId

    @model_validator(mode="after")
    def _id_matches_kind(self):
        if not self.id.startswith(f"{self.kind}:"):  # type: ignore[attr-defined]
            raise ValueError("evidence id prefix must match its kind")
        return self


class SkillEvidence(_Evidence):
    kind: Literal["skill"]
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    proficiency: Literal["BEGINNER", "INTERMEDIATE", "ADVANCED"] | None = None


class ExperienceEvidence(_Evidence):
    """Professional employment. The only kind that counts toward years of experience."""

    kind: Literal["experience"]
    job_title: ShortText
    start_month: Month
    end_month: Month | None = None  # None = current role
    description: LongText | None = None


class EducationEvidence(_Evidence):
    kind: Literal["education"]
    qualification: ShortText
    field_of_study: ShortText | None = None
    start_month: Month
    end_month: Month | None = None
    description: LongText | None = None


class ProjectEvidence(_Evidence):
    """Projects and accomplishments. Never counted as professional employment."""

    kind: Literal["project"]
    title: ShortText
    description: LongText | None = None
    contribution: LongText | None = None
    results: LongText | None = None
    skills: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]] = (
        Field(default_factory=list, max_length=10)
    )


Evidence = Annotated[
    SkillEvidence | ExperienceEvidence | EducationEvidence | ProjectEvidence, Field(discriminator="kind")
]


class TokenBudget(Strict):
    """Upper bounds Next.js reserved budget for. Cloud providers must stay within them."""

    max_input_tokens: int = Field(ge=1_000, le=200_000)
    max_output_tokens: int = Field(ge=256, le=32_000)


class MatchRequest(Strict):
    request_id: UUID
    # Which enabled provider to use. "assisted" is accepted here only to be refused: see /v1/suggest.
    provider: Literal["rules", "fake", "anthropic", "ollama", "hybrid", "assisted"] = "rules"
    # Required for cloud providers (checked by the service), ignored by local ones.
    budget: TokenBudget | None = None
    # The month "current" roles run until; supplied by Next.js so results are reproducible.
    as_of_month: Month
    requirements: list[Requirement] = Field(min_length=1, max_length=50)
    evidence: list[Evidence] = Field(default_factory=list, max_length=200)

    @field_validator("requirements")
    @classmethod
    def _unique_indexes(cls, value: list[Requirement]) -> list[Requirement]:
        if len({r.index for r in value}) != len(value):
            raise ValueError("requirement indexes must be unique")
        return value

    @field_validator("evidence")
    @classmethod
    def _unique_ids(cls, value: list[Evidence]) -> list[Evidence]:
        if len({e.id for e in value}) != len(value):
            raise ValueError("evidence ids must be unique")
        return value

    @model_validator(mode="after")
    def _dates_in_order(self) -> "MatchRequest":
        for item in self.evidence:
            if isinstance(item, ExperienceEvidence | EducationEvidence):
                end = item.end_month or self.as_of_month
                if end < item.start_month:
                    raise ValueError(f"{item.id}: end month is before start month")
        return self


class Citation(Strict):
    evidence_id: EvidenceId
    # Must be an exact substring of the cited evidence item's text (checked in validation).
    quote: Annotated[str, StringConstraints(min_length=1, max_length=300)]


class Finding(Strict):
    requirement_index: int = Field(ge=0, lt=50)
    verdict: Verdict
    explanation: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    citations: list[Citation] = Field(default_factory=list, max_length=10)
    caveats: list[Annotated[str, StringConstraints(min_length=1, max_length=300)]] = Field(
        default_factory=list, max_length=5
    )
    # Set by code for hybrid analysis only; every other provider leaves both empty.
    method: FindingMethod | None = None
    ai_status: AiStatus | None = None
    # Set when the requirement needs the person's confirmation before it can be judged.
    review: Literal["needs_confirmation"] | None = None
    # Which deterministic rule decided this finding. Rules engine only.
    basis: RuleBasis | None = None

    @model_serializer(mode="wrap")
    def _omit_unset_labels(self, handler):
        # Findings from other providers keep exactly the original contract shape.
        data = handler(self)
        for key in ("method", "ai_status", "review", "basis"):
            if data.get(key) is None:
                data.pop(key, None)
        return data


class Usage(Strict):
    """Token counts reported by the provider (None for local providers)."""

    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    cache_read_input_tokens: int = Field(default=0, ge=0)
    cache_creation_input_tokens: int = Field(default=0, ge=0)


class MatchResponse(Strict):
    request_id: UUID
    findings: list[Finding]
    verdict_counts: dict[Verdict, int]
    provider: str
    model: str | None
    method_version: str
    usage: Usage | None = None
    provider_request_id: str | None = None


# --- The local bridge for AI suggestions. The types themselves hold no dates, education, or verdicts. --

_Text = Annotated[str, StringConstraints(max_length=20_000)]


class SuggestRequirement(Strict):
    index: int = Field(ge=0, lt=50)
    text: Annotated[str, StringConstraints(min_length=1, max_length=2_000)]


class SuggestSkill(Strict):
    id: Annotated[str, StringConstraints(max_length=60)]
    kind: Literal["skill"]
    name: Annotated[str, StringConstraints(min_length=1, max_length=200)]


class SuggestRole(Strict):
    id: Annotated[str, StringConstraints(max_length=60)]
    kind: Literal["experience"]
    job_title: Annotated[str, StringConstraints(max_length=200)] | None = None
    description: _Text | None = None


class SuggestProject(Strict):
    id: Annotated[str, StringConstraints(max_length=60)]
    kind: Literal["project"]
    title: Annotated[str, StringConstraints(max_length=200)] | None = None
    description: _Text | None = None
    contribution: _Text | None = None
    results: _Text | None = None
    skills: list[Annotated[str, StringConstraints(max_length=200)]] = Field(
        default_factory=list, max_length=10
    )


class SuggestRequest(Strict):
    request_id: UUID
    requirements: list[SuggestRequirement] = Field(min_length=1, max_length=50)
    evidence: list[SuggestSkill | SuggestRole | SuggestProject] = Field(max_length=200)


class Pointer(Strict):
    """Something local AI suggests looking at. Untrusted: Next.js checks it against the profile."""

    requirement_index: int = Field(ge=0, lt=50)
    kind: Literal["possible_connection", "missing_from_profile"]
    evidence_id: str | None = None
    quote: Annotated[str, StringConstraints(max_length=300)] | None = None
    term: Annotated[str, StringConstraints(max_length=100)] | None = None


class SuggestResponse(Strict):
    request_id: UUID
    model: str
    method_version: str
    # "unavailable": Ollama was off, busy, or too slow, so some or all suggestions are missing.
    ai_assist: Literal["used", "unavailable"]
    pointers: list[Pointer]
    usage: Usage | None = None
