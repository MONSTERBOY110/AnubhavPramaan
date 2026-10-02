// Intraclass correlations from Shrout, P. E., & Fleiss, J. L. (1979). Intraclass correlations: uses
// in assessing rater reliability. Psychological Bulletin, 86(2), 420-428.
// doi:10.1037/0033-2909.86.2.420
//
// The six forms are computed from the analysis of variance of a targets x judges matrix (their
// Table 1). In this tool ICC(2,1), two-way random and absolute agreement, is the one reported for
// item totals. Pure arithmetic, no I/O.

/**
 * Shrout and Fleiss notation: ICC(case, unit). Case 1 is one-way random (each target rated by its
 * own judges), case 2 two-way random (judges sampled from a population, absolute agreement), case 3
 * two-way mixed (these judges only, consistency). Unit 1 is a single rating, unit k the mean of the
 * k judges.
 */
export type IccForm = "1,1" | "2,1" | "3,1" | "1,k" | "2,k" | "3,k";

export type IccResult = {
  /** n */
  targets: number;
  /** k */
  judges: number;
  /** BMS, WMS, JMS and EMS in the paper's notation. */
  meanSquares: { between: number; within: number; judges: number; residual: number };
  /** Degrees of freedom: n - 1, n(k - 1), k - 1, (n - 1)(k - 1). */
  df: { between: number; within: number; judges: number; residual: number };
  /** The six coefficients. NaN where the formula divides by zero, for example identical ratings. */
  icc: Record<IccForm, number>;
};

/**
 * All six Shrout and Fleiss intraclass correlations for a complete targets x judges matrix: one row
 * per target, one column per judge. Needs at least 2 targets and 2 judges, and no missing ratings:
 * the ANOVA mean squares are defined only for a complete layout.
 */
export function intraclassCorrelations(targetsByJudges: readonly (readonly number[])[]): IccResult {
  const n = targetsByJudges.length;
  if (n < 2) throw new Error("intraclassCorrelations: at least 2 targets are needed");
  const k = targetsByJudges[0]!.length;
  if (k < 2) throw new Error("intraclassCorrelations: at least 2 judges are needed");
  targetsByJudges.forEach((row, i) => {
    if (row.length !== k) {
      throw new Error(
        `intraclassCorrelations: target ${i} has ${row.length} ratings, target 0 has ${k}`,
      );
    }
    for (const x of row) {
      if (typeof x !== "number" || !Number.isFinite(x)) {
        throw new Error(`intraclassCorrelations: target ${i} has a missing or non-finite rating`);
      }
    }
  });

  let total = 0;
  for (const row of targetsByJudges) for (const x of row) total += x;
  const grandMean = total / (n * k);
  const targetMeans = targetsByJudges.map((row) => row.reduce((s, x) => s + x, 0) / k);
  const judgeMeans = Array.from({ length: k }, (_, j) => {
    let s = 0;
    for (const row of targetsByJudges) s += row[j]!;
    return s / n;
  });

  // Each sum of squares is summed directly from its own deviations rather than obtained by
  // subtraction, so none can come out a little below zero through rounding.
  const ssBetween = k * targetMeans.reduce((s, m) => s + (m - grandMean) ** 2, 0);
  const ssJudges = n * judgeMeans.reduce((s, m) => s + (m - grandMean) ** 2, 0);
  let ssWithin = 0;
  let ssResidual = 0;
  targetsByJudges.forEach((row, i) => {
    const targetMean = targetMeans[i]!;
    row.forEach((x, j) => {
      ssWithin += (x - targetMean) ** 2;
      ssResidual += (x - targetMean - judgeMeans[j]! + grandMean) ** 2;
    });
  });

  const df = { between: n - 1, within: n * (k - 1), judges: k - 1, residual: (n - 1) * (k - 1) };
  const bms = ssBetween / df.between;
  const wms = ssWithin / df.within;
  const jms = ssJudges / df.judges;
  const ems = ssResidual / df.residual;

  const ratio = (numerator: number, denominator: number) =>
    denominator === 0 ? NaN : numerator / denominator;

  return {
    targets: n,
    judges: k,
    meanSquares: { between: bms, within: wms, judges: jms, residual: ems },
    df,
    icc: {
      "1,1": ratio(bms - wms, bms + (k - 1) * wms),
      "2,1": ratio(bms - ems, bms + (k - 1) * ems + (k * (jms - ems)) / n),
      "3,1": ratio(bms - ems, bms + (k - 1) * ems),
      "1,k": ratio(bms - wms, bms),
      "2,k": ratio(bms - ems, bms + (jms - ems) / n),
      "3,k": ratio(bms - ems, bms),
    },
  };
}
