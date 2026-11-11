# Answers in Other Languages: Investigation

November 5, 2026. **Analysis only.** Nothing here is implemented.

## Where things stand

Only answers that are plainly English are read automatically. Answers in other languages, or mixing languages, are saved, explained to the person, kept editable, and never promoted. That's safe, but it means a qualified person who answers in their own language gets no credit at all.

The rules can't simply be extended to other languages, because they're English word lists. Every safety check depends on them: negation, someone else doing the work, a hypothetical, a brief try, a correction, an instruction. A check that misses a language passes everything in it.

## What the evidence so far shows

- **The local model reads other languages well.** On the Phase 5 fixtures, `qwen3:8b` marked genuine non-English work as done and related every time.
- **The model is also fooled by injections, in every language.** Code stopped them all. That's why its reading can't be trusted directly.
- **Exact quoting still works in any language.** The model's spans were checked against the original text in Spanish, Portuguese, German, Korean, and Arabic.

## Options

| | How it works | Safety | Effort |
|---|---|---|---|
| **A. Ask the person to restate it in English** | When an answer isn't English, a follow-up asks for a short English description, which goes through the normal rules | Strong: nothing new is trusted | Small. It's almost the follow-up workflow as built, with different wording. It doesn't help someone who can't write English |
| **B. Show an English reading, and have the person correct it** | The local model drafts an English version. The person must edit or rewrite it in their own words before it counts, and then the normal rules read their text | Good, if a bare "looks right" can't count. The person's own English sentence is what's read, never the model's. Possible at most until measured | Medium |
| **C. Rules in each language** | Translate the safety word lists into Spanish, French, German, Portuguese | Weak: every phrasing missed is a pass. The English lists still miss things after five rounds | Large, and never finished |
| **D. Trust the model's translation** | Read the model's English as if the person wrote it | **Unsafe:** a translation can add a claim or drop an instruction, and nothing could check it | Small, but not acceptable |

## Recommendation

**Start with A, in local testing, then consider B.** Both keep the deterministic boundary authoritative, because the rules only ever read words the person wrote and confirmed. Neither needs the rules to understand another language.

What I'd need before building either:

1. **A better language check.** Today's check is a word-share heuristic. A small, offline language-identification library would make "is this plainly English?" more reliable. It would be a new dependency, so it needs your approval.
2. **Instruction checks on the original text** in the languages we can name, before anything is shown. This already partly exists in the shadow layer's word lists.
3. **Fixtures labeled by native speakers**, at least for the most likely languages. Agent labels aren't enough to trust a reading of nuance in another language.
4. **Possible as the ceiling,** until a separate evaluation justifies more.

**What I wouldn't do:** trust the model's translation (option D), or build per-language word lists (option C) as the main approach.
