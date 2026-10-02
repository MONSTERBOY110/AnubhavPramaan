import type { MilaoView, NosView, PackSummary } from "@/components/milao/view";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import type { MappingResult } from "@/lib/mapping/map";
import type { QualificationPack } from "@/lib/packs/schema";

// Builds the Milao screen's view model from stored records. No model is called here and nothing
// is recomputed: the screen shows exactly what the mapping stored, as a suggestion.

export type MappingRecord = {
  declarationId: string;
  createdAt: string;
  result: MappingResult;
  decision?: MilaoView["decision"];
};

export function buildView(
  decl: SelfDeclaration,
  record: MappingRecord,
  packs: QualificationPack[],
): MilaoView | null {
  const r = record.result;
  const bestMapping = r.packs.find((p) => p.pack.id === r.best) ?? null;
  const bestPack = packs.find((p) => p.id === r.best);
  if (!bestMapping || !bestPack || !r.route) return null;

  const claims = new Map(r.claims.map((c) => [c.id, c]));
  const topics = decl.answers.map((a) => a.topic);
  const linksByPc = new Map<string, typeof bestMapping.links>();
  for (const l of bestMapping.links) linksByPc.set(l.pcId, [...(linksByPc.get(l.pcId) ?? []), l]);

  const nos: NosView[] = bestPack.nos.map((n) => {
    const cov = bestMapping.coverage.perNos.find((x) => x.nosId === n.id)!;
    return {
      id: n.id,
      title: n.title,
      weightagePct: n.weightagePct,
      covered: cov.covered.length,
      pct: cov.pct,
      pcs: n.pcs.map((pc) => ({
        id: pc.id,
        code: pc.code,
        text: pc.text,
        covered: cov.covered.includes(pc.id),
        links: (linksByPc.get(pc.id) ?? []).map((l) => {
          const claim = l.claimId ? claims.get(l.claimId) : undefined;
          return {
            quote: l.quote,
            summary: claim?.summary ?? "",
            topic: topics[l.answer] ?? "",
            confidence: l.synonym ? null : l.confidence,
            rationale: l.synonym ? `keyword match on "${l.synonym}"` : (claim?.summary ?? ""),
          };
        }),
      })),
    };
  });

  const summary = (id: string): PackSummary => {
    const m = r.packs.find((p) => p.pack.id === id)!;
    const p = packs.find((x) => x.id === id)!;
    return {
      id,
      version: p.version,
      title: p.title,
      nsqfLevel: p.nsqfLevel,
      status: p.status,
      flatPct: m.coverage.flat,
      weightedPct: m.coverage.weighted,
    };
  };

  return {
    declarationId: decl.id,
    candidateRef: decl.candidateRef,
    declaredAt: decl.consentAt,
    confirmedAt: decl.confirmedAt,
    asrLabels: [...new Set(decl.answers.map((a) => a.sourceLabel))],
    model: r.label,
    best: { ...summary(bestPack.id), nos },
    others: r.packs.filter((p) => p.pack.id !== r.best).map((p) => summary(p.pack.id)),
    route: {
      rule: r.route.rule,
      pct: r.route.pct,
      threshold: r.route.threshold,
      suggestion: r.route.suggestion,
    },
    decision: record.decision,
  };
}
