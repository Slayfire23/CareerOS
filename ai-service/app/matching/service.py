"""Run a provider with a timeout, validate its output, and build the response."""

import asyncio
import logging

from app.errors import ServiceError
from app.matching.validate import InvalidProviderOutput, validate_findings
from app.providers.base import MatchProvider
from app.schemas import VERDICTS, MatchRequest, MatchResponse

log = logging.getLogger("careeros.match")


async def run_match(request: MatchRequest, provider: MatchProvider, timeout_seconds: float) -> MatchResponse:
    try:
        raw = await asyncio.wait_for(provider.match(request), timeout=timeout_seconds)
    except TimeoutError:
        log.warning("provider timeout", extra={"provider": provider.name})
        raise ServiceError(504, "provider_timeout", "The analysis took too long. Please try again.") from None

    try:
        findings = validate_findings(request, raw)
    except InvalidProviderOutput as exc:
        log.error("provider output rejected: %s", exc, extra={"provider": provider.name})
        raise ServiceError(
            502, "provider_output_rejected", "The analysis could not be verified and was discarded."
        ) from None

    counts = {verdict: 0 for verdict in VERDICTS}
    for finding in findings:
        counts[finding.verdict] += 1
    return MatchResponse(
        request_id=request.request_id,
        findings=findings,
        verdict_counts=counts,
        provider=provider.name,
        model=provider.model,
        method_version=provider.method_version,
    )
