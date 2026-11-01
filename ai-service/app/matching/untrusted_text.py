"""Job and profile text is untrusted data. Separate what states a qualification from what is
directed at whoever (or whatever) evaluates it.

Text is split into segments: sentences, lines, clauses after a semicolon or dash, and enclosed
parts (parentheses, brackets, embedded JSON). Each segment is then classified. A segment is
evaluator-directed when it addresses an AI, bot, grader, or screener; carries a role prefix
("SYSTEM:"); asks to ignore or override rules; tells the evaluator how to rate, mark, credit, or
treat something; claims what "this candidate" already has; or carries verdict payloads.

Evaluator-directed segments never take part in matching: not in requirements, and not in profile
text cited as evidence. Everything else is kept, so a legitimate requirement written as several
sentences is judged on all of them. The patterns are shared with Next.js through
untrusted_text.json, and both test suites check tests/fixtures/untrusted_text_cases.json.

This is a classifier, so it can miss a new phrasing. The structural rules around it (code-only
verdicts, citations checked against the requirement, local AI never seeing ignored text) limit what
a missed segment can do, and every exclusion is shown to the person as a caveat.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

INSTRUCTIONS_IGNORED = (
    "Part of this requirement reads like instructions to an AI or reviewer, so it was ignored. "
    "Check its wording in the job review."
)
INSTRUCTION_TEXT = (
    "This requirement reads like instructions to an AI or reviewer rather than a qualification, "
    "so it was not assessed. Check its wording in the job review."
)
REMOVED = "[instruction-like text removed]"


@lru_cache(maxsize=1)
def _patterns() -> tuple[re.Pattern, re.Pattern, list[re.Pattern]]:
    raw = json.loads(Path(__file__).with_name("untrusted_text.json").read_text(encoding="utf-8"))
    return (
        re.compile(raw["enclosed"]),
        re.compile(raw["boundary"]),
        [re.compile(p, re.IGNORECASE) for p in raw["evaluator_directed"]],
    )


def segments(text: str) -> list[tuple[int, int]]:
    """(start, end) spans covering the text's segments, in order. Whitespace-only parts are dropped."""
    enclosed, boundary, _ = _patterns()
    spans: list[tuple[int, int]] = []

    def split(start: int, end: int) -> None:
        # Each part is searched on its own (as in the TypeScript version), so a boundary can't
        # look behind into an enclosed segment.
        cursor = start
        for match in boundary.finditer(text[start:end]):
            spans.append((cursor, start + match.start()))
            cursor = start + match.end()
        spans.append((cursor, end))

    cursor = 0
    for match in enclosed.finditer(text):
        split(cursor, match.start())
        spans.append((match.start(), match.end()))
        cursor = match.end()
    split(cursor, len(text))
    return [(s, e) for s, e in spans if text[s:e].strip()]


def evaluator_directed(segment: str) -> bool:
    return any(p.search(segment.strip()) for p in _patterns()[2])


def directed_spans(text: str) -> list[tuple[int, int]]:
    return [(s, e) for s, e in segments(text) if evaluator_directed(text[s:e])]


def has_directed_text(text: str) -> bool:
    return bool(directed_spans(text))


def qualification_text(text: str) -> str:
    """The text without evaluator-directed segments (empty if nothing else is left). Unchanged
    when nothing is directed at the evaluator."""
    if not has_directed_text(text):
        return text
    kept = [text[s:e].strip() for s, e in segments(text) if not evaluator_directed(text[s:e])]
    return " ".join(k for k in kept if k)


def masked(text: str) -> str:
    """The text with evaluator-directed segments replaced by a marker, for sending to local AI.
    Quotes taken from the rest stay verbatim in the original."""
    result, cursor = [], 0
    for start, end in directed_spans(text):
        result += [text[cursor:start], REMOVED]
        cursor = end
    result.append(text[cursor:])
    return "".join(result)


def quote_in_trusted_text(text: str, quote: str) -> bool:
    """True if some occurrence of the quote lies outside every evaluator-directed segment."""
    directed = directed_spans(text)
    start = text.find(quote)
    while start >= 0:
        end = start + len(quote)
        if not any(s < end and start < e for s, e in directed):
            return True
        start = text.find(quote, start + 1)
    return False
