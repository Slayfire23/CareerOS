// Phase 5.3 Stage 3: clause records from wink-nlp and compromise, for the shared scorer. Runs only in this scratch folder.
import { readFileSync, writeFileSync } from "node:fs";
import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";
import nlp from "compromise";

const corpus = JSON.parse(readFileSync("corpus.json", "utf8")).items;
const SELF = /^(?:i|me|my|myself|i'm|i've|i'd|i'll|i’m|i’ve)$/i;
const TEAM = /^(?:we|us|our|ourselves|we're|we've)$/i;
const subjectClass = s => {
  if (!s) return "none";
  const head = s.trim().split(/\s+/);
  if (head.some(w => SELF.test(w.replace(/[^\p{L}'’]/gu, "")))) return "self";
  if (head.some(w => TEAM.test(w.replace(/[^\p{L}'’]/gu, "")))) return "team";
  return "other";
};
const PASSIVE = /\b(?:is|are|was|were|be|been|being|gets?|got|gotten|'s)\s+(?:\w+ly\s+)?\w+(?:ed|en|ne|wn|nt|ut|ld)\b/i;

// wink-nlp: clauses split at punctuation and coordinating conjunctions; the subject is the last pronoun or noun before the
// first verb; negation from the model's negation flag; passive from an auxiliary followed by a participle.
const wink = winkNLP(model);
const its = wink.its;
function winkClauses(text) {
  const out = [];
  wink.readDoc(text).sentences().each(sentence => {
    const toks = [];
    sentence.tokens().each(t => toks.push({ w: t.out(), pos: t.out(its.pos), lemma: t.out(its.lemma), neg: t.out(its.negationFlag) }));
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      const vi = cur.findIndex(t => t.pos === "VERB");
      const before = vi < 0 ? cur : cur.slice(0, vi);
      const subj = [...before].reverse().find(t => ["PRON", "PROPN", "NOUN"].includes(t.pos));
      const clause = cur.map(t => t.w).join(" ");
      out.push({ subject: subj ? subjectClass(subj.w) : "none", verb: vi < 0 ? "" : cur[vi].lemma.toLowerCase(), negated: cur.some(t => t.neg || /^(?:not|n't|never|no)$/i.test(t.w)), passive: cur.some((t, i) => t.pos === "AUX" && /^(be|get)$/i.test(t.lemma) && cur[i + 1]?.pos === "VERB" && /(?:ed|en|ne|wn)$/i.test(cur[i + 1].w)) || PASSIVE.test(clause), text: clause });
      cur = [];
    };
    for (const t of toks) {
      if ((t.pos === "PUNCT" && /[,;:—–-]/.test(t.w)) || t.pos === "CCONJ") flush();
      else cur.push(t);
    }
    flush();
  });
  return out;
}

// compromise: its verb phrases, each with the subject it finds, its negative flag, and a passive test on the verb phrase.
function compromiseClauses(text) {
  const out = [];
  for (const sentence of nlp(text).sentences().out("array")) {
    const doc = nlp(sentence);
    const verbs = doc.verbs();
    const json = verbs.json();
    const subjects = verbs.subjects().out("array");
    json.forEach((v, i) => {
      out.push({ subject: subjectClass(subjects[i] ?? ""), verb: (v.verb?.infinitive ?? v.text).toLowerCase().split(/\s+/).pop(), negated: !!v.verb?.negative, passive: PASSIVE.test(v.text) || /^(?:is|are|was|were|gets?|got|been)\b/i.test(v.verb?.auxiliary ?? ""), text: v.text });
    });
    if (!json.length) out.push({ subject: "none", verb: "", negated: /\b(?:not|never|no)\b|n't/i.test(sentence), passive: false, text: sentence });
  }
  return out;
}

const result = { wink: {}, compromise: {}, timing: {} };
for (const [name, fn] of [["wink", winkClauses], ["compromise", compromiseClauses]]) {
  fn("Warm up the parser.");
  const t0 = performance.now();
  for (const it of corpus) result[name][it.id] = fn(it.text);
  result.timing[name] = { totalMs: Math.round(performance.now() - t0), perTextMs: +((performance.now() - t0) / corpus.length).toFixed(2) };
}
result.memoryMb = Math.round(process.memoryUsage().rss / 1e6);
writeFileSync("parsed.json", JSON.stringify(result));
console.log(result.timing, "rss MB", result.memoryMb);
