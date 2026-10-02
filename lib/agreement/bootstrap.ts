// Percentile bootstrap confidence intervals over items (Efron, B., & Tibshirani, R. J. (1993). An
// Introduction to the Bootstrap, chapter 13). Items are resampled with replacement and the statistic
// is recomputed on each resample. The generator is seeded, so the same data, statistic and seed give
// the same interval on every run and every machine.

export const DEFAULT_RESAMPLES = 2000;
export const DEFAULT_LEVEL = 0.95;
export const DEFAULT_SEED = 1;

/**
 * mulberry32, a small 32-bit generator by Tommy Ettinger (public domain). Returns a function that
 * yields floats in [0, 1). It uses only 32-bit integer operations, so a seed gives the same sequence
 * in every JavaScript engine.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BootstrapOptions = {
  /** Number of resamples. Default 2000. */
  resamples?: number;
  /** Confidence level, between 0 and 1. Default 0.95. */
  level?: number;
  /** Seed for mulberry32. Default 1. */
  seed?: number;
};

export type BootstrapInterval = {
  /** The statistic on the full set of items. */
  estimate: number;
  lower: number;
  upper: number;
  level: number;
  resamples: number;
  /**
   * Resamples whose statistic was a finite number. Only these enter the percentiles: a resample can
   * leave a statistic undefined (NaN), for example kappa when every resampled rating is the same.
   * Report this next to the interval when it is below `resamples`.
   */
  valid: number;
  seed: number;
};

/**
 * Percentile bootstrap interval for `statistic` over `items` (for example the rows of an items x
 * raters matrix). The bounds are the (1 - level) / 2 and (1 + level) / 2 quantiles of the resampled
 * statistics, by linear interpolation between order statistics (Hyndman and Fan 1996, definition 7,
 * the R default). With no finite resample the bounds are NaN.
 */
export function bootstrapCI<T>(
  items: readonly T[],
  statistic: (sample: readonly T[]) => number,
  options: BootstrapOptions = {},
): BootstrapInterval {
  const resamples = options.resamples ?? DEFAULT_RESAMPLES;
  const level = options.level ?? DEFAULT_LEVEL;
  const seed = options.seed ?? DEFAULT_SEED;
  if (items.length === 0) throw new Error("bootstrapCI: there are no items to resample");
  if (!Number.isInteger(resamples) || resamples < 1) {
    throw new Error("bootstrapCI: resamples must be a whole number of at least 1");
  }
  if (!(level > 0 && level < 1)) throw new Error("bootstrapCI: level must be between 0 and 1");
  if (!Number.isInteger(seed)) throw new Error("bootstrapCI: seed must be a whole number");

  const estimate = statistic(items);
  const random = mulberry32(seed);
  const n = items.length;
  const replicates: number[] = [];
  for (let b = 0; b < resamples; b++) {
    const sample = Array.from({ length: n }, () => items[Math.floor(random() * n)]!);
    const value = statistic(sample);
    if (Number.isFinite(value)) replicates.push(value);
  }
  replicates.sort((a, b) => a - b);

  const tail = (1 - level) / 2;
  return {
    estimate,
    lower: quantile(replicates, tail),
    upper: quantile(replicates, 1 - tail),
    level,
    resamples,
    valid: replicates.length,
    seed,
  };
}

/** Quantile p of an ascending array by linear interpolation (Hyndman and Fan 1996, type 7). */
function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * p;
  const below = Math.floor(h);
  const above = Math.ceil(h);
  return sorted[below]! + (h - below) * (sorted[above]! - sorted[below]!);
}
