// Fleiss' kappa: agreement among many raters on a nominal scale, where the raters of one subject
// need not be the raters of the next. Fleiss, J. L. (1971). Measuring nominal scale agreement among
// many raters. Psychological Bulletin, 76(5), 378-382. doi:10.1037/h0031619
//
// Pure arithmetic, no I/O. In this tool it measures agreement on "performance criterion met or not
// met" across assessors. Every result is a measurement of the assessors, never a decision.

export type FleissResult = {
  /** Overall kappa, (pBar - pE) / (1 - pE). NaN when pE is 1, that is every rating in one category. */
  kappa: number;
  /** P-bar: the mean over subjects of the share of rater pairs that agree on that subject. */
  pBar: number;
  /** P-e: agreement expected by chance, the sum of the squared category proportions. */
  pE: number;
  /** p_j: the share of all assignments that went to each category, in column order. */
  categoryProportions: number[];
  /**
   * Kappa for each category, in column order (Fleiss 1971 gives these alongside the overall value).
   * NaN for a category that no rater used, or that every rater used for every subject.
   */
  categoryKappas: number[];
  subjects: number;
  /** Raters per subject, n. */
  raters: number;
};

/**
 * Fleiss' kappa from a counts matrix: one row per subject, one column per category, each cell the
 * number of raters who put that subject in that category. Every row must add up to the same number
 * of raters (at least 2). A row that does not is refused rather than averaged over, because the
 * formula assumes the same n for every subject.
 */
export function fleissKappa(counts: readonly (readonly number[])[]): FleissResult {
  const subjects = counts.length;
  if (subjects === 0) throw new Error("fleissKappa: there are no subjects");
  const categories = counts[0]!.length;
  if (categories < 2) throw new Error("fleissKappa: at least 2 categories are needed");

  let raters = -1;
  counts.forEach((row, i) => {
    if (row.length !== categories) {
      throw new Error(
        `fleissKappa: subject ${i} has ${row.length} categories, subject 0 has ${categories}`,
      );
    }
    let total = 0;
    for (const count of row) {
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`fleissKappa: subject ${i} has a count that is not a whole number >= 0`);
      }
      total += count;
    }
    if (raters === -1) raters = total;
    else if (total !== raters) {
      throw new Error(
        `fleissKappa: subject ${i} has ${total} ratings and subject 0 has ${raters}; ` +
          "every subject needs the same number of raters",
      );
    }
  });
  if (raters < 2) throw new Error("fleissKappa: at least 2 raters per subject are needed");

  const n = raters;
  const columnTotals = new Array<number>(categories).fill(0);
  let sumOfPi = 0;
  for (const row of counts) {
    let squares = 0;
    row.forEach((count, j) => {
      columnTotals[j] = (columnTotals[j] ?? 0) + count;
      squares += count * count;
    });
    // P_i: of the n(n - 1) ordered pairs of raters on subject i, the share that agree.
    sumOfPi += (squares - n) / (n * (n - 1));
  }

  const pBar = sumOfPi / subjects;
  const categoryProportions = columnTotals.map((total) => total / (subjects * n));
  const pE = categoryProportions.reduce((sum, p) => sum + p * p, 0);
  const kappa = pE === 1 ? NaN : (pBar - pE) / (1 - pE);

  // kappa_j = 1 - sum_i x_ij (n - x_ij) / (N n (n - 1) p_j q_j)
  const categoryKappas = categoryProportions.map((p, j) => {
    const q = 1 - p;
    if (p === 0 || q === 0) return NaN;
    let disagreement = 0;
    for (const row of counts) {
      const x = row[j]!;
      disagreement += x * (n - x);
    }
    return 1 - disagreement / (subjects * n * (n - 1) * p * q);
  });

  return { kappa, pBar, pE, categoryProportions, categoryKappas, subjects, raters: n };
}

/**
 * Builds the counts matrix for fleissKappa from a subjects x raters matrix of category labels.
 * Columns follow the order of `categories`. A null or undefined label is a missing rating and is left
 * out, so that subject ends up with fewer ratings and fleissKappa refuses the matrix instead of
 * quietly treating it as complete. A label that is not in `categories` throws.
 */
export function countsFromLabels<T>(
  ratings: readonly (readonly (T | null | undefined)[])[],
  categories: readonly T[],
): number[][] {
  const column = new Map<T, number>();
  categories.forEach((category, j) => {
    if (column.has(category)) {
      throw new Error(`countsFromLabels: category ${String(category)} is listed twice`);
    }
    column.set(category, j);
  });
  return ratings.map((row, i) => {
    const counts = new Array<number>(categories.length).fill(0);
    for (const label of row) {
      if (label === null || label === undefined) continue;
      const j = column.get(label);
      if (j === undefined) {
        throw new Error(
          `countsFromLabels: subject ${i} has label ${String(label)}, which is not a category`,
        );
      }
      counts[j] = (counts[j] ?? 0) + 1;
    }
    return counts;
  });
}
