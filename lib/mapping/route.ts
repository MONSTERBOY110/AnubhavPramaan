import type { QualificationPack } from "@/lib/packs/schema";
import type { Coverage } from "./coverage";

// The route suggestion (TRD M2, step 4): NCVET RPL Guidelines 2023, Category 1: experiential
// learning that maps to 70% or more of the qualification's learning outcomes allows direct
// assessment; otherwise the candidate upskills first. This is a SUGGESTION for the assessor, who
// confirms or changes it on the match screen; nothing downstream acts on it alone.

export const ROUTE_THRESHOLD = 0.7;

/**
 * Which coverage figure drives the suggestion. Default "weighted" (the QP's own weightage, lead's
 * decision of 2 Oct 2026): CON/Q0602's 4 core NOS hold 80% of the weightage but only 54 of 119
 * PCs, so the flat share would send a worker who covers every core PC to upskilling at 45%. Both
 * figures are always shown; `NEXT_PUBLIC_ROUTE_RULE=flat` switches the suggestion back.
 */
export type RouteRule = "flat" | "weighted";
export const ROUTE_RULE: RouteRule =
  process.env.NEXT_PUBLIC_ROUTE_RULE === "flat" ? "flat" : "weighted";

export type Route = "direct-assessment" | "upskill-first";

export type RouteSuggestion = {
  rule: RouteRule;
  pct: number;
  threshold: number;
  suggestion: Route;
};

export function suggestRoute(cov: Coverage, rule: RouteRule = ROUTE_RULE): RouteSuggestion {
  const pct = rule === "weighted" ? cov.weighted : cov.flat;
  return {
    rule,
    pct,
    threshold: ROUTE_THRESHOLD,
    suggestion: pct >= ROUTE_THRESHOLD ? "direct-assessment" : "upskill-first",
  };
}

export type GapGroup = {
  nosId: string;
  title: string;
  weightagePct: number;
  pcs: Array<{ id: string; code: string; text: string }>;
};

/**
 * The PCs the declaration did not reach, grouped by NOS, heaviest NOS first. For "upskill first"
 * it is the bridge plan; for direct assessment, what the practical should probe.
 */
export function gapPlan(pack: QualificationPack, cov: Coverage): GapGroup[] {
  const covered = new Set(cov.covered);
  return pack.nos
    .map((nos) => ({
      nosId: nos.id,
      title: nos.title,
      weightagePct: nos.weightagePct,
      pcs: nos.pcs
        .filter((pc) => !covered.has(pc.id))
        .map((pc) => ({ id: pc.id, code: pc.code, text: pc.text })),
    }))
    .filter((g) => g.pcs.length > 0)
    .sort((a, b) => b.weightagePct - a.weightagePct || b.pcs.length - a.pcs.length);
}
