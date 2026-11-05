import { WORK_VERB_WORDS } from "@/lib/ai/skill-relations";

// Whether a person's answer can be read by rules that only understand English. This is not language
// detection in general. It only says "this is plainly English", and everything else stays unresolved: it's
// kept for the person to edit, and it never moves a verdict. Word lists can't be complete, so an unknown
// result is the default, and no single character, accent, or alphabet decides anything.

export type AnswerLanguage = "en" | "other" | "mixed" | "unknown";

const LIST = (text: string) => new Set(text.split(/\s+/));

/** Common English words, including the ordinary ones in descriptions of work. */
const ENGLISH = LIST(`yes yeah experience knowledge the a an and or but so if of to in on at by for from with without about into over under after before during between
through per as than then that this these those there here it its i me my mine we us our ours you your he she they them their his her who whom which what when where why how
is am are was were be been being have has had do does did can could will would should may might must shall not no never
i've i'm i'd i'll we've we're we'd they're it's don't didn't doesn't haven't hasn't wasn't weren't can't won't
each every all any some many much more most few several both other another one two three four five six seven eight nine ten twelve twenty
day days daily week weeks weekly month months monthly year years yearly quarter quarterly morning mornings night nights shift shifts time times hour hours
first last next new old own same also just only still always often usually mostly mainly about around up down out off back
work works worked working job jobs team crew staff customer customers client clients patient patients company store shop office site floor
use uses used using make makes made making run runs ran running keep keeps kept set sets get gets got go goes went take takes took taking put puts
give gives gave find finds found send sends sent help helps helped write writes wrote read reads see saw sees know knows knew check checks checked
start starts started lead leads led cut cuts bring brings brought hold holds held call calls called walk walks walked pull pulls pulled move moves moved`);

/** Words that mark another language, and aren't also ordinary English words. Reaching any of these only
 * ever keeps an answer away from the rules. */
const OTHER = LIST(`el la los las del y que un una por para con como fue mis se al lo es en su sus pero muy yo mi trabajo
le les des du et une pour avec sur je ai au aux ce dans mes nous vous est sont mon ma
der die das und ich mit für von im den ein eine auf zu dem des am bei ist nicht auch
o os da dos das e em uma com meu minha no na não nao eu os foi
il di che per con sono gli della nel una anche
de het een en van ik ben op met voor niet bij aan
i w z na do nie się jest oraz dla ja mam przez
ve bir bu için ile ben da de olarak
và của tôi là có các một những cho với trong
ang ng sa mga ako at ko namin para
och att jag är för med ett på som`);
// English words that also appear above. They can't mark another language by themselves.
for (const shared of ENGLISH) OTHER.delete(shared);

const MIN_WORDS_TO_JUDGE = 3;
const MOSTLY_OTHER_ALPHABET = 0.3;
const ENGLISH_SHARE = 0.25;

type Reading = "en" | "other" | "unknown" | "too_short";

function readSentence(sentence: string): Reading {
  const value = sentence.normalize("NFC").toLowerCase();
  const letters = [...value.matchAll(/\p{L}/gu)];
  if (!letters.length) return "too_short";
  // A share of the letters, so a coworker's name or a place written in its own alphabet decides nothing.
  const otherAlphabet = letters.filter(m => !/\p{Script=Latin}/u.test(m[0])).length / letters.length;
  if (otherAlphabet >= MOSTLY_OTHER_ALPHABET) return "other";
  // Whole words only. A name with digits in it ("Quuxflow5bd6") says nothing about the language, and it isn't many words.
  const tokens = (value.split(/[\s,()/"“”]+/).map(t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replaceAll("’", "'"))).filter(t => /^[\p{Script=Latin}'-]+$/u.test(t));
  if (tokens.length < MIN_WORDS_TO_JUDGE) return "too_short";
  const english = tokens.filter(t => ENGLISH.has(t) || WORK_VERB_WORDS.has(t)).length;
  const other = tokens.filter(t => OTHER.has(t)).length;
  if (other >= 2 && other > english) return "other";
  if (english >= 1 && english > other && english / tokens.length >= ENGLISH_SHARE) return "en";
  return "unknown";
}

/** "en" only when every sentence long enough to judge is plainly English, and at least one is. */
export function answerLanguage(text: string): AnswerLanguage {
  const readings = (text.match(/[^.!?;\n]+/g) ?? []).map(readSentence).filter(r => r !== "too_short");
  if (!readings.length) return "unknown";
  const english = readings.filter(r => r === "en").length;
  if (english === readings.length) return "en";
  if (english > 0) return "mixed";
  return readings.every(r => r === "other") ? "other" : "unknown";
}

export const LANGUAGE_NOTE = "Saved, but not used yet. For now CareerOS can only read answers written fully in English, so this stays unresolved. You can edit it at any time.";
