// Gate A adoption readiness: rules-version-aware staleness. Pure: no I/O.
//
// A stored analysis records the method that produced it (`methodVersion`). The web rules engine writes "rules-vN" and the
// assisted path "assisted/rules-vN+<model>/<prompt>". When the rules version in it differs from the current one (after an
// adoption, or a rollback), the analysis is out of date and the page says so; it is never rewritten (no migration).
// Results from other methods (the AI service's own model, assist, hybrid or test providers) carry no web rules version
// and are left as they are: they aren't compared.

const WEB_RULES = /^(?:assisted\/)?(rules-v[0-9a-z.]+)(?:\+|$)/i;

/** The web rules version a stored method version was computed with, or null when it isn't a web rules method. */
export function rulesVersionOf(methodVersion: string | null | undefined): string | null {
  return WEB_RULES.exec(methodVersion ?? "")?.[1]?.toLowerCase() ?? null;
}

/** Whether a stored analysis was computed with web rules other than the current ones. */
export function rulesOutOfDate(methodVersion: string | null | undefined, current: string): boolean {
  const stored = rulesVersionOf(methodVersion);
  return stored !== null && stored !== current.toLowerCase();
}

/** The reasons an analysis is out of date, in plain words. The requirement and profile wording is unchanged. */
export function staleReasons(o: { requirements: boolean; profile: boolean; rules?: boolean }): string {
  const parts: string[] = [];
  if (o.requirements && o.profile) parts.push("the requirements and your profile have changed");
  else if (o.requirements) parts.push("the reviewed requirements have changed");
  else if (o.profile) parts.push("your profile has changed");
  if (o.rules) parts.push("the matching rules have been updated");
  return parts.join(", and ");
}
