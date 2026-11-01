"""How a quote relates to a requirement, decided by code from a curated table (skill_relations.json).

Local AI proposes matches; this decides how far a proposal may go:
- "same": the quote names the same thing as the requirement, word for word or by a known
  alternate name ("Postgres" for "PostgreSQL", "K8s" for "Kubernetes").
- "related": a different but related technology (MySQL for "relational databases", React for
  "React Native"), or a word that shares a 4+ character stem.
- None: unrelated. Known look-alikes that are different technologies ("Java" and "JavaScript")
  are never related.

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
    if len(short) >= 4 and long_.startswith(short):
        return True
    return any(
        a in terms | members and b in terms | members and (a in members or b in members)
        for terms, members in families
    )


def relation(requirement_text: str, quote: str) -> Relation | None:
    wanted, found = canonical_terms(requirement_text), canonical_terms(quote)
    if wanted & found:
        return "same"
    if any(_related(a, b) for a in wanted for b in found):
        return "related"
    return None
