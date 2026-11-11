"""Source files must not contain control characters. A regex word boundary written through a shell
can turn into a literal backspace, which silently breaks the pattern (found in Milestone 5)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_no_control_characters_in_source():
    bad = []
    for path in [
        *ROOT.joinpath("app").rglob("*.py"),
        *ROOT.joinpath("app").rglob("*.json"),
        *ROOT.joinpath("tests").rglob("*.py"),
    ]:
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if any(ord(c) < 32 and c != "\t" for c in line):
                bad.append(f"{path}:{number}")
    assert bad == []
