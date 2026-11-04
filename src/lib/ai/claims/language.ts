import { WORK_VERB_WORDS, words } from "@/lib/ai/skill-relations";
import { hasDirectedText } from "@/lib/ai/untrusted-text";

// A conservative gate for semantic evidence. It does NOT understand these languages. It only answers "is
// this plainly a language whose warning words we know, and do none of them appear?", and every other answer
// blocks the text. Word lists can't be complete: "Je ne connais pas" is on one, and countless ways of saying
// the same thing aren't. That's why an unknown language, or an unclear one, is always a no, and why this can
// only keep text away from the model. It never turns text into evidence.

export type GatedLanguage = "en" | "es" | "fr" | "de" | "pt";
export type GateReason = "language_not_supported" | "negated" | "third_party" | "wish_or_plan" | "not_a_statement" | "directed_text";

const LIST = (text: string) => new Set(text.split(/\s+/));
const STOPWORDS: Record<GatedLanguage, Set<string>> = {
  en: LIST("the and of to in for with on at i my a an from by was were our their this that"),
  es: LIST("el la los las de del y que en un una por para con como fue mi mis se al lo"),
  fr: LIST("le la les des du et que en un une pour avec sur je ai au aux ce dans de mes"),
  de: LIST("der die das und ich mit für von im den ein eine auf zu dem des am bei"),
  pt: LIST("o a os as de do da dos das e que em um uma para com por meu minha no na"),
};
const HINTS: [GatedLanguage, RegExp][] = [["es", /[ñ¿¡]|ción\b|\bgestioné\b/iu], ["fr", /[èêëœ]|\bj['’]|\bd['’]|tion\b(?=.*\b(?:le|la|les|des)\b)/iu], ["de", /[äöüß]/iu], ["pt", /[ãõ]|ção\b/iu]];

/** Words that may mark a negative, in any language we can name. Applied whatever language is detected,
 * since detection can be wrong, and a false alarm only costs a suggestion. */
const NEGATION_WORDS = LIST(`no not never none without nothing cannot nunca jamás jamas ni tampoco ningún ningun ninguna ninguno sin nada carezco
ne pas jamais aucun aucune sans rien nicht kein keine keinen keiner keinem nie niemals ohne nichts não nao nenhum nenhuma sem nada
non mai senza nessun nessuna niet geen nooit zonder nie żaden bez değil yok hiç`);
const NEGATION_PHRASES = /\bn['’]\p{L}+|\bnunca\b|\bdon['’]?t\b|\bdidn['’]?t\b|\bwasn['’]?t\b|\bhaven['’]?t\b|\bisn['’]?t\b|\bwon['’]?t\b|\bcan['’]?t\b/iu;

// In English only a subject counts ("for the billing team" is who the work served, and the English check
// already reads subjects). Elsewhere word order varies too much, and a false alarm only costs a suggestion.
const THIRD_PARTY = /(?:^\W*|[,;:]\s*)(?:my|our|the)\s+(?:\w+\s+)?(?:boss|manager|supervisor|colleague|coworker|team|brother|sister|father|mother|wife|husband|vendor|contractor|client)\b|\b(?:mi|mis|nuestro|nuestra|su)\s+(?:\p{L}+\s+)?(?:jefe|jefa|compañero|compañera|colega|hermano|hermana|padre|madre|esposo|esposa|equipo|proveedor|cliente|supervisor)\b|\b(?:mon|ma|mes|notre|nos|son|sa)\s+(?:\p{L}+\s+)?(?:chef|collègue|frère|sœur|soeur|père|mère|mari|femme|équipe|fournisseur|client|responsable)\b|\b(?:mein|meine|meinem|unser|unsere|sein|seine)\s+(?:\p{L}+\s+)?(?:chef|chefin|kollege|kollegin|bruder|schwester|vater|mutter|mann|frau|team|lieferant|kunde)\b|\b(?:meu|minha|nosso|nossa|seu|sua)\s+(?:\p{L}+\s+)?(?:chefe|colega|irmão|irmã|pai|mãe|marido|esposa|equipe|equipa|fornecedor|cliente)\b/iu;

const WISH = /\b(?:would\s+like|hope\s+to|plan\s+to|want\s+to|me\s+gustar[íi]a|quiero|quisiera|espero|j['’]aimerais|je\s+voudrais|je\s+souhaite|j['’]esp[èe]re|ich\s+m[öo]chte|w[üu]rde\s+gerne?|ich\s+hoffe|gostaria|quero|pretendo|espero)\b/iu;

const NOT_STATEMENT = /\b(?:ejemplo|plantilla|modelo|hipot[ée]tic\w*|supuestamente|exemple|mod[èe]le|hypoth[ée]ti\w*|soi-disant|beispiel|vorlage|muster|hypothetisch|angeblich|exemplo|hipot[ée]tic\w*|alegadamente|example|template|sample|hypothetically|supposedly)\b/iu;

const DIRECTED = /\b(?:ignora\w*|ignorez|ignorer|ignoriere\w*|instruccion\w*|instrucci[óo]n|consignes?|anweisung\w*|instru[çc][õo]es|instru[çc][ãa]o|marca(?:r|d?o)?\s+(?:como|cada)|marquez|marquer|markiere\w*|valide[zr]?|aprueba|aprobar|genehmig\w*|aprovar|aprove)\b/iu;

/** Which language this plainly is, or null when it isn't plain. Any non-Latin letter means null, since none
 * of the warning words above would be recognized in it. */
export function plainLanguage(text: string): GatedLanguage | null {
  const value = text.normalize("NFC").toLowerCase();
  if (/\p{L}/u.test(value) && [...value.matchAll(/\p{L}/gu)].some(m => !/\p{Script=Latin}/u.test(m[0]))) return null;
  const tokens = value.match(/\p{L}+/gu) ?? [];
  if (tokens.length < 3) return null;
  const score = new Map<GatedLanguage, number>();
  for (const language of Object.keys(STOPWORDS) as GatedLanguage[]) score.set(language, tokens.filter(t => STOPWORDS[language].has(t)).length);
  for (const [language, pattern] of HINTS) if (pattern.test(value)) score.set(language, score.get(language)! + 2);
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (first[1] >= 2 && first[1] > second[1]) return first[0];
  // A fragment such as "Tuned kitchen workflows": English only if it has no other language's letters and
  // says what was done with an English work verb.
  const ascii = /^[\x00-\x7F]*$/.test(value);
  if (ascii && first[1] <= 1 && words(value).some(w => WORK_VERB_WORDS.has(w))) return "en";
  return null;
}

export const foreignNegation = (text: string) => {
  const value = text.normalize("NFC").toLowerCase();
  return (value.match(/\p{L}+/gu) ?? []).some(t => NEGATION_WORDS.has(t)) || NEGATION_PHRASES.test(value);
};
export const otherPersonInAnyLanguage = (text: string) => THIRD_PARTY.test(text.normalize("NFC"));

/** Why this text can't go to the model, or null. The default is no: passing means every check found nothing
 * and the language is plainly one we know. */
export function semanticGate(text: string): GateReason | null {
  const value = text.normalize("NFC");
  if (hasDirectedText(value) || DIRECTED.test(value)) return "directed_text";
  if (NOT_STATEMENT.test(value)) return "not_a_statement";
  if (foreignNegation(value)) return "negated";
  if (otherPersonInAnyLanguage(value)) return "third_party";
  if (WISH.test(value)) return "wish_or_plan";
  return plainLanguage(value) ? null : "language_not_supported";
}
