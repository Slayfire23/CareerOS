"""Deterministic helpers over evidence: durations, normalization, and citable text."""

import re
from collections.abc import Iterable

from app.schemas import Evidence, ExperienceEvidence, MatchRequest, ProjectEvidence, SkillEvidence

PROJECT_NOT_EMPLOYMENT = "Projects are not counted as professional employment."


def month_index(month: str) -> int:
    year, number = month.split("-")
    return int(year) * 12 + int(number) - 1


def role_months(item: ExperienceEvidence, as_of_month: str) -> int:
    """Inclusive month count, e.g. 2023-01 to 2023-12 is 12 months."""
    return month_index(item.end_month or as_of_month) - month_index(item.start_month) + 1


def employment_months(request: MatchRequest) -> int:
    """Total months of listed professional employment, merging overlapping roles. Projects never count."""
    spans = sorted(
        (month_index(e.start_month), month_index(e.end_month or request.as_of_month))
        for e in request.evidence
        if isinstance(e, ExperienceEvidence)
    )
    total, current_start, current_end = 0, None, None
    for start, end in spans:
        if current_end is None or start > current_end + 1:
            if current_end is not None:
                total += current_end - current_start + 1
            current_start, current_end = start, end
        else:
            current_end = max(current_end, end)
    if current_end is not None:
        total += current_end - current_start + 1
    return total


def format_years(months: int) -> str:
    years = round(months / 12, 1)
    return f"{years:g}"


def citable_texts(item: Evidence) -> list[str]:
    """The only strings a citation quote may be taken from, for each kind of evidence."""
    if isinstance(item, SkillEvidence):
        fields: Iterable[str | None] = [item.name]
    elif isinstance(item, ExperienceEvidence):
        fields = [item.job_title, item.company, item.description]
    elif isinstance(item, ProjectEvidence):
        fields = [item.title, item.description, item.contribution, item.results, *item.skills]
    else:
        fields = [item.qualification, item.institution, item.field_of_study, item.description]
    return [f for f in fields if f]


MIN_QUOTE_CHARS = 3


def quote_is_verbatim(item: Evidence, quote: str) -> bool:
    """True if the quote appears exactly in the item's text and is meaningful.

    A fragment shorter than three characters only counts when it is a whole field, such as a
    skill named "C" or "R". This stops a single letter from passing as evidence.
    """
    texts = citable_texts(item)
    if len(quote.strip()) < MIN_QUOTE_CHARS:
        return quote in texts
    return any(quote in text for text in texts)


_TOKEN = re.compile(r"[a-z0-9][a-z0-9+#&/.-]*")


def tokens(text: str) -> list[str]:
    return [t.rstrip(".-/") for t in _TOKEN.findall(text.casefold()) if t.rstrip(".-/")]


def contains_phrase(text: str, phrase: str) -> bool:
    """Whole-token, case-insensitive phrase match.

    "C++" matches "C++"; "Java" does not match "JavaScript".
    """
    needle = tokens(phrase)
    haystack = tokens(text)
    if not needle:
        return False
    width = len(needle)
    return any(haystack[i : i + width] == needle for i in range(len(haystack) - width + 1))


def find_verbatim(text: str, phrase: str) -> str | None:
    """Return the phrase exactly as it appears in ``text`` (original case), for use as a quote."""
    match = re.search(re.escape(phrase), text, flags=re.IGNORECASE)
    return match.group(0) if match else None
