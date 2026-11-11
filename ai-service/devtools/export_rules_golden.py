"""Writes tests/fixtures/rules_v5_golden.json: what the frozen Python rules engine (rules-v5) decides
on every evaluation case seen so far. The TypeScript engine, which is now authoritative, is tested
against it, so its behavior can only differ where a difference is listed and explained.

    uv run python -m devtools.export_rules_golden ../tests/fixtures/rules_v5_golden.json
"""

import asyncio
import json
import sys
from pathlib import Path

from app.matching.validate import validate_findings
from app.providers.rules import RulesProvider
from evals.run_eval import load_cases

SETS = {
    "dev": "cases.json",
    "A": "holdout_cases.json",
    "B": "holdout_b_cases.json",
    "C": "holdout_c_cases.json",
    "D": "holdout_d_cases.json",
    "E": "holdout_e_cases.json",
    "F": "holdout_f_cases.json",
}


async def export() -> dict:
    provider = RulesProvider()
    exported = []
    for name, file in SETS.items():
        cases = load_cases(Path(__file__).parents[1] / "evals" / file, include_large=name == "dev")
        for case in cases:
            findings = validate_findings(case.request, await provider.match(case.request))
            exported.append(
                {
                    "set": name,
                    "id": case.id,
                    "allowed": {str(k): sorted(v) for k, v in case.allowed.items()},
                    "request": json.loads(case.request.model_dump_json(exclude={"budget"})),
                    "findings": [
                        json.loads(f.model_dump_json(exclude_none=True, exclude={"method", "ai_status"}))
                        for f in findings
                    ],
                }
            )
    return {"method_version": provider.method_version, "cases": exported}


if __name__ == "__main__":
    data = asyncio.run(export())
    Path(sys.argv[1]).write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
    print(len(data["cases"]), sum(len(c["findings"]) for c in data["cases"]))
