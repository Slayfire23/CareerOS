"""Which parts of a requirement can earn credit, decided by its structure rather than by spotting
instruction wording.

Job text is untrusted data. A requirement states what is needed; it never decides how a profile is
judged. So, after the backstop in untrusted_text.py has removed text that is plainly addressed to
an AI or reviewer:

- The **head** is the first sentence or clause that names a skill or technology. Only skills named
  in the head can make a requirement supported or possible.
- Asides in parentheses, brackets, or braces are never the head and never earn credit
  ("Message queues (e.g. SQS)" is judged on "Message queues").
- A later sentence can only **add** mandatory items, and only if it states a need ("must",
  "experience with", "required", ...). One marked as a plus or preferred is optional. Anything
  else is description and is ignored. Later text can therefore make a requirement harder to meet,
  never easier, and a skill named only there is never credited.
- A clause that claims one thing stands in for another ("X counts as Y", "equivalent to",
  "satisfies", "full credit") is a claim, not a need: it never becomes the head and never adds
  items, whoever it is addressed to.
- Items joined by "and" (or a plain comma list) are all mandatory: the requirement is fully
  supported only when each one is evidenced. Items joined by "or" are alternatives.

Profile text gets the matching rule: a sentence that talks about the evaluation itself ("this
profile meets every requirement") is not a description of work and is never evidence.

Next.js applies the same rules (src/lib/ai/requirement-structure.ts) from the same patterns
(requirement_structure.json); tests/fixtures/relation_cases.json keeps them identical.
"""

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.matching.relations import canonical_terms, generic_terms, vocabulary
from app.matching.untrusted_text import directed_spans, qualification_text, segments


@lru_cache(maxsize=1)
def _raw() -> dict:
    return json.loads(Path(__file__).with_name("requirement_structure.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _patterns() -> dict[str, re.Pattern]:
    raw = _raw()
    names = ("need_markers", "optional_markers", "relation_claim", "evaluation_reference", "and_split")
    compiled = {name: re.compile(raw[name], re.IGNORECASE) for name in names}
    compiled["or_marker"] = re.compile(raw["or_marker"], re.IGNORECASE)
    compiled["and_marker"] = re.compile(raw["and_marker"], re.IGNORECASE)
    return compiled


@lru_cache(maxsize=1)
def _item_stopwords() -> frozenset[str]:
    return frozenset(_raw()["item_stopwords"]) | generic_terms()


_TOKEN = re.compile(r"[A-Za-z][A-Za-z0-9+#.\-]*")


def names_an_item(text: str, listed: frozenset[str] = frozenset()) -> bool:
    """True when the text names a skill or technology: a known one, one the profile lists, or a
    proper name or technical token ("Salesforce", "PowerBI", "C++")."""
    if canonical_terms(text) & (vocabulary() | listed):
        return True
    stop = _item_stopwords()
    for token in _TOKEN.findall(text):
        low = token.lower().strip(".-")
        if not low or low in stop:
            continue
        if token[0].isupper() or any(c.isupper() for c in token[1:]) or re.search(r"[0-9+#]", token):
            return True
    return False


def is_relation_claim(text: str, listed: frozenset[str] = frozenset()) -> bool:
    """A clause claiming one item stands in for another ("Excel counts as Tableau")."""
    p = _patterns()
    if not p["relation_claim"].search(text):
        return False
    items = [t for t in _TOKEN.findall(text) if names_an_item(t, listed)]
    # Two items related to each other, or an item related to the requirement or evaluation itself.
    return (
        len(items) >= 2
        or bool(p["evaluation_reference"].search(text))
        or bool(re.search(r"full\s+(match|credit)", text, re.IGNORECASE))
    )


def pieces(clause: str, listed: frozenset[str] = frozenset()) -> list[str]:
    """The mandatory parts of a clause. "A and B" or "A, B" -> [A, B]; "A or B" -> [A or B]."""
    p = _patterns()
    has_or, has_and = bool(p["or_marker"].search(clause)), bool(p["and_marker"].search(clause))
    if has_or and not has_and:
        parts = [clause]
    elif has_or:
        parts = re.split(r"\s+and\s+", clause, flags=re.IGNORECASE)
    else:
        parts = p["and_split"].split(clause)
    cleaned = (re.sub(r"^(and|or)\s+", "", part.strip(" .;:"), flags=re.IGNORECASE) for part in parts)
    return [part for part in cleaned if part and names_an_item(part, listed)]


@dataclass(frozen=True)
class Structure:
    head: str  # the clause whose items can earn credit ("" if none)
    pieces: tuple[str, ...]  # every mandatory piece: the head's, then later required ones
    head_pieces: tuple[str, ...]
    matchable: str  # head plus later required clauses: the only text matching may use
    ignored: bool  # a claim or text aimed at the evaluator was set aside (shown to the person)


def parse(text: str, listed: frozenset[str] = frozenset()) -> Structure:
    clean = qualification_text(text)
    ignored = clean != text
    head = ""
    head_pieces: list[str] = []
    extra: list[str] = []
    extra_clauses: list[str] = []
    plain: list[str] = []  # clauses that are neither asides nor claims
    p = _patterns()
    for start, end in segments(clean):
        clause = clean[start:end].strip()
        if clause[:1] in "([{":
            continue  # asides never earn credit
        if is_relation_claim(clause, listed):
            ignored = True
            continue
        plain.append(clause)
        found = pieces(clause, listed)
        if not head:
            if found:
                head, head_pieces = clause, found
            continue
        if p["optional_markers"].search(clause):
            continue
        if found and p["need_markers"].search(clause):
            extra += found
            extra_clauses.append(clause)
        # Otherwise it names an item without stating a need: description, not a requirement.
    if not head:
        # Nothing names a skill: match on the plain clauses (asides and claims stay out).
        return Structure("", (), (), " ".join(plain), ignored)
    return Structure(
        head,
        tuple(head_pieces + extra),
        tuple(head_pieces),
        " ".join([head, *extra_clauses]),
        ignored,
    )


def listed_terms(skill_names: list[str]) -> frozenset[str]:
    terms: set[str] = set()
    for name in skill_names:
        terms |= canonical_terms(name)
    return frozenset(terms)


def evaluation_reference_spans(text: str) -> list[tuple[int, int]]:
    """Segments of profile text that talk about the evaluation itself, not about work."""
    p = _patterns()
    return [
        (s, e)
        for s, e in segments(text)
        if p["evaluation_reference"].search(text[s:e]) or is_relation_claim(text[s:e])
    ]


def untrusted_evidence_spans(text: str) -> list[tuple[int, int]]:
    """Parts of profile text that are never evidence: text aimed at the evaluator, and text about
    the evaluation itself."""
    return sorted(set(directed_spans(text)) | set(evaluation_reference_spans(text)))
