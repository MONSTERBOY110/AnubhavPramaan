// Strictness index per rater (docs/TRD.md, M7): on each item, the rater's level minus the mean of the
// other raters' levels on that item, averaged over items. It is in rubric points, so it reads
// directly: +0.5 means this rater sits half a level above colleagues on the same evidence.
//
// Sign: positive means the rater gives higher levels than the others (lenient), negative means
// lower (strict). The index describes a pattern for calibration; it never changes anyone's score.

/** A level, or a missing rating: null, undefined or NaN. */
export type StrictnessLevel = number | null | undefined;

export type RaterStrictness = {
  /** Column index of the rater in the input matrix. */
  rater: number;
  /** Mean of (own level - mean of the others' levels) over usable items. NaN if there are none. */
  index: number;
  /** Items that entered the mean: the rater gave a level and at least one other rater did too. */
  items: number;
};

/**
 * Strictness index for every rater of an items x raters matrix: one row per item, one column per
 * rater. A missing level is skipped: the rater's own missing items do not count, and on every item
 * the comparison uses only the other raters who did give a level.
 */
export function strictnessIndex(
  itemsByRaters: readonly (readonly StrictnessLevel[])[],
): RaterStrictness[] {
  if (itemsByRaters.length === 0) throw new Error("strictnessIndex: there are no items");
  const raters = itemsByRaters[0]!.length;
  if (raters < 2) throw new Error("strictnessIndex: at least 2 raters are needed");

  const sums = new Array<number>(raters).fill(0);
  const counts = new Array<number>(raters).fill(0);
  itemsByRaters.forEach((row, item) => {
    if (row.length !== raters) {
      throw new Error(
        `strictnessIndex: item ${item} has ${row.length} raters, item 0 has ${raters}`,
      );
    }
    const given: { rater: number; level: number }[] = [];
    row.forEach((level, rater) => {
      if (level === null || level === undefined || Number.isNaN(level)) return;
      if (!Number.isFinite(level)) {
        throw new Error(`strictnessIndex: item ${item} has a level that is not finite`);
      }
      given.push({ rater, level });
    });
    if (given.length < 2) return;
    const total = given.reduce((s, g) => s + g.level, 0);
    for (const { rater, level } of given) {
      const othersMean = (total - level) / (given.length - 1);
      sums[rater] = sums[rater]! + (level - othersMean);
      counts[rater] = counts[rater]! + 1;
    }
  });

  return sums.map((sum, rater) => {
    const items = counts[rater]!;
    return { rater, index: items > 0 ? sum / items : NaN, items };
  });
}
