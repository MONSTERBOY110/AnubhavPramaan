import { countsFromLabels, fleissKappa, krippendorffAlpha, strictnessIndex } from "@/lib/agreement";
import { MEETS_STANDARD } from "@/lib/assess/scoring";
import { units, type CalibrationSet, type Condition, type Submission } from "./schema";

// Agreement on a calibration set, per condition, from real submissions only (STUDY-PROTOCOL
// section 5): Krippendorff's alpha (ordinal) on the 0 to 3 levels, Fleiss' kappa on met or not met
// (met = level 1 or above, the WorldSkills "meets industry standard"), and the strictness index per
// rater. With fewer than 2 raters nothing is computed: agreement needs at least two people.

export const MIN_RATERS = 2;

export type ConditionAgreement = {
  condition: Condition;
  raters: number;
  units: number;
  /** null until MIN_RATERS have submitted, or when the statistic is undefined (no variation). */
  alpha: number | null;
  kappa: number | null;
  strictness: Array<{ rater: string; index: number | null }>;
  /** Median seconds per item over all raters in this condition. */
  medianSecondsPerItem: number | null;
};

const finite = (x: number): number | null => (Number.isFinite(x) ? x : null);

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function agreementFor(
  set: CalibrationSet,
  submissions: Submission[],
  condition: Condition,
): ConditionAgreement {
  const mine = submissions.filter((s) => s.setId === set.id && s.condition === condition);
  const unitList = units(set);
  // Seconds per item: each rating carries its item's seconds, so take one per (rater, item).
  const perItem = mine.flatMap((s) => [
    ...new Map(s.ratings.map((r) => [r.itemId, r.seconds])).values(),
  ]);
  const base = {
    condition,
    raters: mine.length,
    units: unitList.length,
    medianSecondsPerItem: median(perItem),
  };
  if (mine.length < MIN_RATERS) {
    return {
      ...base,
      alpha: null,
      kappa: null,
      strictness: mine.map((s) => ({ rater: s.rater, index: null })),
    };
  }
  // Units x raters matrix of levels; a submission always covers every unit (the API refuses gaps).
  const matrix = unitList.map((u) =>
    mine.map(
      (s) => s.ratings.find((r) => r.itemId === u.itemId && r.pcId === u.pcId)?.level ?? null,
    ),
  );
  const alpha = finite(krippendorffAlpha(matrix, "ordinal").alpha);
  const met = matrix.map((row) =>
    row.map((level) => (level === null ? null : level >= MEETS_STANDARD ? "met" : "not met")),
  );
  const complete = met.filter((row) => row.every((label) => label !== null));
  let kappa: number | null = null;
  try {
    kappa = complete.length
      ? finite(fleissKappa(countsFromLabels(complete, ["met", "not met"])).kappa)
      : null;
  } catch {
    kappa = null;
  }
  const strict = strictnessIndex(matrix);
  return {
    ...base,
    alpha,
    kappa,
    strictness: strict.map((s) => ({ rater: mine[s.rater]!.rater, index: finite(s.index) })),
  };
}
