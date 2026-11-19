# O*NET and ESCO: terminology research

November 3, 2026. Licensing was read from each publisher's own pages, and every prototype entry was checked by hand against a public page. I read pages and public API results only: no dataset was downloaded.

## Recommendation

**Keep a small, reviewed mapping and grow it by hand from both sources. Don't import either taxonomy wholesale.**

Both licenses allow this. The limit is matching safety: most of what these taxonomies hold is occupation-to-skill links and descriptive labels, which would add false matches if treated as "the same thing". They're a good source of exact alternate names for a person to review, and no more.

## Comparison

| | O*NET | ESCO |
|---|---|---|
| Publisher | U.S. Department of Labor, Employment and Training Administration | European Commission |
| License | O*NET 31.0 Database under **CC BY 4.0** | Free for **any purpose and any party** under the Commission's terms |
| Commercial use | Its license page doesn't address this directly; CC BY 4.0 permits it in general | Covered by "any purpose" |
| Changes | Allowed, and must be indicated | Allowed; an adapted version must be clearly indicated as one |
| Required credit | Credit the database and USDOL/ETA, link the license, state changes, and say USDOL/ETA hasn't approved, endorsed, or tested them | "This service uses the ESCO classification of the European Commission." |
| Trademark | O*NET® is a USDOL/ETA trademark: show the symbol, and use it as an adjective | None noted on the pages read |
| Scope of the license | Only the database download files; **other O*NET site content falls under other licenses** | Classification data; some parts differ: skill cards are CC BY-SA 4.0, the API code is EUPL 1.2 |
| Best for | U.S. job titles, tasks, and tool names | Alternate labels for skills, in many languages |
| Access | Web pages, downloadable database | Web pages, public API, downloads |
| Weakness here | Sample titles and tasks show context, not synonyms | Labels are often phrases ("perform venepuncture procedures") and European spelling |

**Two things to confirm before going beyond this prototype:**

1. **O*NET's license covers the database files, not the site.** The prototype's facts were read from O*NET OnLine pages. Short factual name equivalences are low-risk, and credit is given, but a larger mapping should be built from the licensed database files, which needs your approval to download.
2. **I'm not a lawyer.** This is my reading of the published terms, for a project that may later serve other people.

Sources: [O*NET database license](https://www.onetcenter.org/license_db.html), [ESCO FAQ](https://esco.ec.europa.eu/en/about-esco/faq?page=4), [ESCO API](https://esco.ec.europa.eu/en/use-esco/use-esco-services-api).

## Prototype: `terminology-v1`

`src/lib/ai/rules/data/terminology.json`: 7 groups, each with its sources. It's inside the Next.js app, so rules-only matching still works with the laptop off.

| Name | Same as | Related only | Source |
|---|---|---|---|
| Phlebotomy | venipuncture, venepuncture | blood collection | ESCO alternate label; O*NET Phlebotomists |
| Drywall finishing | sheetrock finishing, drywall taping | drywall | O*NET Tapers |
| Drywall | sheetrock, wallboard | | O*NET Drywall Installers |
| EKG | electrocardiogram(s) | | O*NET Cardiovascular Technologists |
| Forklift | fork lift, fork truck, lift truck, and "operation" forms | | O*NET Industrial Truck Operators |
| Point of sale | POS software, POS system(s) | | O*NET Cashiers |
| EMR | electronic medical record(s), EMR software | | O*NET Cardiovascular Technologists |

**Safeguards, each with a test:**

- Exact phrases only, so there's no stemming or fuzzy matching.
- Limited to 50 groups, and every group must name a source on an allowed site.
- "Related" gives Possible at most.
- It can't redefine anything the reviewed table already says.
- Ambiguous short forms stay out: "POS" alone isn't there, and neither is "IV", because Level IV isn't an intravenous line.
- Keyword lists of alternate names still don't count as work.
- The words inside a name don't match alone, so "the point nearest the highway" isn't point of sale.

**Left out because a source didn't confirm them:** ECG (the page reads "EKG"), MIG as GMAW (already in the reviewed table), and IV (ESCO shows no such label). "Taped and mudded" is left out too: it's verb wording, and it's what the clarification workflow is for.

**Known limits:**

- **Forklifts:** the existing credentials table lists them, so "Forklift operation" is judged as a credential. A job using a lift truck doesn't reach Supported, under either name. That's cautious, and I didn't change it.
- **Verbs:** terminology fixes nouns, not verbs. "Hung sheetrock" still needs "hung" in the verb list. A person can answer the question instead.
- **Slashes:** the tokenizer can't hold forms like "G/L" or "A/R", so they aren't included.
- **Impact:** seven groups won't move overall accuracy much. This proves the mechanism, and it isn't meant to close the wording gap.

## Attribution

The analysis page's "What is sent, and where" section and the data file both carry the required wording. Before any public release, it should also appear somewhere permanent, such as an About page.
