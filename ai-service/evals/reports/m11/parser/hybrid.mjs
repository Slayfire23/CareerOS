// The fairest test of compromise: rules-v19's own clauses, with compromise deciding only the subject, negation and passive.
import { readFileSync, writeFileSync } from "node:fs";
import nlp from "compromise";
const rules = JSON.parse(readFileSync("rules.json", "utf8")).rules;
const parsed = JSON.parse(readFileSync("parsed.json", "utf8"));
const SELF = /^(?:i|me|my|myself|i'm|i've|i'd|i’m|i’ve)$/i, TEAM = /^(?:we|us|our|we're|we've)$/i;
const cls = s => { if (!s) return "none"; const w = s.trim().split(/\s+/).map(x => x.replace(/[^\p{L}'’]/gu, "")); return w.some(x => SELF.test(x)) ? "self" : w.some(x => TEAM.test(x)) ? "team" : "other"; };
const PASSIVE = /\b(?:is|are|was|were|be|been|being|gets?|got|gotten|'s)\s+(?:\w+ly\s+)?\w+(?:ed|en|ne|wn|nt|ut|ld)\b/i;
parsed.hybrid = {};
const t0 = performance.now();
for (const [id, r] of Object.entries(rules)) {
  parsed.hybrid[id] = r.clauses.map(c => {
    const doc = nlp(c.text); const v = doc.verbs().json()[0]; const subj = doc.verbs().subjects().out("array")[0];
    // compromise's subject where it finds one; a verb-led clause with none stays the person's, as rules-v19 reads it.
    return { ...c, subject: subj ? cls(subj) : c.subject, negated: v ? !!v.verb?.negative || c.negated : c.negated, passive: PASSIVE.test(c.text) };
  });
}
parsed.timing.hybrid = { totalMs: Math.round(performance.now() - t0) };
writeFileSync("parsed.json", JSON.stringify(parsed));
console.log("hybrid done", parsed.timing.hybrid);
