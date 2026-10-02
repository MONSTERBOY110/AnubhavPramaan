// Krippendorff's alpha, computed through the coincidence matrix step by step as in Krippendorff, K.
// (2011). Computing Krippendorff's Alpha-Reliability. Departmental Papers (ASC) 43, Annenberg School
// for Communication, University of Pennsylvania. https://repository.upenn.edu/asc_papers/43
//
// Any number of raters, missing values allowed, nominal, ordinal, interval or ratio metric. In this
// tool it measures agreement on the 0 to 3 judgement levels (ordinal). Pure arithmetic, no I/O.

export type AlphaMetric = "nominal" | "ordinal" | "interval" | "ratio";

/** One rating. null, undefined and NaN all mean the rating is missing. */
export type AlphaValue = number | null | undefined;

export type AlphaResult = {
  /** 1 - Do / De. NaN when De is 0 or nothing can be paired: alpha is then undefined. */
  alpha: number;
  /** Do: the disagreement observed within units. */
  observedDisagreement: number;
  /** De: the disagreement expected when values are paired by chance. */
  expectedDisagreement: number;
  /** n: the number of values that sit in a unit with at least one other value. */
  pairableValues: number;
  /** The distinct pairable values, ascending. They label the rows and columns below. */
  values: number[];
  /** o_ck: the coincidence matrix, rows and columns in the order of `values`. */
  coincidences: number[][];
  /** n_c: the row sums of the coincidence matrix, the number of pairable values equal to c. */
  marginals: number[];
};

/**
 * Krippendorff's alpha for a units x raters matrix: one row per unit (item), one column per rater.
 * Krippendorff (2011) prints the reliability data matrix the other way round, raters by units, so
 * pass the transpose of a matrix copied from the paper. A unit with fewer than two values cannot be
 * paired and adds nothing, exactly as in the paper. The ratio metric needs values of 0 or more.
 */
export function krippendorffAlpha(
  unitsByRaters: readonly (readonly AlphaValue[])[],
  metric: AlphaMetric,
): AlphaResult {
  // Step 1: the values present in each unit. A unit needs m_u >= 2 values to be pairable.
  const units: number[][] = [];
  unitsByRaters.forEach((row, u) => {
    const present: number[] = [];
    for (const value of row) {
      if (value === null || value === undefined || Number.isNaN(value)) continue;
      if (!Number.isFinite(value)) {
        throw new Error(`krippendorffAlpha: unit ${u} has a value that is not finite`);
      }
      if (metric === "ratio" && value < 0) {
        throw new Error(
          `krippendorffAlpha: unit ${u} has a negative value, the ratio metric needs >= 0`,
        );
      }
      present.push(value);
    }
    if (present.length >= 2) units.push(present);
  });

  // Step 2: coincidences within units. Every ordered pair of values from two different raters in
  // unit u adds 1 / (m_u - 1) to its cell, so each pairable value adds exactly 1 to its row sum.
  const values = [...new Set(units.flat())].sort((a, b) => a - b);
  const position = new Map(values.map((value, i) => [value, i] as const));
  const size = values.length;
  const coincidences = values.map(() => new Array<number>(size).fill(0));
  const marginals = new Array<number>(size).fill(0);
  let pairableValues = 0;
  for (const unit of units) {
    const weight = 1 / (unit.length - 1);
    const at = unit.map((value) => position.get(value)!);
    for (let i = 0; i < at.length; i++) {
      const row = coincidences[at[i]!]!;
      for (let j = 0; j < at.length; j++) {
        if (i !== j) row[at[j]!] = row[at[j]!]! + weight;
      }
      // n_c counted directly rather than summed from fractions, so it stays a whole number.
      marginals[at[i]!] = marginals[at[i]!]! + 1;
    }
    pairableValues += unit.length;
  }

  // Step 3: the squared difference function of the chosen metric.
  const delta = differenceFunction(metric, values, marginals);

  // Step 4: alpha = 1 - Do / De, with Do = (1 / n) sum o_ck delta_ck and
  // De = (1 / (n (n - 1))) sum n_c n_k delta_ck. delta is 0 on the diagonal for every metric.
  let observed = 0;
  let expected = 0;
  for (let c = 0; c < size; c++) {
    for (let k = 0; k < size; k++) {
      if (c === k) continue;
      const d = delta(c, k);
      observed += coincidences[c]![k]! * d;
      expected += marginals[c]! * marginals[k]! * d;
    }
  }
  const n = pairableValues;
  const observedDisagreement = n > 0 ? observed / n : NaN;
  const expectedDisagreement = n > 1 ? expected / (n * (n - 1)) : NaN;
  const alpha = expectedDisagreement > 0 ? 1 - observedDisagreement / expectedDisagreement : NaN;

  return {
    alpha,
    observedDisagreement,
    expectedDisagreement,
    pairableValues,
    values,
    coincidences,
    marginals,
  };
}

/**
 * Squared differences between the c-th and k-th pairable values (indices into `values`), as defined
 * in Krippendorff (2011), section D:
 * nominal 0 if equal, else 1; ordinal (sum of n_g for g from c to k, minus (n_c + n_k) / 2) squared;
 * interval (c - k) squared; ratio ((c - k) / (c + k)) squared.
 */
function differenceFunction(
  metric: AlphaMetric,
  values: readonly number[],
  marginals: readonly number[],
): (c: number, k: number) => number {
  switch (metric) {
    case "nominal":
      return (c, k) => (c === k ? 0 : 1);
    case "ordinal": {
      // cumulative[i] is the sum of n_g over the first i values, so a run sum is one subtraction.
      const cumulative = [0];
      for (const count of marginals) cumulative.push(cumulative[cumulative.length - 1]! + count);
      return (c, k) => {
        const low = Math.min(c, k);
        const high = Math.max(c, k);
        const run = cumulative[high + 1]! - cumulative[low]!;
        const d = run - (marginals[low]! + marginals[high]!) / 2;
        return d * d;
      };
    }
    case "interval":
      return (c, k) => {
        const d = values[c]! - values[k]!;
        return d * d;
      };
    case "ratio":
      return (c, k) => {
        const a = values[c]!;
        const b = values[k]!;
        if (a === b) return 0;
        const d = (a - b) / (a + b);
        return d * d;
      };
  }
}
