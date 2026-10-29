"""Request/response contract between Next.js and the AI service.

Next.js builds the request from the signed-in user's own, user-confirmed data. Every evidence
item carries a stable id (``<kind>:<uuid>``) and a fixed kind, so findings can cite exact profile
entries and code can tell employment apart from projects. Unknown fields are rejected everywhere.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

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
VERDICTS: tuple[Verdict, ...] = ("supported", "possible", "gap", "insufficient_information")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Requirement(Strict):
    index: int = Field(ge=0, lt=50)
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    category: Category
    priority: Priority


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
    company: ShortText | None = None
    start_month: Month
    end_month: Month | None = None  # None = current role
    description: LongText | None = None


class EducationEvidence(_Evidence):
    kind: Literal["education"]
    qualification: ShortText
    institution: ShortText | None = None
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


class MatchRequest(Strict):
    request_id: UUID
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


class MatchResponse(Strict):
    request_id: UUID
    findings: list[Finding]
    verdict_counts: dict[Verdict, int]
    provider: str
    model: str | None
    method_version: str
