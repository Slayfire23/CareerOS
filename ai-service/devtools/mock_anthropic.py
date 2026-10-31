"""A local stand-in for Anthropic's Messages API, for development and browser tests only.

It never contacts Anthropic and costs nothing. It accepts only the fictional test key, answers in
the documented Messages API shape with structured-output text, and decides deterministically:
a skill or other requirement that names one of the listed skills is "supported" with the skill
name quoted exactly; everything else is "insufficient_information". Run it with:

    uv run uvicorn devtools.mock_anthropic:app --host 127.0.0.1 --port 8020

and point the AI service at it with AI_ANTHROPIC_BASE_URL=http://127.0.0.1:8020 (refused in
production and for non-local hosts).
"""

import itertools
import json

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

TEST_KEY_PREFIX = "sk-ant-test."
_ids = itertools.count(1)
app = FastAPI(title="Mock Anthropic Messages API (local only)", docs_url=None, openapi_url=None)


def _error(status: int, kind: str) -> JSONResponse:
    body = {"type": "error", "error": {"type": kind, "message": "mock error"}, "request_id": "req_mock_error"}
    return JSONResponse(body, status_code=status, headers={"request-id": "req_mock_error"})


@app.post("/v1/messages")
async def messages(request: Request) -> JSONResponse:
    if not request.headers.get("x-api-key", "").startswith(TEST_KEY_PREFIX):
        return _error(401, "authentication_error")
    body = await request.json()
    content = body["messages"][0]["content"]
    data = json.loads(content.removeprefix("<data>\n").removesuffix("\n</data>"))
    skills = [e for e in data["evidence"] if e["kind"] == "skill"]

    findings = []
    for requirement in data["requirements"]:
        # Skills are not employment, so only skill or other requirements can be supported by one.
        matches = requirement["category"] in ("Skills", "Other")
        skill = next(
            (s for s in skills if matches and s["name"].lower() in requirement["text"].lower()), None
        )
        if skill:
            findings.append(
                {
                    "requirement_index": requirement["index"],
                    "verdict": "supported",
                    "explanation": f"You list {skill['name']} as a skill.",
                    "citations": [{"evidence_id": skill["id"], "quote": skill["name"]}],
                    "caveats": [],
                }
            )
        else:
            findings.append(
                {
                    "requirement_index": requirement["index"],
                    "verdict": "insufficient_information",
                    "explanation": "Your confirmed profile doesn't mention this requirement.",
                    "citations": [],
                    "caveats": [],
                }
            )

    request_id = f"req_mock_{next(_ids)}"
    message = {
        "id": f"msg_mock_{request_id}",
        "type": "message",
        "role": "assistant",
        "model": body["model"],
        "content": [{"type": "text", "text": json.dumps({"findings": findings})}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {"input_tokens": max(1, len(content.encode()) // 4), "output_tokens": 180},
    }
    return JSONResponse(message, headers={"request-id": request_id})


@app.get("/v1/models/{model_id}")
async def model_info(model_id: str, request: Request) -> JSONResponse:
    """Models API stand-in for the evaluation pre-flight check."""
    if not request.headers.get("x-api-key", "").startswith(TEST_KEY_PREFIX):
        return _error(401, "authentication_error")
    info = {
        "type": "model",
        "id": model_id,
        "display_name": "Mock model",
        "created_at": "2026-09-01T00:00:00Z",
    }
    return JSONResponse(info, headers={"anthropic-workspace-id": "wrkspc_mock_evaluation"})
