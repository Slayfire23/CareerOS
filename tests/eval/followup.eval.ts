import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Evidence, MatchRequest, MatchRequirement, Verdict } from "@/lib/ai/evidence";
import { callLocalModel, decideInterpretation } from "@/lib/ai/interpretation";
import { validateMatchResponse } from "@/lib/ai/match-validation";
import { applyAnswers, readAnswer, type LinkedAnswer } from "@/lib/ai/rules/answer-review";
import { answerProblem } from "@/lib/ai/rules/clarifications";
import { assessRequirements, RULES_VERSION, rulesResponse } from "@/lib/ai/rules/engine";
import { followUpNeed, readFollowUpReply } from "@/lib/ai/rules/follow-up-reply";
import { keyForRequirement } from "@/lib/ai/rules/review-queue";

// The follow-up workflow end to end on independent scenarios, scored against an independent labeler.
//   FOLLOWUP_SPLIT=dev|blind FOLLOWUP_REPORT=out.json [FOLLOWUP_SEALED=1] [FOLLOWUP_URL=...] \
//   npx vitest run --config vitest.eval.config.mts followup
// A sealed run writes counts only. The blind split is always run sealed until the owner's labels are in.

type Scenario = { id: string; split: string; requirement: string; category: "Skills" | "Experience"; role: string; role_months: number; role_description?: string | null; answer: string; reply: string; type: string; reply_kind: string; evidence_group: string | null };
/** `answer_verdict` is the whole entry without the reply (title, dates, description, answer); `after_reply_verdict`, where
 * a split has it, is the same with the reply read too. */
type Label = { id: string; answer_verdict: "supported" | "possible" | "not_enough" | "not_supported"; after_reply_verdict?: "supported" | "possible" | "not_enough" | "not_supported"; personally_did: boolean; reply_ok: boolean; involvement?: string; hands_on?: boolean };
const CREDIT: Record<string, number> = { supported: 2, possible: 1 };
const credit = (v: string) => CREDIT[v] ?? 0;
const percentile = (values: number[], p: number) => Math.round([...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0);
const month = (asOf: string, back: number) => {
  const [y, m] = asOf.split("-").map(Number);
  const index = y * 12 + (m - 1) - back;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

const DIR = process.env.FOLLOWUP_DIR ?? "m11_followup";

it("follow-up evaluation", { timeout: 1_800_000 }, async () => {
  const split = process.env.FOLLOWUP_SPLIT!;
  const sealed = process.env.FOLLOWUP_SEALED === "1" || (split === "blind" && process.env.FOLLOWUP_UNSEAL !== "1");
  const scenarios = (JSON.parse(readFileSync(`tests/fixtures/${DIR}/scenarios.json`, "utf8")).scenarios as Scenario[]).filter(s => s.split === split);
  const labels = new Map((JSON.parse(readFileSync(`tests/fixtures/${DIR}/labels.json`, "utf8")).labels as Label[]).map(l => [l.id, l]));
  const t = {
    scenarios: scenarios.length, modelErrors: 0, invalidCitations: 0,
    falseSupported: 0, unsafePossible: 0, unsafePossibleFromReply: 0,
    legitimate: 0, legitimateMissedByRules: 0, recoveredByReader: 0, recoveredByReply: 0, stillMissed: 0,
    honestSubmitted: 0, honestRefused: 0,
    followUps: 0, usefulFollowUps: 0, followUpsOnUnqualified: 0, repeatedQuestions: 0, repeatsAvoided: 0,
    replies: 0, repliesOk: 0, replyOkAccepted: 0, replyBadAccepted: 0, replyBadAcceptedByKind: {} as Record<string, number>,
    injections: 0, injectionsChangedOutcome: 0, nonEnglishPromoted: 0, paraphrases: 0, paraphrasesRecognized: 0,
    finalVerdicts: {} as Record<string, number>,
    // Phase 5.2 measures, fixed before implementation. A label's verdict is the bar: credit above it is unsafe.
    engineCreditAboveLabel: 0, engineCreditAboveLabelByTitle: {} as Record<string, number>,
    creditAboveLabel: 0, unsafePossibleHandsOn: 0, unsafeByInvolvement: {} as Record<string, number>,
    labelSupported: 0, labelSupportedGotSupported: 0, labelSupportedGotPossible: 0, labelPossible: 0, labelPossibleGotPossible: 0,
    honestRefusedByMessage: {} as Record<string, number>, unqualified: 0, unqualifiedRefused: 0,
    repliesBadKind: 0, repliesBadKindAccepted: 0, contradictingRepliesAccepted: 0, injectionsRaisedCredit: 0,
  };
  const ms: number[] = [];
  const rows: unknown[] = [];
  const askedKeys = new Set<string>();
  const askedGroups = new Set<string>();

  for (const s of scenarios) {
    const label = labels.get(s.id)!;
    const requirement: MatchRequirement = { index: 0, text: s.requirement, category: s.category, priority: "Required" };
    const evidence: Evidence[] = [{ id: "experience:00000000-0000-4000-8000-000000000001", kind: "experience", job_title: s.role, start_month: month("2026-11", Math.max(0, s.role_months - 1)), end_month: null, description: s.role_description ?? null }];
    const request: MatchRequest = { request_id: "6f1c1f43-8f5c-4a59-9f43-6b1d2b0b7e01", provider: "rules", as_of_month: "2026-11", requirements: [requirement], evidence };
    const rulesOnly = assessRequirements(request)[0].verdict;
    const refused = answerProblem(s.answer, s.requirement);
    const reader: Verdict = refused ? "insufficient_information" : readAnswer(requirement, s.answer).verdict;
    const ANSWER_ID = "experience:00000000-0000-4000-8000-000000000002";
    const linked: LinkedAnswer[] = refused ? [] : [{ action: "confirm", questionKey: keyForRequirement(requirement), evidenceId: ANSWER_ID, detail: s.answer }];
    const withAnswer: MatchRequest = { ...request, evidence: [...evidence, { ...evidence[0], id: ANSWER_ID, description: s.answer, source: "clarification" } as Evidence], ...(linked.length ? { linked_answers: linked } : {}) };
    const applied = validateMatchResponse(withAnswer, JSON.parse(JSON.stringify(rulesResponse(withAnswer, { provider: "rules", model: null, methodVersion: RULES_VERSION }, f => applyAnswers(withAnswer, f, linked, keyForRequirement)))), { provider: "rules", model: null }).findings[0].verdict;
    let final: Verdict = applied;
    const answerVerdict = final;
    let quotedSentence: string | null = null;
    let asked = false;
    let replyOutcome: string | null = null;
    let decision: string | null = null;
    if (!refused && final === "insufficient_information") {
      // As in production: code asks first, without the model; only otherwise may the model suggest a question.
      const need = followUpNeed(requirement, s.answer);
      let r: { outcome: string; followUpSpan?: { start: number; end: number } | null } = { outcome: "none", followUpSpan: null };
      if (need) {
        r = { outcome: "follow_up", followUpSpan: { start: need.start, end: need.end } };
        decision = `code:${need.kind}`;
      } else {
        const call = await callLocalModel(s.requirement, s.answer, { url: process.env.FOLLOWUP_URL, model: "qwen3:8b" });
        if (call.error) t.modelErrors++;
        else ms.push(call.ms);
        const m = decideInterpretation(requirement, s.answer, rulesOnly, call.raw);
        decision = `${m.reason}/${m.checked?.link ?? "-"}/${(m.checked?.facts ?? []).map(f => `${f.actor}:${f.status}:${f.about}`).join(",")}/drop${m.checked?.droppedFacts ?? 0}`;
        for (const e of m.evidence) if (s.answer.slice(e.start, e.end) !== e.text) t.invalidCitations++;
        r = m;
      }
      if (r.outcome === "follow_up" && r.followUpSpan) {
        const key = keyForRequirement(requirement);
        const group = s.evidence_group ? `group:${s.evidence_group}` : null;
        if (askedKeys.has(key) || (group && askedGroups.has(group))) t.repeatsAvoided++;
        else {
          asked = true;
          askedKeys.add(key);
          if (group) askedGroups.add(group);
        }
      }
      if (asked) {
        t.followUps++;
        if (label.personally_did || label.answer_verdict === "possible" || label.answer_verdict === "supported") t.usefulFollowUps++;
        else t.followUpsOnUnqualified++;
        if (s.reply.trim()) {
          const quoted = s.answer.slice(r.followUpSpan!.start, r.followUpSpan!.end);
          quotedSentence = quoted;
          const reading = readFollowUpReply(requirement, quoted, s.reply, s.answer);
          replyOutcome = reading.reason;
          t.replies++;
          if (label.reply_ok) t.repliesOk++;
          if (reading.outcome === "possible_candidate") {
            if (label.reply_ok) t.replyOkAccepted++;
            else {
              t.replyBadAccepted++;
              t.replyBadAcceptedByKind[s.reply_kind] = (t.replyBadAcceptedByKind[s.reply_kind] ?? 0) + 1;
            }
            final = "possible";
            if (!label.personally_did) t.unsafePossibleFromReply++;
          }
        }
      }
    }
    // A repeated question about the same work is one asked when it shouldn't be.
    if (asked && s.evidence_group && scenarios.some(o => o !== s && o.evidence_group === s.evidence_group && scenarios.indexOf(o) < scenarios.indexOf(s))) t.repeatedQuestions++;

    t.finalVerdicts[final] = (t.finalVerdicts[final] ?? 0) + 1;
    if (final === "supported" && label.answer_verdict !== "supported") t.falseSupported++;
    if (final === "possible" && !label.personally_did && (label.answer_verdict === "not_enough" || label.answer_verdict === "not_supported")) t.unsafePossible++;
    if (label.personally_did) {
      t.legitimate++;
      t.honestSubmitted++;
      if (refused) t.honestRefused++;
      if (rulesOnly !== "supported" && rulesOnly !== "possible") {
        t.legitimateMissedByRules++;
        if (reader === "supported" || reader === "possible") t.recoveredByReader++;
        else if (final === "possible") t.recoveredByReply++;
        else t.stillMissed++;
      }
    }
    if (s.type === "prompt_injection") {
      t.injections++;
      if (final !== rulesOnly) t.injectionsChangedOutcome++;
    }
    if ((s.type === "multilingual" || s.type === "other_language") && final !== rulesOnly) t.nonEnglishPromoted++;
    const level = (v: string | undefined) => (v === "supported" ? 2 : v === "possible" ? 1 : 0);
    // The final verdict is held to the label with the reply read, where the split has one.
    const bar = level(label.after_reply_verdict ?? label.answer_verdict);
    // Credit the engine gives from the title, dates or description alone, above what the whole entry supports.
    if (credit(rulesOnly) > level(label.answer_verdict)) {
      t.engineCreditAboveLabel++;
      t.engineCreditAboveLabelByTitle[s.role] = (t.engineCreditAboveLabelByTitle[s.role] ?? 0) + 1;
    }
    if (credit(final) > bar) {
      t.creditAboveLabel++;
      t.unsafeByInvolvement[label.involvement ?? "unlabelled"] = (t.unsafeByInvolvement[label.involvement ?? "unlabelled"] ?? 0) + 1;
      if (final === "possible" && bar === 0 && label.hands_on) t.unsafePossibleHandsOn++;
      if (s.type === "prompt_injection") t.injectionsRaisedCredit++;
    }
    if (bar === 2) {
      t.labelSupported++;
      if (final === "supported") t.labelSupportedGotSupported++;
      else if (final === "possible") t.labelSupportedGotPossible++;
    } else if (bar === 1) {
      t.labelPossible++;
      if (final === "possible") t.labelPossibleGotPossible++;
    } else {
      t.unqualified++;
      if (refused) t.unqualifiedRefused++;
    }
    if (bar > 0 && refused) {
      const kind = refused.slice(0, 40);
      t.honestRefusedByMessage[kind] = (t.honestRefusedByMessage[kind] ?? 0) + 1;
    }
    if (replyOutcome !== null && ["contradicts_answer", "bare_yes", "repeats_question", "injection", "undercuts", "vague"].includes(s.reply_kind)) {
      t.repliesBadKind++;
      if (final === "possible" && answerVerdict !== "possible") t.repliesBadKindAccepted++;
    }
    if (replyOutcome !== null && s.reply_kind === "contradicts_answer" && final === "possible" && answerVerdict !== "possible") t.contradictingRepliesAccepted++;
    if (s.type === "honest_paraphrase") {
      t.paraphrases++;
      if (final !== "insufficient_information" || asked) t.paraphrasesRecognized++;
    }
    if (!sealed) rows.push({ id: s.id, type: s.type, reply_kind: s.reply_kind, requirement: s.requirement, answer: s.answer, reply: s.reply, label, rulesOnly, refused, reader, answerVerdict, asked, quotedSentence, decision, replyOutcome, replyIfAsked: s.reply.trim() ? readFollowUpReply(requirement, quotedSentence ?? s.answer, s.reply, s.answer).reason : "skipped", final });
  }
  const report = { split, sealed, totals: t, latency: { p50Ms: percentile(ms, 0.5), p95Ms: percentile(ms, 0.95), maxMs: ms.length ? Math.round(Math.max(...ms)) : 0, calls: ms.length }, ...(sealed ? {} : { rows }) };
  mkdirSync(dirname(process.env.FOLLOWUP_REPORT!), { recursive: true });
  writeFileSync(process.env.FOLLOWUP_REPORT!, JSON.stringify(report, null, 1));
  expect(t.invalidCitations).toBe(0);
});
