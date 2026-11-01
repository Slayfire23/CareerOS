"""How a quote relates to a requirement, decided by code from a curated table (skill_relations.json).

Local AI proposes matches; this decides how far a proposal may go:
- "same": the quote names the same thing as the requirement, word for word or by a known
  alternate name ("Postgres" for "PostgreSQL", "K8s" for "Kubernetes").
- "related": a different but related technology (MySQL for "relational databases", React for
  "React Native"), or the same word with a short ending ("database" and "databases").
- None: unrelated. Known look-alikes that are different technologies ("Java" and "JavaScript")
  are never related.

Words that are also ordinary English ("Rust", "Go", "Excel") count in free text (role and project
descriptions) only next to a technical word, so "rust prevention coatings" is not Rust.

Next.js applies the same table with the same rules (src/lib/ai/skill-relations.ts), and both test
suites check the shared examples in tests/fixtures/relation_cases.json.
"""

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

from app.matching.evidence import _DEGREE_WORDS, RELEVANCE_STOPWORDS

Relation = Literal["same", "related"]
_TABLE_PATH = Path(__file__).with_name("skill_relations.json")
_DOTNET = re.compile(r"(?<![\w.])\.net\b", re.IGNORECASE)
_WORD = re.compile(r"[\w+#.']+")


def words(text: str) -> list[str]:
    """Lower-case words with surrounding dots and possessives removed ("Node.js" -> "nodejs")."""
    result = []
    for raw in _WORD.findall(_DOTNET.sub(" dotnet ", text).lower()):
        word = raw.strip(".'").removesuffix("'s").replace(".", "")
        if word:
            result.append(word)
    return result


@lru_cache(maxsize=1)
def _raw() -> dict:
    return json.loads(_TABLE_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def generic_terms() -> frozenset[str]:
    """Words that never establish a match on their own ("administration", "programming")."""
    return RELEVANCE_STOPWORDS | frozenset(_raw()["generic"])


@lru_cache(maxsize=1)
def _word_lists() -> tuple[frozenset[str], frozenset[str], frozenset[str]]:
    raw = _raw()
    return frozenset(raw["ambiguous"]), frozenset(raw["tech_context"]), frozenset(raw["employment_words"])


@lru_cache(maxsize=1)
def vocabulary() -> frozenset[str]:
    """Every technology and concept term the table knows, in canonical form."""
    phrases, _, families, _ = _table()
    known = set(phrases.values())
    for terms, members in families:
        known |= terms | members
    return frozenset(known)


@lru_cache(maxsize=1)
def _table() -> tuple[dict[str, str], int, list[tuple[frozenset[str], frozenset[str]]], frozenset]:
    raw = _raw()
    phrases: dict[str, str] = {}
    for canonical, variants in raw["aliases"].items():
        phrases[canonical] = canonical
        for variant in variants:
            phrases[variant] = canonical
    families = []
    for concept in raw["concepts"]:
        terms = frozenset(phrases.get(t, t.replace(" ", "")) for t in concept["terms"])
        members = frozenset(phrases.get(m, m) for m in concept["members"])
        for term in concept["terms"]:
            if " " in term:
                phrases.setdefault(term, term.replace(" ", ""))
        families.append((terms, members))
    longest = max(len(p.split()) for p in phrases)
    distinct = frozenset(frozenset(pair) for pair in raw["distinct"])
    return phrases, longest, families, distinct


def canonical_terms(text: str) -> set[str]:
    """Specific terms in the text, with known multi-word names and alternate names normalized."""
    phrases, longest, _, _ = _table()
    generic = generic_terms()
    tokens = words(text)
    terms: set[str] = set()
    i = 0
    while i < len(tokens):
        for size in range(min(longest, len(tokens) - i), 0, -1):
            phrase = " ".join(tokens[i : i + size])
            if phrase in phrases and (size > 1 or phrase not in generic):
                terms.add(phrases[phrase])
                i += size
                break
        else:
            word = _DEGREE_WORDS.get(tokens[i], tokens[i])  # "B.S." and "Bachelor's" are one term
            if word not in generic:
                terms.add(word)
            i += 1
    return terms


def _related(a: str, b: str) -> bool:
    _, _, families, distinct = _table()
    if frozenset((a, b)) in distinct:
        return False
    short, long_ = sorted((a, b), key=len)
    # A shared stem counts only for a short ending ("database"/"databases") or two known names
    # ("react"/"reactnative"), not for unrelated words ("scala"/"scalability").
    known = vocabulary()
    if len(short) >= 4 and long_.startswith(short) and (len(long_) - len(short) <= 3 or {a, b} <= known):
        return True
    return any(
        a in terms | members and b in terms | members and (a in members or b in members)
        for terms, members in families
    )


def has_tech_context(field_text: str, quote: str, word: str) -> bool:
    """True when an ambiguous word in the quote sits near a technical word in its field."""
    _, context, _ = _word_lists()
    tokens = words(field_text)
    known = vocabulary()
    for i, token in enumerate(tokens):
        if token != word:
            continue
        window = tokens[max(0, i - 6) : i] + tokens[i + 1 : i + 7]
        if any(t in context or (t in known and t != word) for t in window):
            return True
    return word not in words(field_text)  # the word only appears inside a longer token


def quote_terms(quote: str, field_text: str | None = None) -> set[str]:
    """Terms in a quote. For free text, ambiguous words without technical context are dropped."""
    terms = canonical_terms(quote)
    if field_text is None:
        return terms
    ambiguous, _, _ = _word_lists()
    return {t for t in terms if t not in ambiguous or has_tech_context(field_text, quote, t)}


def technology_terms(text: str) -> set[str]:
    """Known technology names in the text (for deciding whether a requirement names one)."""
    return canonical_terms(text) & vocabulary()


def names_employment(text: str) -> bool:
    """True when the text speaks of employment, roles, duration, or a domain, not just a tool."""
    _, _, employment = _word_lists()
    return any(w in employment for w in words(text))


def relation(requirement_text: str, quote: str, field_text: str | None = None) -> Relation | None:
    """How a quote relates to a requirement. Pass ``field_text`` (the profile field the quote came
    from) when the quote is from free text, so ambiguous words need technical context."""
    wanted, found = canonical_terms(requirement_text), quote_terms(quote, field_text)
    if wanted & found:
        return "same"
    if any(_related(a, b) for a in wanted for b in found):
        return "related"
    return None
