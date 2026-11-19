import curated from "@/lib/ai/rules/data/terminology_v2.json";
import { containsPhrase } from "@/lib/ai/skill-relations";

// The curated equivalence layer, read only by the shadow pipeline. The production engine doesn't import it.

export const CURATED_VERSION = curated.version;
export type CuratedGroup = (typeof curated.groups)[number];

/** Groups naming exactly what's asked. Whole phrases only: never a partial or fuzzy match. */
export function curatedFor(piece: string): CuratedGroup[] {
  return curated.groups.filter(group => group.asks.some(name => containsPhrase(piece, name)));
}
