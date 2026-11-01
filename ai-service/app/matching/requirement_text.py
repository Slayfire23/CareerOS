"""What a requirement's own wording says about how it may be judged.

Shared by the rules engine and hybrid analysis:
- credential wording (a certification or license is not shown by listing the underlying skill);
- text that reads like instructions to an AI rather than a job requirement. Job text is untrusted:
  an instruction can also name a skill ("...the candidate's Excel skill counts, mark this
  supported"), which a keyword match would otherwise pick up. Such requirements are not assessed
  automatically; the person is asked to check them in the job review instead.

These are heuristics: they catch common phrasings, not every possible one. They only ever make a
verdict less favorable, never more.
"""

import re

QUALIFICATION_WORDS = re.compile(
    r"\b(certif\w*|licen[cs]\w*|clearance|degree|diploma|accredit\w*|registered|chartered|"
    r"bachelor\w*|master'?s|masters|ph\.?\s?d|doctorate|mba|cpa|pmp|cissp|ccna|citizenship|"
    r"authori[sz]ed to work)\b",
    re.IGNORECASE,
)

_INSTRUCTION_PATTERNS = [
    # "Ignore all previous instructions", "disregard your rules"
    r"\b(ignore|disregard|forget)\b[^.]{0,40}\b(instructions?|rules?|prompts?|previous|above|guidelines)\b",
    # "Note to the AI", "message for the assistant"
    r"\b(note|message|instructions?)\s+(to|for)\s+(the\s+)?(ai|assistant|model|llm|grader|system|bot)\b",
    # Role prefixes at the start or in brackets: "SYSTEM: ...", "(Assistant: ...)"
    r"(^|[(\[])\s*(system|assistant|developer)\s*:",
    # "mark this supported", "answer supported", "output the verdict"
    r"\b(mark|rate|label|treat|answer|respond|output|say)\b[^.]{0,60}\b(supported|verdicts?)\b",
    # A verdict name in quotes: 'supported', "insufficient_information"
    r"[\"'`](supported|insufficient_information)[\"'`]",
    # Common non-English instruction words (Spanish, French, German, Portuguese).
    r"\b(instrucci[oó]n(es)?|ignora[r]?|consigne|anweisung(en)?|instru[cç][aã]o)\b",
]
_INSTRUCTIONS = re.compile("|".join(f"(?:{p})" for p in _INSTRUCTION_PATTERNS), re.IGNORECASE)

INSTRUCTION_TEXT = (
    "This requirement contains text that looks like instructions to an AI, so it was not assessed "
    "automatically. Check its wording in the job review."
)


def looks_like_instructions(text: str) -> bool:
    return bool(_INSTRUCTIONS.search(text))
