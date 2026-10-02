// Cohen's weighted kappa for two raters on ordered categories 0..K-1. Cohen, J. (1968). Weighted
// kappa: nominal scale agreement with provision for scaled disagreement or partial credit.
// Psychological Bulletin, 70(4), 213-220. doi:10.1037/h0026256
//
// In this tool it compares any two assessors on the 0 to 3 judgement levels. Pure arithmetic, no I/O.

/** Disagreement weight for categories i and j: quadratic (i - j)^2 or linear |i - j|. */
export type KappaWeights = "quadratic" | "linear";

/** A level from 0 to K - 1, or a missing rating (null or undefined). */
export type KappaLevel = number | null | undefined;

export type WeightedKappaResult = {
  /** 1 - observed / expected disagreement. NaN when expected disagreement is 0 or no pair is complete. */
  kappa: number;
  /** Mean weighted disagreement over the complete pairs. */
  observedDisagreement: number;
  /** The same mean if the two raters' choices were independent, from their own marginals. */
  expectedDisagreement: number;
  /** Items where both raters gave a level. Items with a missing level are left out. */
  pairs: number;
};

/**
 * Weighted kappa between rater A and rater B, item by item. Both arrays hold one level per item, in
 * the same item order. Levels must be whole numbers from 0 to categories - 1. Quadratic weights are
 * the default. With two categories both weightings give Cohen's unweighted kappa.
 */
export function weightedKappa(
  raterA: readonly KappaLevel[],
  raterB: readonly KappaLevel[],
  categories: number,
  weights: KappaWeights = "quadratic",
): WeightedKappaResult {
  if (raterA.length !== raterB.length) {
    throw new Error(
      `weightedKappa: rater A has ${raterA.length} items and rater B has ${raterB.length}`,
    );
  }
  if (!Number.isInteger(categories) || categories < 2) {
    throw new Error("weightedKappa: categories must be a whole number of at least 2");
  }
  const checkLevel = (level: number, rater: string, item: number) => {
    if (!Number.isInteger(level) || level < 0 || level >= categories) {
      throw new Error(
        `weightedKappa: rater ${rater} item ${item} has level ${level}, outside 0..${categories - 1}`,
      );
    }
  };

  // Contingency table of complete pairs: rows are rater A's level, columns rater B's.
  const table = Array.from({ length: categories }, () => new Array<number>(categories).fill(0));
  let pairs = 0;
  raterA.forEach((a, item) => {
    const b = raterB[item];
    if (a === null || a === undefined || b === null || b === undefined) return;
    checkLevel(a, "A", item);
    checkLevel(b, "B", item);
    const row = table[a]!;
    row[b] = row[b]! + 1;
    pairs += 1;
  });

  const rowTotals = table.map((row) => row.reduce((s, x) => s + x, 0));
  const columnTotals = Array.from({ length: categories }, (_, j) =>
    table.reduce((s, row) => s + row[j]!, 0),
  );
  const weight = (i: number, j: number) =>
    weights === "quadratic" ? (i - j) * (i - j) : Math.abs(i - j);

  // observed: sum of w_ij times the count in cell ij. expected: sum of w_ij times row_i times
  // column_j, the count the cell would hold by chance multiplied by the number of pairs.
  let observed = 0;
  let expected = 0;
  for (let i = 0; i < categories; i++) {
    for (let j = 0; j < categories; j++) {
      const w = weight(i, j);
      if (w === 0) continue;
      observed += w * table[i]![j]!;
      expected += w * rowTotals[i]! * columnTotals[j]!;
    }
  }
  const observedDisagreement = pairs > 0 ? observed / pairs : NaN;
  const expectedDisagreement = pairs > 0 ? expected / (pairs * pairs) : NaN;
  const kappa = expectedDisagreement > 0 ? 1 - observedDisagreement / expectedDisagreement : NaN;
  return { kappa, observedDisagreement, expectedDisagreement, pairs };
}
