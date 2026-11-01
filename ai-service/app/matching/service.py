"""Run a provider with a timeout, validate its output, and build the response."""

import asyncio
import logging

from app.errors import ServiceError
from app.matching.validate import InvalidProviderOutput, validate_findings
from app.providers.base import MatchProvider, ProviderOutput
from app.schemas import VERDICTS, MatchRequest, MatchResponse

log = logging.getLogger("careeros.match")


async def run_match(request: MatchRequest, provider: MatchProvider, timeout_seconds: float) -> MatchResponse:
    try:
        raw = await asyncio.wait_for(provider.match(request), timeout=timeout_seconds)
    except TimeoutError:
        log.warning("provider timeout", extra={"provider": provider.name})
        # A cloud request may have been processed (and charged) even though no answer arrived.
        raise ServiceError(
            504,
            "provider_timeout",
            "The analysis took too long. Please try again.",
            billed="no" if provider.local else "unknown",
        ) from None

    output = raw if isinstance(raw, ProviderOutput) else ProviderOutput(findings=raw)
    usage = output.usage.model_dump() if output.usage else None
    try:
        # Only the hybrid provider labels which method produced each finding; nobody else may.
        if not getattr(provider, "labels_methods", False) and any(
            f.method or f.ai_status for f in output.findings
        ):
            raise InvalidProviderOutput("Findings carry method labels this provider may not set.")
        if getattr(provider, "labels_methods", False) and not all(
            f.method and f.ai_status for f in output.findings
        ):
            raise InvalidProviderOutput("Every hybrid finding must say which method produced it.")
        # Language-model output is never repaired, whether it costs money or not.
        findings = validate_findings(request, output.findings, strict=getattr(provider, "generative", True))
    except InvalidProviderOutput as exc:
        log.error("provider output rejected: %s", exc, extra={"provider": provider.name})
        raise ServiceError(
            502,
            "provider_output_rejected",
            "The analysis could not be verified and was discarded.",
            billed="no" if provider.local else "yes",
            usage=usage,
            provider_request_id=output.provider_request_id,
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
        usage=output.usage,
        provider_request_id=output.provider_request_id,
    )
