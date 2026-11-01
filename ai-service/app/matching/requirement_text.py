"""What a requirement's own wording says about how it may be judged.

Shared by the rules engine and hybrid analysis. Instructions hidden in job or profile text are
handled separately, in untrusted_text.py.
"""

import re

from app.matching.relations import names_employment, technology_terms
from app.matching.validate import stated_years

QUALIFICATION_WORDS = re.compile(
    r"\b(certif\w*|licen[cs]\w*|clearance|degree|diploma|accredit\w*|registered|chartered|"
    r"bachelor\w*|master'?s|masters|ph\.?\s?d|doctorate|mba|cpa|pmp|cissp|ccna|citizenship|"
    r"authori[sz]ed to work)\b",
    re.IGNORECASE,
)


def skill_like_experience(text: str) -> bool:
    """An Experience requirement that only names a technology ("Experience with PostgreSQL"): no
    duration, no employment, role, or domain words, no credential, and at least one known
    technology name. Such requirements are judged as skill requirements. Anything mentioning years,
    roles, leadership, or a domain stays an employment requirement with the strict rules."""
    return (
        not stated_years(text)
        and not QUALIFICATION_WORDS.search(text)
        and not names_employment(text)
        and bool(technology_terms(text))
    )
