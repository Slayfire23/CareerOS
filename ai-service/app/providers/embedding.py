"""Local embeddings for shadow retrieval. It makes no decisions and writes no words.

Next.js sends short texts that already passed its checks, under opaque ids, and gets back ids and scores.
It holds the offsets, so nothing returned here can become a citation on its own. There are no dates,
education, verdicts, or names of people in the request, by construction of its schema.

When Ollama is down, slow, or busy, the response says ``status="unavailable"``. Vectors stay in memory for
one request and are never stored or logged. This refuses to run in production (see app/config.py).
"""

import logging
import math

import httpx2

from app.config import Settings
from app.schemas import RetrieveRequest, RetrieveResponse, RetrieveScore

log = logging.getLogger("careeros.embedding")


def _normalized(vector: list[float]) -> list[float]:
    length = math.sqrt(sum(x * x for x in vector))
    return [x / length for x in vector] if length else vector


class EmbeddingProvider:
    name = "embedding"

    def __init__(self, settings: Settings, client: httpx2.AsyncClient | None = None):
        self._settings = settings
        self._client = client or httpx2.AsyncClient(
            base_url=settings.ollama_url,
            timeout=httpx2.Timeout(settings.provider_timeout_seconds, connect=2.0),
        )

    async def check_ready(self) -> bool:
        try:
            response = await self._client.get("/api/tags", timeout=3.0)
            names = {m.get("name", "").split(":")[0] for m in response.json().get("models", [])}
            return self._settings.embedding_model in names
        except (httpx2.HTTPError, ValueError):
            return False

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        response = await self._client.post(
            "/api/embed",
            json={
                "model": self._settings.embedding_model,
                "input": texts,
                "keep_alive": self._settings.ollama_keep_alive,
            },
        )
        response.raise_for_status()
        vectors = response.json()["embeddings"]
        if len(vectors) != len(texts):
            raise ValueError("wrong number of embeddings")
        return [_normalized(v) for v in vectors]

    async def retrieve(self, request: RetrieveRequest) -> RetrieveResponse:
        model = self._settings.embedding_model
        try:
            vectors = await self._embed(
                [q.text for q in request.queries] + [p.text for p in request.passages]
            )
        except (httpx2.HTTPError, ValueError, KeyError, TypeError) as exc:
            log.warning("embedding unavailable: %s", type(exc).__name__)  # never the text
            return RetrieveResponse(
                request_id=request.request_id, model=model, status="unavailable", scores=[]
            )
        count = len(request.queries)
        scores: list[RetrieveScore] = []
        for query, vector in zip(request.queries, vectors[:count], strict=True):
            ranked = sorted(
                (
                    (sum(a * b for a, b in zip(vector, other, strict=True)), passage.id)
                    for passage, other in zip(request.passages, vectors[count:], strict=True)
                ),
                key=lambda pair: pair[0],
                reverse=True,
            )
            scores += [
                RetrieveScore(query_id=query.id, passage_id=pid, similarity=round(score, 4))
                for score, pid in ranked[: request.top_k]
            ]
        return RetrieveResponse(request_id=request.request_id, model=model, status="used", scores=scores)
