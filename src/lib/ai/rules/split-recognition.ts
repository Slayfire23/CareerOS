import { answerLanguage } from "@/lib/ai/answer-language";
import { answerStatements, DEFAULT_TEXT_RULES, othersParts, type TextRules } from "@/lib/ai/evidence-boundary";
import approved from "@/lib/ai/rules/data/approved_splits.json";
import { hasDirectedText } from "@/lib/ai/untrusted-text";

// Phase 5.3 Stage D.1: recognition of the 33 owner-approved compound splits, per part. INACTIVE: nothing in the app
// calls it (an isolation test enforces that) until the owner approves wiring (Stages E–F). Pure: no I/O, no model.
//
// For one approved split and one explanation, it says which parts the person's own words show. It never gives a verdict:
// the rule table (`readStructuredAnswer`) does that from the person's ticks and these readings (O3, X2 held, D1).
//
// The algorithm is a verbatim port of the owner-reviewed V5 simulation (docs/PHASE5_3_DD1_DD2_SPEC.md, R1, Q1–Q5) with
// the Stage B failure-3 consumer of `bounded` (docs/PHASE5_3_STAGE_B_REPORT.md section 7.3). Nothing is simplified: a
// parity fixture of 284 rows in the test suite must match it exactly. The patterns are the
// approved ones, verbatim (data/approved_splits.json). Changing either needs owner approval and a new version.
//
// Added for safety, outside the simulation: text that isn't plainly English isn't read (D3), and instructions or other
// directed text aren't read; both give nothing shown.

export const RECOGNITION_VERSION = "splits-v1" as const;

export type ApprovedSplit = {
  requirement: string;
  parts: string[];
  markers: string[][];
  equivalents: string[][];
  tool?: string[];
  toolctx?: { object: string; rivals: string };
  elide?: ({ verbs: string; objects: string } | null)[];
  context?: ({ needs: string; verbs: string; inherit: string } | null)[];
  bound_antecedent?: (string | null)[];
};

export const APPROVED_SPLITS: Readonly<Record<string, ApprovedSplit>> = approved.splits as Record<string, ApprovedSplit>;

export type PartReading = {
  part: string;
  /** The person's own words show this part. */
  shown: boolean;
  /** Someone else's words name this part's work (the simulation's per-part transfer). Informational; how the rule table
   * uses it is a wiring decision (Stages E–F). */
  transferred: boolean;
};

export type SplitRecognition = {
  version: typeof RECOGNITION_VERSION;
  splitId: string;
  /** False when the text isn't read at all (not English, or directed text); every part is then not shown. */
  read: boolean;
  notRead?: "not_english" | "directed_text";
  parts: PartReading[];
  /** The work went to someone else and the person has no own clause left (the simulation's whole-transfer signal). */
  transferAll: boolean;
  reasons: string[];
};

const rx = (s: string) => new RegExp(s, "iu");
const anyOf = (list: string[], text: string) => list.some(p => rx(p).test(text));
const CORRECTION = /\b(well|actually|really|mostly|though|but)\b/i;
const ONLY = /\bI\s+(?:only|just)\s+([^.;]+)/i;

// V4: clause-level attribution rules.
const SUBJECT_CHANGE = /(?:^|[,;]|\b(?:and|but|while|where|so)\b)\s*(?:(?:the|our|my|their|his|her|another|a|an|some|every)\s+)?(?:[\w-]+\s+)?(?:[A-Z][a-z]+|HR|IT|she|he|they|[a-z]+(?:er|ers|or|ors|ist|ists|ant|ants|ians)|team|crew|staff|agency|department|office|company|manager|managers|guy|guys|tech|techs|nurses|stylists|analyst|analysts|controller|accountant|director|owner|husband|wife|brother|sister|desk|center)\s+(?:does|do|did|handles?|handled|runs?|ran|makes?|made|takes?|took|builds?|built|designs?|designed|plans?|planned|installs?|installed|prepares?|prepared|starts?|started|owns?|keeps?|kept|books?|booked|calls?|called|enters?|entered|finish(?:es)?|finished|loads?|unloads?|reconciles?|verif(?:y|ies)|approves?|writes?|wrote|creates?|maintains?|manages?|fell|fells|prunes?|cuts?|styles?|counts?|dispatch(?:es)?|schedules?|onboards?|recruits?|hires?)\b/;
const SUBJECT_VERBS = SUBJECT_CHANGE.source.slice(SUBJECT_CHANGE.source.lastIndexOf("\\s+(?:does"));
// A relative clause without "that": a determiner and an agent, or a name, then a verb ("the spec Kevin designs").
const REL_SUBJECT = new RegExp(String.raw`\s(?:(?:the|our|my|their|his|her|another)\s+(?:[\w-]+\s+)?(?:[a-z]+(?:er|ers|or|ors|ist|ists|ant|ants|ians)|team|crew|staff|agency|department|office|company|manager|managers|guy|guys|tech|techs|nurses|stylists|analyst|analysts|controller|accountant|director|owner)|[A-Z][a-z]+)` + SUBJECT_VERBS);
const INSTRUMENT = /\b(?:using|from|based on|with the help of|off of)\b[^,.;]*?(?=\s+and\s|[,.;]|$)/gi;
const SEND_TO = /\b(?:send|sends|sent|ask|asks|asked|tell|tells|told|have|has|had|get|gets|got)\s+[^,.;]*?\bto\s+[^,.;]*/gi;
const OVERSIGHT = /^(?:review|reviews|reviewed|check|checks|checked|audit|audits|audited|oversee|oversees|oversaw|supervise|supervises|supervised|coach|coaches|coached|approve|approves|approved|sign|signs|signed|log|logs|logged)$/i;
const WRITE_UP = /\bI\s+(?:\w+\s+)?(?:write|writes|wrote)\s+up\b/i;
const AGENT_NOUN = /(?:er|ers|or|ors|ist|ists)$/i;

const ownStatements = (text: string, rules: TextRules) =>
  answerStatements(text, rules).filter(s => s.subject === "self" && s.ownership === "performed" && (!s.exposureOnly || !!s.narrowed) && !s.brief);

function v4Clauses(text: string, rules: TextRules): string[] {
  const clauses: string[] = [];
  for (const s of ownStatements(text, rules)) {
    let c = s.readable;
    const cuts = [c.slice(1).search(SUBJECT_CHANGE) + 1, c.search(REL_SUBJECT)].filter(i => i > 0);
    if (cuts.length) c = c.slice(0, Math.min(...cuts));
    c = c.replace(INSTRUMENT, " ").replace(SEND_TO, " ");
    clauses.push(c);
  }
  return clauses;
}
function headVerb(clause: string): string {
  const m = clause.match(/\bI(?:'m|\s+am)?\s+(?:(?:also|then|usually|still|personally|just|only|always|now)\s+)*([a-z]+)/i);
  return m ? m[1] : "";
}
function shows(words: string[], clause: string): boolean {
  for (const p of words) {
    const m = clause.match(new RegExp(p, "iu"));
    if (!m) continue;
    const token = clause.slice(m.index!).match(/^[\w-]+/)?.[0] ?? m[0];
    const stemAgent = AGENT_NOUN.test(token) && !new RegExp(p, "iu").source.match(/er|or|ist/);
    if (stemAgent) continue;
    // Under a review or documentation verb, only a marker that is that verb itself counts ("I approve invoices").
    if ((OVERSIGHT.test(headVerb(clause)) || WRITE_UP.test(clause)) && !new RegExp(p, "iu").test(headVerb(clause))) continue;
    return true;
  }
  return false;
}
function attributeV4(text: string, split: ApprovedSplit, rules: TextRules) {
  const clauses = v4Clauses(text, rules);
  const words = (i: number) => [...split.markers[i], ...split.equivalents[i]];
  const shown = split.parts.map((_, i) => clauses.some(c => shows(words(i), c)));
  // Other people's work only: the person's own retracted claim ("I do X. Well, …") is not someone else doing it.
  const others = othersParts(text, true, false, rules === "v21").join(" ");
  let transferred = false;
  const partTransferred = split.parts.map(() => false);
  split.parts.forEach((_, i) => {
    if (anyOf(words(i), others) || /\b(the|all the)\s+work\b/i.test(others)) { if (shown[i]) shown[i] = false; transferred = true; partTransferred[i] = true; }
  });
  const only = text.match(ONLY);
  if (only && CORRECTION.test(text)) split.parts.forEach((_, i) => { if (shown[i] && !anyOf(words(i), only[1])) shown[i] = false; });
  return { shown, partTransferred, transferAll: transferred && shown.every(x => !x) && clauses.length === 0 };
}

// V5: named tools, Q4 elided objects, A22 context (as configured per split).
const NP = /\b(?:the|our|my|their|his|her)\s+(?:[\w-]+\s+){0,2}?([\w-]+s)\b/gi; // plural noun phrases, for antecedent ambiguity
// An antecedent clause must have the person as its subject: it opens (after an optional discourse word) on I / I'm / I've.
const MINE = /^\W*(?:(?:well|actually|so|then|also|and|but|now|mostly|really),?\s+)?(?:I|I'm|I've|I'd)\b/i;
const KNOW = /\b(know|knew|proficient|familiar|certified|skilled|fluent|good with|learn\w*|took a course)\b/i;
/** The groups a demonstrative ("those customers") could also mean, for the bound consumer's ambiguity check. */
const GROUP = /^(?:customers|clients|accounts|balances|invoices|debtors|receivables|payers|buyers|tenants|members)$/i;

function attributeV5(text: string, split: ApprovedSplit, rules: TextRules) {
  const base = attributeV4(text, split, rules);
  const shown = [...base.shown];
  const reasons: string[] = [];
  const clauses = v4Clauses(text, rules);
  const words = (i: number) => [...split.markers[i], ...split.equivalents[i]];
  // Named tool (Q5): the tool in the same own clause as the part's evidence, or in an earlier own clause ("I" as subject)
  // that uses it (not mere knowledge) for this work's object, with no rival tool named anywhere in the person's own clauses.
  split.tool?.forEach((tool, i) => {
    if (!tool || !shown[i]) return;
    const toolRx = new RegExp(tool, "iu");
    const ctx = split.toolctx;
    const rival = ctx ? clauses.some(c => new RegExp(ctx.rivals, "iu").test(c)) : false;
    const at = clauses.findIndex(c => shows(words(i), c));
    const same = clauses.some(c => shows(words(i), c) && toolRx.test(c));
    const earlier = !!ctx && at > 0 && clauses.slice(0, at).some(p => MINE.test(p) && toolRx.test(p) && !KNOW.test(p) && new RegExp(String.raw`\b(?:${ctx.object})\b`, "iu").test(p));
    if (rival) { shown[i] = false; reasons.push(`part ${i + 1}: another tool named for the work (ambiguous or contradicted; ask)`); }
    else if (same) reasons.push(`part ${i + 1}: tool in the same own clause`);
    else if (earlier) reasons.push(`part ${i + 1}: tool established in an earlier own clause`);
    else { shown[i] = false; reasons.push(`part ${i + 1}: tool not established for this work (partial relevance; ask)`); }
  });
  // Q4: a verb with no object, or with them/it, inherits the object only from an earlier own clause.
  split.elide?.forEach((e, i) => {
    if (!e || shown[i]) return;
    const bare = new RegExp(String.raw`\b(?:${e.verbs})\b(\s+(them|it))?\s*(?=$|[,.;]|\b(?:and|but|never|now|myself|too|also|every|on|at|when|while)\b)`, "iu");
    clauses.forEach((c, k) => {
      if (shown[i] || !bare.test(c)) return;
      const objRx = new RegExp(String.raw`\b(?:${e.objects})\b`, "iu");
      // The antecedent must be the person's own clause: "I" is its subject (never "marketing builds the decks").
      const prior = clauses.slice(0, k).reverse().find(p => MINE.test(p) && objRx.test(p));
      if (!prior) { reasons.push(`part ${i + 1}: elided object not found in an earlier own clause`); return; }
      const others = [...prior.matchAll(NP)].map(m => m[0]).filter(np => !objRx.test(np));
      if (others.length) { reasons.push(`part ${i + 1}: ambiguous antecedent (${others.join(", ")})`); return; }
      shown[i] = true; reasons.push(`part ${i + 1}: object inherited from "${prior.slice(0, 50)}"`);
    });
  });
  // A22-style context: the clause names the object but not whose; the context may come from an earlier own clause.
  split.context?.forEach((cx, i) => {
    if (!cx || shown[i]) return;
    const own = new RegExp(String.raw`\b(?:${cx.verbs})\b[^.]{0,20}${cx.needs}`, "iu");
    clauses.forEach((c, k) => {
      if (shown[i] || !own.test(c)) return;
      const prior = clauses.slice(0, k).find(p => MINE.test(p) && new RegExp(String.raw`\b(?:${cx.inherit})\b`, "iu").test(p));
      if (prior) { shown[i] = true; reasons.push(`part ${i + 1}: context inherited from "${prior.slice(0, 50)}"`); }
      else reasons.push(`part ${i + 1}: context missing (ask)`);
    });
  });
  // Stage B failure 3 (owner-approved specification, A77 collections only): an approved phrase that names the person's own
  // act's end condition ("call … customers … until they pay") may match `bounded`, never `text`. A demonstrative or
  // pronoun object needs the person's own earlier words to name the antecedent (`bound_antecedent`), with no other group
  // it could also mean. Ownership and corrections are checked on the statements themselves; others' work cancels.
  if (rules === "v21") split.bound_antecedent?.forEach((terms, i) => {
    if (!terms || shown[i]) return;
    const anteRx = new RegExp(String.raw`\b(?:${terms})\b`, "iu");
    const own = ownStatements(text, rules);
    const othersSaid = othersParts(text, true, false, true).join(" ");
    const only = text.match(ONLY);
    own.forEach((st, k) => {
      if (shown[i] || !st.bounded) return;
      const hit = words(i).map(p => st.bounded!.match(new RegExp(p, "iu"))).find(m => m && !new RegExp(words(i).join("|"), "iu").test(st.readable));
      if (!hit) return;
      if (anyOf(words(i), othersSaid) || (only && CORRECTION.test(text) && !anyOf(words(i), only[1]))) { reasons.push(`part ${i + 1}: bound match cancelled (others or correction)`); return; }
      const region = st.bounded!.slice(hit.index!, hit.index! + hit[0].length);
      if (/\b(?:those|these|them|the\s+same)\b/i.test(region)) {
        const before = [...own.slice(0, k).map(o => o.readable), st.bounded!.slice(0, hit.index!)].join(" . ");
        if (!anteRx.test(before)) { reasons.push(`part ${i + 1}: "${region.slice(0, 40)}" has no own antecedent`); return; }
        const rivals = [...before.matchAll(NP)].filter(m => GROUP.test(m[1]) && !anteRx.test(m[0])).map(m => m[0]);
        if (rivals.length) { reasons.push(`part ${i + 1}: ambiguous antecedent (${rivals.join(", ")})`); return; }
      }
      shown[i] = true; reasons.push(`part ${i + 1}: approved phrase on the own act with its end condition`);
    });
  });
  return { shown, partTransferred: base.partTransferred, transferAll: base.transferAll, reasons };
}

/** Which parts of an approved split the person's own explanation shows. Reads with the matching default (rules-v21) unless
 * `textRules` says otherwise; under another reader there is no `bounded`, so the end-condition rule finds nothing. */
export function recognizeParts(input: { splitId: string; explanation: string; textRules?: TextRules }): SplitRecognition {
  const split = APPROVED_SPLITS[input.splitId];
  if (!split) throw new Error(`Not an approved split: ${input.splitId}`);
  const rules = input.textRules ?? DEFAULT_TEXT_RULES;
  const text = input.explanation.trim();
  const nothing = (notRead?: SplitRecognition["notRead"]): SplitRecognition => ({ version: RECOGNITION_VERSION, splitId: input.splitId, read: false, ...(notRead ? { notRead } : {}), parts: split.parts.map(part => ({ part, shown: false, transferred: false })), transferAll: false, reasons: [] });
  if (!text) return nothing();
  if (answerLanguage(text) !== "en") return nothing("not_english");
  if (hasDirectedText(text)) return nothing("directed_text");
  const r = attributeV5(text, split, rules);
  return { version: RECOGNITION_VERSION, splitId: input.splitId, read: true, parts: split.parts.map((part, i) => ({ part, shown: r.shown[i], transferred: r.partTransferred[i] })), transferAll: r.transferAll, reasons: r.reasons };
}
