import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAiConfig } from "@/lib/ai/config";
import { approvedSplitFor, normalizeRequirementWording } from "@/lib/ai/rules/approved-split-link";
import { questionKey } from "@/lib/ai/rules/review-queue";
import { APPROVED_SPLITS, recognizeParts } from "@/lib/ai/rules/split-recognition";
import { readStructuredAnswer, type Consistency, type Involvement, type WorkFrequency, type WorkRecency } from "@/lib/ai/rules/structured-answer";
import { assessConsistency } from "@/lib/ai/rules/structured-consistency";
import { CHOICES, FREQUENCIES, RECENCIES, fieldsFor, formContext, formSpec, parseSubmission, targetedQuestions, type RawSubmission } from "@/lib/ai/rules/structured-form";
import { fieldsFromSpec } from "@/lib/ai/rules/structured-form-spec";

// Phase 5.3 Stage E: the structured "your part" form (owner decisions E1–E4). Its answers are saved but change no
// verdict until Stage F; these tests also prove that nothing on this path can reach Supported on its own.
const PLUMBING = "Install and repair residential plumbing";
const ROLE = "00000000-0000-4000-8000-000000000001";

describe("the flag", () => {
  it("is off by default, needs the review flag, and is refused on Vercel", () => {
    expect(readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "20" }).structuredForm).toBe(false);
    expect(readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "20", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true" }).structuredForm).toBe(false);
    expect(readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "20", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true", CLARIFICATION_REVIEW_ENABLED: "true" }).structuredForm).toBe(true);
    expect(readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "20", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true", CLARIFICATION_REVIEW_ENABLED: "true", VERCEL: "1" }).structuredForm).toBe(false);
  });
});

describe("E1: approved splits are linked by exact wording only", () => {
  it("all 33 approved requirements link to their own split, with their approved parts", () => {
    expect(Object.keys(APPROVED_SPLITS)).toHaveLength(33);
    for (const [id, split] of Object.entries(APPROVED_SPLITS)) expect(approvedSplitFor(split.requirement), id).toEqual({ splitId: id, parts: split.parts });
  });
  it("splits that questionKey would merge stay apart (P1/P8, P13/P14)", () => {
    // questionKey gives these pairs one key: that's why it's never used to find a split.
    expect(questionKey(APPROVED_SPLITS.P1.requirement, "work_detail")).toBe(questionKey(APPROVED_SPLITS.P8.requirement, "work_detail"));
    expect(questionKey(APPROVED_SPLITS.P13.requirement, "work_detail")).toBe(questionKey(APPROVED_SPLITS.P14.requirement, "work_detail"));
    expect(approvedSplitFor(APPROVED_SPLITS.P1.requirement)!.splitId).toBe("P1");
    expect(approvedSplitFor(APPROVED_SPLITS.P8.requirement)!.splitId).toBe("P8");
    expect(approvedSplitFor(APPROVED_SPLITS.P13.requirement)!.splitId).toBe("P13");
    expect(approvedSplitFor(APPROVED_SPLITS.P14.requirement)!.splitId).toBe("P14");
  });
  it("none of the 76 requirements the owner kept whole is split", () => {
    const reviewed = Object.keys(JSON.parse(readFileSync("ai-service/evals/reports/m11/structured/split-review-simulation.json", "utf8")).requirements);
    const approved = new Set(Object.values(APPROVED_SPLITS).map(s => s.requirement));
    const unsplit = reviewed.filter(t => !approved.has(t));
    expect(unsplit).toHaveLength(76);
    expect(unsplit.filter(t => approvedSplitFor(t))).toEqual([]);
    expect(approvedSplitFor("Experience operating a cash register and handling cash transactions")).toBeNull();
  });
  it("single-part requirements are never split", () => {
    for (const t of ["Bookkeeping", "Bookkeeping in QuickBooks", "Inventory cycle counting", "Performing cycle counts", "Accounts receivable collections", "Recruiting staff", "Hiring staff"]) expect(approvedSplitFor(t), t).toBeNull();
  });
  it("only case, spacing, punctuation and a leading 'Experience with/in' are ignored; any other wording fails closed", () => {
    expect(approvedSplitFor("  install AND repair residential plumbing.  ")?.splitId).toBe("A58");
    expect(approvedSplitFor("Experience with grant reporting and compliance")?.splitId).toBe("P6");
    expect(approvedSplitFor("Grant reporting and compliance")?.splitId).toBe("P6");
    for (const t of ["Install and repair residential plumbing systems", "Repair and install residential plumbing", "Recruiting & hiring staff", "Install, repair residential plumbing and gas lines"]) expect(approvedSplitFor(t), t).toBeNull();
    expect(normalizeRequirementWording("Experience in A/R aging")).toBe("a/r aging");
  });
});

describe("the form shows only what each choice needs (Stage 4A, O1, DD2)", () => {
  const plumbing = formContext({ text: PLUMBING, category: "Skills" });
  const salesforce = formContext({ text: "Salesforce", category: "Skills" });
  it("offers the eight approved choices, nothing preselected", () => {
    expect(CHOICES.map(c => c.value)).toEqual(["PERFORMED", "PART", "SUPERVISED", "REQUESTED", "ASSISTED", "TAUGHT", "OBSERVED_TRAINED", "NOT_DONE"]);
    expect(fieldsFor(null, null, plumbing)).toEqual({ alsoDidSome: false, frequency: false, recency: false, role: false, months: false, parts: false, detail: false });
  });
  it("doing the work: how often, how recently, role, description, and parts for an approved split only", () => {
    expect(fieldsFor("PERFORMED", null, plumbing)).toMatchObject({ frequency: true, recency: true, role: true, parts: true, detail: true, alsoDidSome: false });
    expect(fieldsFor("PART", null, plumbing).parts).toBe(true);
    expect(fieldsFor("PERFORMED", null, salesforce).parts).toBe(false);
  });
  it("lead choices ask 'did you also do any of it yourself?', unless the lead is itself the work", () => {
    expect(fieldsFor("SUPERVISED", null, plumbing)).toMatchObject({ alsoDidSome: true, frequency: false, parts: false });
    expect(fieldsFor("SUPERVISED", true, plumbing)).toMatchObject({ alsoDidSome: true, frequency: true, recency: true, parts: true });
    expect(fieldsFor("SUPERVISED", false, plumbing)).toMatchObject({ frequency: false, parts: false });
    const supervising = formContext({ text: "Supervising warehouse staff", category: "Skills" });
    expect(fieldsFor("SUPERVISED", null, supervising).alsoDidSome).toBe(false);
    const training = formContext({ text: "Training new employees", category: "Skills" });
    expect(fieldsFor("TAUGHT", null, training).alsoDidSome).toBe(false);
  });
  it("watching, and 'haven't done this', ask nothing more (the denial asks nothing at all)", () => {
    expect(fieldsFor("OBSERVED_TRAINED", null, plumbing)).toMatchObject({ alsoDidSome: false, frequency: false, parts: false, role: true });
    expect(fieldsFor("NOT_DONE", null, plumbing)).toEqual({ alsoDidSome: false, frequency: false, recency: false, role: false, months: false, parts: false, detail: false });
  });
  it("'about how long' only for time requirements", () => {
    expect(fieldsFor("PERFORMED", null, formContext({ text: "3+ years of residential plumbing", category: "Experience" })).months).toBe(true);
    expect(fieldsFor("PERFORMED", null, plumbing).months).toBe(false);
  });
  it("a question covering several requirements is asked as one: no parts (fail closed)", () => {
    expect(fieldsFor("PERFORMED", null, formContext({ text: PLUMBING, category: "Skills" }, true)).parts).toBe(false);
  });
  it("the browser's spec gives exactly the server's fields", () => {
    for (const ctx of [plumbing, salesforce]) for (const c of CHOICES) for (const also of [null, true, false]) expect(fieldsFromSpec(c.value, also, formSpec(ctx))).toEqual(fieldsFor(c.value, also, ctx));
  });
});

// The database's structured-fields CHECK (migration 20261110010000), restated: every accepted submission must satisfy it.
function checkAllows(v: { involvement: Involvement; alsoDidSome: boolean | null; frequency: unknown; recency: unknown; claimedMonths: number | null }) {
  if (v.claimedMonths !== null && !(v.claimedMonths >= 1 && v.claimedMonths <= 720 && ["PERFORMED", "PART"].includes(v.involvement))) return false;
  switch (v.involvement) {
    case "NOT_DONE": return v.alsoDidSome === null && v.frequency === null && v.recency === null;
    case "PERFORMED": return v.frequency !== null && v.recency !== null && v.alsoDidSome === null;
    case "PART": return v.frequency !== null && v.recency !== null && (v.alsoDidSome === null || v.alsoDidSome === true);
    case "OBSERVED_TRAINED": return v.frequency === null && v.recency === null && v.alsoDidSome === null;
    default: return v.frequency === null && v.recency === null && (v.alsoDidSome === null || v.alsoDidSome === false);
  }
}

describe("submissions are checked like the database checks them", () => {
  const plumbing = formContext({ text: PLUMBING, category: "Skills" });
  const valid = (raw: RawSubmission) => { const r = parseSubmission(raw, plumbing); if (!r.ok) throw new Error(JSON.stringify(r.errors)); return r.value; };
  it("every accepted combination satisfies the database CHECK", () => {
    let accepted = 0;
    for (const c of CHOICES) for (const also of [undefined, "yes", "no"]) for (const freq of [undefined, "WEEKLY"]) for (const rec of [undefined, "CURRENT"]) for (const role of [undefined, ROLE]) for (const months of [undefined, "12"]) {
      const r = parseSubmission({ involvement: c.value, alsoDidSome: also, frequency: freq, recency: rec, experienceId: role, claimedMonths: months, parts: [] }, plumbing);
      if (!r.ok) continue;
      accepted++;
      expect(checkAllows(r.value), JSON.stringify(r.value)).toBe(true);
      if (r.value.involvement !== "NOT_DONE") expect(r.value.experienceId).toBe(ROLE);
    }
    expect(accepted).toBeGreaterThanOrEqual(CHOICES.length);
  });
  it("'supervised it, and also did some' is stored as PART; 'no' keeps the lead choice", () => {
    expect(valid({ involvement: "SUPERVISED", alsoDidSome: "yes", frequency: "WEEKLY", recency: "CURRENT", experienceId: ROLE })).toMatchObject({ involvement: "PART", alsoDidSome: true });
    expect(valid({ involvement: "SUPERVISED", alsoDidSome: "no", experienceId: ROLE })).toMatchObject({ involvement: "SUPERVISED", alsoDidSome: false, frequency: null });
  });
  it("refuses what the form wouldn't show, and missing required answers", () => {
    const bad: RawSubmission[] = [
      {},
      { involvement: "MANAGED" },
      { involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT" },
      { involvement: "PERFORMED", recency: "CURRENT", experienceId: ROLE },
      { involvement: "SUPERVISED", experienceId: ROLE },
      { involvement: "SUPERVISED", alsoDidSome: "no", frequency: "WEEKLY", experienceId: ROLE },
      { involvement: "OBSERVED_TRAINED", experienceId: ROLE, parts: ["0"] },
      { involvement: "NOT_DONE", experienceId: ROLE },
      { involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT", experienceId: ROLE, parts: ["2"] },
      { involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT", experienceId: ROLE, claimedMonths: "12" },
    ];
    for (const raw of bad) expect(parseSubmission(raw, plumbing).ok, JSON.stringify(raw)).toBe(false);
    expect(parseSubmission({ involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT", experienceId: ROLE, parts: ["0"] }, formContext({ text: "Salesforce", category: "Skills" })).ok).toBe(false);
  });
  it("part wording always comes from the approved list, never from the form", () => {
    const v = valid({ involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT", experienceId: ROLE, parts: ["1"] });
    expect(v.parts).toEqual([{ partIndex: 0, partText: "Installing residential plumbing", checked: false }, { partIndex: 1, partText: "Repairing residential plumbing", checked: true }]);
  });
});

describe("nothing on this path reaches Supported on its own", () => {
  const requirement = { text: PLUMBING, category: "Skills" as const };
  const read = (involvement: Involvement, frequency: WorkFrequency | null, recency: WorkRecency | null, consistency: Consistency, ticks: { checked: boolean; textShowsWork: boolean }[]) =>
    readStructuredAnswer({ requirement: requirement as never, involvement, alsoDidSome: null, frequency, recency, claimedMonths: null, consistency, compound: { approved: true, parts: ticks.map((t, i) => ({ part: String(i), ...t })) } }).verdict;
  it("a choice and ticks, with no text or text that doesn't show the parts, give Possible at most, for every combination", () => {
    for (const c of CHOICES) for (const f of [...FREQUENCIES.map(x => x.value), null]) for (const r of [...RECENCIES.map(x => x.value), null]) for (const ticks of [[true, true], [true, false], [false, false]]) {
      for (const consistency of [{ state: "no_text" } as Consistency, { state: "consistent", textShowsWork: false } as Consistency, { state: "text_unread" } as Consistency]) {
        expect(read(c.value, f, r, consistency, ticks.map(checked => ({ checked, textShowsWork: false }))), `${c.value} ${f} ${r} ${ticks} ${consistency.state}`).not.toBe("supported");
      }
    }
  });
  it("a description that shows only some ticked parts is not Supported", () => {
    const text = "I fix leaking faucets and toilets in homes most days.";
    const parts = recognizeParts({ splitId: "A58", explanation: text }).parts;
    const c = assessConsistency({ requirement, involvement: "PERFORMED", explanation: text });
    expect(read("PERFORMED", "MOST_DAYS", "CURRENT", c.consistency, parts.map(p => ({ checked: true, textShowsWork: p.shown })))).not.toBe("supported");
  });
});

describe("the follow-up questions are plain and never reveal what the reader found (E3, E4)", () => {
  const plumbing = formContext({ text: PLUMBING, category: "Skills" });
  const both = [{ partIndex: 0, partText: "Installing residential plumbing", checked: true }, { partIndex: 1, partText: "Repairing residential plumbing", checked: true }];
  const qs = (detail: string | null, parts = both, involvement: Involvement = "PERFORMED", done = new Set<number>()) => targetedQuestions({ involvement, detail, parts }, plumbing, done);
  it("a part the description shows gets no question; a ticked part it doesn't show gets one", () => {
    expect(qs("I install water heaters and fix leaks in homes every week.")).toEqual([]);
    expect(qs("I install water heaters in homes every week.").map(q => q.kind)).toEqual(["what_did_you_do"]);
    expect(qs(null).map(q => q.kind)).toEqual(["what_did_you_do", "what_did_you_do"]);
  });
  it("a part someone else did gets the neutral 'did you also do some of it yourself?'", () => {
    const q = qs("I install water heaters myself and send my apprentice out to fix leaks.");
    expect(q.map(x => x.kind)).toEqual(["others_did_it"]);
    expect(q[0].text).toBe("Your description mentions other people doing “Repairing residential plumbing”. Did you also do some of it yourself?");
  });
  it("no question for unticked parts, for parts already asked about, or for a denial", () => {
    expect(qs(null, [both[0], { ...both[1], checked: false }]).map(q => "partIndex" in q && q.partIndex)).toEqual([0]);
    expect(qs(null, both, "PERFORMED", new Set([0, 1]))).toEqual([]);
    expect(qs(null, [], "NOT_DONE")).toEqual([]);
  });
  it("a description saying someone else did it, or not plainly English, gets its own plain note", () => {
    expect(qs("The plumbers handle that. I just answer the phones.")[0].kind).toBe("mismatch");
    // When the others' clause doesn't name every term of the requirement, the existing check (F6) doesn't call it a
    // contradiction; each ticked part then gets its own question, so nothing is credited either way.
    expect(qs("Our plumbers do all of the installs and repairs; I book the appointments.").map(q => q.kind)).toEqual(["what_did_you_do", "what_did_you_do"]);
    expect(qs("Instalo calentadores de agua y reparo fugas en casas.")).toEqual([{ kind: "not_read", text: "We can't read this description, so your choice counts on its own." }]);
  });
  it("the wording never names the reader's findings, markers or the person's own words, and stays short and plain", () => {
    const all = [
      ...qs(null), ...qs("I install water heaters myself and send my apprentice out to fix leaks."), ...qs("The plumbers handle that. I just answer the phones."), ...qs("Our plumbers do all of the installs and repairs; I book the appointments."), ...qs("Instalo calentadores de agua."),
    ];
    for (const q of all) {
      expect(q.text).not.toMatch(/shown|transferr|marker|recogni|matched|found|detect|equivalen|pattern/i);
      expect(q.text).not.toMatch(/apprentice|plumbers|phones|book the appointments|calentadores/i);
      // About a 6th–8th grade level: short sentences, everyday words.
      for (const sentence of q.text.split(/(?<=[.?])\s+/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(16);
    }
    for (const c of CHOICES) expect(c.label.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
});
