import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The owner's verdicts on the Set I audit stay exactly as given, and apart from Set I's own labels.

const audit = JSON.parse(readFileSync("tests/fixtures/set_i_human_audit.json", "utf8")) as { verdicts: Record<string, string>; verdict_codes: Record<string, string> };
const key = JSON.parse(readFileSync("tests/fixtures/set_i_audit_key.json", "utf8")) as { items: { item: string }[] };

const AS_GIVEN = "S NEI S NEI NEI NS S NEI NEI NEI NS NS S S S NEI NEI NS NS NS NEI NS S NEI NS NEI S NEI NS NEI".split(" ");

describe("Set I human audit", () => {
  it("keeps all 30 verdicts as given", () => {
    const expected = Object.fromEntries(AS_GIVEN.map((verdict, i) => [`A-${String(i + 1).padStart(2, "0")}`, verdict]));
    expect(audit.verdicts).toEqual(expected);
  });

  it("covers exactly the worksheet's items, with the four verdict codes", () => {
    expect(Object.keys(audit.verdicts)).toEqual(key.items.map(i => i.item));
    expect(Object.keys(audit.verdict_codes).sort()).toEqual(["NEI", "NS", "P", "S"]);
  });
});
