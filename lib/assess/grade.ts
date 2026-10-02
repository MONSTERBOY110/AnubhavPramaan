import type { QualificationPack } from "@/lib/packs/schema";
import type { NosScore } from "./scoring";

// Competency profile, grade band and recommendation (TRD M6). The recommendation is a SUGGESTION:
// only the assessor's PIN sign-off turns it into a record, and the assessor may reject it.
//
// - Total: NOS percentages weighted by the QP's own Weightage column.
// - Band, PMKVY 4.0 for NSQF levels 1 to 3: A at 85% and above, B 70% to below 85%, C 50% to below
//   70%; below that "not yet competent".
// - A NOS passes at the pass mark the awarding body confirms. CON/Q0602 states both 70% (page 46)
//   and a 50% aggregate (page 47); the default here is the 70% the QP text gives per QP, shown with
//   both quotes on screen, and can be set per assessment.

export type Band = "A" | "B" | "C" | "NYC";
export type Recommendation = "certify" | "partial" | "reassess";

/**
 * Shares are sums of fractional marks (an element's marks split over its PCs), so a NOS meant to sit
 * exactly on 70% can come out as 0.6999999999999998. Every threshold is compared with this
 * tolerance, on the server and the tablet alike, so the same scores always give the same result.
 */
export const EPSILON = 1e-9;

export function atLeast(share: number, mark: number): boolean {
  return share + EPSILON >= mark;
}

export function band(totalPct: number): Band {
  if (atLeast(totalPct, 0.85)) return "A";
  if (atLeast(totalPct, 0.7)) return "B";
  if (atLeast(totalPct, 0.5)) return "C";
  return "NYC";
}

export type Profile = {
  perNos: Array<NosScore & { pass: boolean; complete: boolean }>;
  totalPct: number;
  band: Band;
  passMark: number;
  recommendation: Recommendation;
  /** NOS still to bridge, when the recommendation is partial or reassess. */
  bridge: string[];
};

export function profile(
  pack: QualificationPack,
  nos: NosScore[],
  passMark = (pack.passRule?.qpPassPct ?? 70) / 100,
): Profile {
  const perNos = nos.map((n) => ({
    ...n,
    pass: n.max > 0 && atLeast(n.pct, passMark),
    complete: n.scored === n.total,
  }));
  const totalPct = perNos.reduce((a, n) => a + n.pct * (n.weightagePct / 100), 0);
  const passed = perNos.filter((n) => n.pass).length;
  const recommendation: Recommendation =
    passed === perNos.length ? "certify" : passed > 0 ? "partial" : "reassess";
  return {
    perNos,
    totalPct,
    band: band(totalPct),
    passMark,
    recommendation,
    bridge: perNos.filter((n) => !n.pass).map((n) => n.nosId),
  };
}
