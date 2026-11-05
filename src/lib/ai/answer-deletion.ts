import "server-only";
import type { Verdict } from "@/lib/ai/evidence";
import type { Finding, Suggestion } from "@/lib/ai/match-validation";
import { RULES_VERSION } from "@/lib/ai/rules/engine";
import { prisma } from "@/lib/db";

// Permanently removes answers and every stored copy of them, from whichever flow they came. One place, so
// the question flow, the review, and removing a role can't differ. docs/CLARIFICATION_RETENTION.md lists
// what this can't reach, and what's kept.

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Row = { id: string; evidenceId: string | null; educationId: string | null; detail: string | null };

/** Findings and suggestions citing these answers, in every stored analysis, by id or by their words. */
async function scrubAnalyses(tx: Tx, userId: string, rows: Row[]) {
  const evidenceIds = new Set(rows.flatMap(c => [c.evidenceId, `experience:${c.id}`, c.educationId ? `education:${c.educationId}` : null]).filter((v): v is string => !!v));
  const texts = rows.map(c => c.detail).filter((v): v is string => !!v);
  const fromAnswer = (citation: { evidenceId: string; quote: string }) => evidenceIds.has(citation.evidenceId) || texts.some(t => t.includes(citation.quote) && citation.quote.length > 20);
  const analyses = await tx.jobMatchAnalysis.findMany({ where: { userId }, select: { id: true, findings: true, aiSuggestions: true } });
  for (const analysis of analyses) {
    const findings = analysis.findings as Finding[];
    const suggestions = (analysis.aiSuggestions ?? []) as Suggestion[];
    const cited = (f: Finding) => f.citations.some(fromAnswer);
    const keep = (s: Suggestion) => !s.citation || !fromAnswer(s.citation);
    if (!findings.some(cited) && suggestions.every(keep)) continue;
    const cleaned = findings.map(f => (cited(f) ? { ...f, verdict: "insufficient_information" as Verdict, explanation: "This relied on an answer you permanently deleted. Run the analysis again.", citations: [], caveats: [], basis: "no_evidence" as const, evidenceSources: [], rulesOnlyVerdict: undefined } : f));
    const verdictCounts = { supported: 0, possible: 0, gap: 0, insufficient_information: 0 };
    for (const f of cleaned) verdictCounts[f.verdict]++;
    await tx.jobMatchAnalysis.update({ where: { id: analysis.id }, data: { findings: JSON.parse(JSON.stringify(cleaned)), verdictCounts, aiSuggestions: suggestions.filter(keep) } });
  }
}

/** Deletes these answers, any entries they created, their copies, and what the audit trail said about them.
 * What stays is that something was answered and deleted, and when: deleting can't reset a daily limit. */
export async function purgeAnswers(tx: Tx, userId: string, rows: Row[]) {
  if (!rows.length) return;
  await scrubAnalyses(tx, userId, rows);
  const ids = rows.map(r => r.id);
  const educationIds = rows.map(c => c.educationId).filter((v): v is string => !!v);
  await tx.clarificationEvent.updateMany({ where: { userId, clarificationId: { in: ids } }, data: { requirementText: null, questionKey: null, verdictBefore: null, verdictAfter: null, savedJobId: null } });
  await tx.candidateClarification.deleteMany({ where: { id: { in: ids }, userId } });
  if (educationIds.length) await tx.education.deleteMany({ where: { id: { in: educationIds }, profile: { userId } } });
  await tx.clarificationEvent.createMany({ data: ids.map(clarificationId => ({ userId, clarificationId, action: "DELETED", rulesVersion: RULES_VERSION })) });
}

const ROW = { id: true, evidenceId: true, educationId: true, detail: true } as const;

/** An answer and every earlier version of it. */
export async function deleteAnswerChain(userId: string, first: { id: string; questionKey: string | null }) {
  const rows = await prisma.candidateClarification.findMany({
    where: { userId, OR: [{ id: first.id }, ...(first.questionKey ? [{ questionKey: first.questionKey, status: { in: ["SUPERSEDED", "REVOKED"] as ("SUPERSEDED" | "REVOKED")[] } }] : [])] },
    select: ROW,
  });
  await prisma.$transaction(tx => purgeAnswers(tx, userId, rows));
}

/** Everything answered under a role, before that role goes. Without this the database would remove the
 * answers but stored analyses would keep quoting them. */
export async function purgeRoleAnswers(tx: Tx, roleId: string, supabaseAuthId: string) {
  const role = await tx.professionalExperience.findFirst({ where: { id: roleId, profile: { user: { supabaseAuthId } } }, select: { profile: { select: { userId: true } } } });
  if (!role) return;
  const rows = await tx.candidateClarification.findMany({ where: { experienceId: roleId, userId: role.profile.userId }, select: ROW });
  await purgeAnswers(tx, role.profile.userId, rows);
}
