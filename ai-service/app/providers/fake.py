"""Test-only provider that returns scripted findings, including deliberately bad ones.

Used to prove that validation catches fabricated citations and similar mistakes before a real
model is involved. Refused in production by ``Settings``.
"""

from collections.abc import Callable

from app.schemas import Finding, MatchRequest


def _default_script(request: MatchRequest) -> list[Finding]:
    return [
        Finding(
            requirement_index=r.index,
            verdict="insufficient_information",
            explanation="Fake provider: no assessment made.",
        )
        for r in request.requirements
    ]


class FakeProvider:
    name = "fake"
    model = None
    method_version = "fake-v1"

    def __init__(self, script: Callable[[MatchRequest], list[Finding]] | None = None) -> None:
        self._script = script or _default_script

    async def match(self, request: MatchRequest) -> list[Finding]:
        return self._script(request)
