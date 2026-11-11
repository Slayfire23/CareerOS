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


# Negative words that only count right after the word ("excel at"), never nearby ("reports in Excel").
_FUNCTION_WORDS = frozenset({"at", "in", "to", "through", "beyond", "above"})


def has_tech_context(field_text: str, quote: str, word: str) -> bool:
    """True when an ambiguous word sits within three words of a technical noun or another known
    technology in its field, outside any hyphenated compound ("go-kart", "go-live")."""
    _, context, _ = _word_lists()
    context = context | frozenset(_raw().get("ambiguous_context", {}).get(word, []))
    negative = frozenset(_raw().get("ambiguous_negative", {}).get(word, []))
    known = vocabulary()
    pattern = re.compile(rf"(?<![\w.]){re.escape(word)}(?![\w])", re.IGNORECASE)
    for match in pattern.finditer(field_text):
        before, after = field_text[: match.start()], field_text[match.end() :]
        if before.endswith("-") or re.match(r"-[a-z]", after, re.IGNORECASE):
            continue  # part of a compound word, not the technology
        window = words(before)[-3:] + words(after)[:3]
        following = words(after)[:1]
        if (following and following[0] in negative) or any(
            t in negative and t not in _FUNCTION_WORDS for t in window
        ):
            continue  # "Java coffee", "excel at", "swift action": the ordinary meaning
        if any(t in context or (t in known and t != word) for t in window):
            return True
    return False


def describes_use(field_text: str, quote: str) -> bool:
    """True when free text describes a technology as used in work: a work verb shortly before it, or
    a technical noun or another known technology beside it. "Built Kafka consumers" does;
    "Kubernetes expertise confirmed" does not. A mention alone is not evidence."""
    _, context, _ = _word_lists()
    verbs = frozenset(_raw()["work_verbs"])
    known = vocabulary()
    terms = canonical_terms(quote)
    pattern = re.compile(rf"(?<![\w.]){re.escape(quote)}(?![\w])", re.IGNORECASE)
    for match in pattern.finditer(field_text):
        before, after = words(field_text[: match.start()]), words(field_text[match.end() :])
        if any(t in verbs for t in before[-5:]):
            return True
        if any(t in context or (t in known and t not in terms) for t in before[-3:] + after[:3]):
            return True
    return False


def plain_skill_name(name: str) -> bool:
    """A skill name is a name: short, with no parenthetical remark or sentence in it. "Bash (also
    counts as Terraform)" is a claim, so it never counts as a listed skill. "Node.js" and
    "C++ (Qt)" are fine: a parenthesis may only add a short qualifier without a verb."""
    if len(words(name)) > 6 or re.search(r"[:;{}<>]", name):
        return False
    return not re.search(
        r"\b(counts?|is|are|was|means?|equals?|same|equivalent|as|also|verified|approved|certified\s+by|expert)\b",
        name,
        re.IGNORECASE,
    )


def surface_forms(term: str) -> list[str]:
    """Every way the table writes a canonical term, longest first ("kubernetes", "k8s", "kube")."""
    phrases, _, _, _ = _table()
    return sorted(
        {p for p, canonical in phrases.items() if canonical == term} | {term}, key=len, reverse=True
    )


def quote_terms(quote: str, field_text: str | None = None) -> set[str]:
    """Terms in a quote. For free text, ambiguous words without technical context are dropped."""
    terms = canonical_terms(quote)
    if field_text is None:
        return terms
    ambiguous, _, _ = _word_lists()
    # Only the word as written can be ambiguous: "Golang" is the language, "go" may not be.
    written = set(words(quote))
    return {
        t for t in terms if t not in ambiguous or t not in written or has_tech_context(field_text, quote, t)
    }


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


def _word_alternatives(text: str) -> list[frozenset[str]]:
    stop = frozenset(_raw()["degree_field_stopwords"])
    alternatives = []
    for part in re.split(r",|\bor\b|/|;", text, flags=re.IGNORECASE):
        found = frozenset(w for w in words(part) if w not in stop and len(w) > 1 and not w.isdigit())
        if found:
            alternatives.append(found)
    return alternatives


def _without_degree_names(text: str) -> str:
    """The text with full degree names removed: "Bachelor of Science in Statistics" -> "in Statistics"."""
    for phrase in _raw().get("degree_phrases", {}):
        text = re.sub(rf"\b{phrase.replace(' ', r'\s+')}\b", " ", text, flags=re.IGNORECASE)
    return text


def _field_alternatives(text: str) -> list[frozenset[str]]:
    """Fields of study a requirement names, as word sets: "Computer Science, Engineering, or a
    related field" -> [{computer, science}, {engineering}]. Degree words and filler are dropped. A
    degree name that stands alone keeps its words, so "Bachelor of Science" still asks for science."""
    return _word_alternatives(_without_degree_names(text)) or _word_alternatives(text)


def names_same_degree(requirement_text: str, qualification: str) -> bool:
    """True when a requirement is only a degree name and the qualification is that degree, written
    either way: "Bachelor of Science" and "B.S."."""
    if _word_alternatives(_without_degree_names(requirement_text)):
        return False
    have = " ".join(re.findall(r"[a-z]+", qualification.lower().replace(".", "")))
    for phrase, info in _raw().get("degree_phrases", {}).items():
        if re.search(rf"\b{phrase.replace(' ', r'\s+')}\b", requirement_text, flags=re.IGNORECASE):
            names = {phrase, *info.get("abbreviations", [])}
            if any(f" {name} " in f" {have} " for name in names):
                return True
    return False


def asks_for_field(requirement_text: str) -> bool:
    return bool(_field_alternatives(requirement_text))


def field_matches(requirement_text: str, field_of_study: str) -> bool:
    """True when the field of study meets one of the fields the requirement names: every word of
    that field appears in it ("engineering" in "Mechanical Engineering"), or a reviewed family
    covers it ("quantitative" covers "Statistics"). Whole words only, never substrings."""
    families = {k: frozenset(v) for k, v in _raw()["degree_field_families"].items()}
    have = frozenset(words(field_of_study))
    for wanted in _field_alternatives(requirement_text):
        if all(w in have or (w in families and families[w] & have) for w in wanted):
            return True
    return False
