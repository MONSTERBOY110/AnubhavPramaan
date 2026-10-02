import { describe, expect, it } from "vitest";
import {
  bootstrapCI,
  countsFromLabels,
  DEFAULT_LEVEL,
  DEFAULT_RESAMPLES,
  DEFAULT_SEED,
  fleissKappa,
  intraclassCorrelations,
  krippendorffAlpha,
  mulberry32,
  strictnessIndex,
  weightedKappa,
  type AlphaMetric,
  type IccForm,
} from "@/lib/agreement";
import fleiss1971 from "@/data/reference/fleiss-1971-diagnoses.json";
import krippendorff2011 from "@/data/reference/krippendorff-2011-alpha.json";
import shroutFleiss1979 from "@/data/reference/shrout-fleiss-1979-icc.json";

// The agreement engine (docs/TRD.md, M7). The first three blocks reproduce published worked
// examples. Their data and expected values sit in data/reference/*.json with the full citation and,
// where the numbers came from a reproduction rather than the paper, the name of that reproduction.
// Expected values are asserted at the precision the source prints and are never adjusted to fit the
// code. The remaining blocks are small cases that can be checked by hand.

/** Krippendorff (2011) prints raters by units; the engine takes units by raters. */
function transpose<T>(matrix: readonly (readonly T[])[]): T[][] {
  return matrix[0]!.map((_, j) => matrix.map((row) => row[j]!));
}

/** A cell of the coincidence matrix as Krippendorff (2011) prints it: "7", "4/3", or "." for 0. */
function printedCell(cell: string): number {
  if (cell === ".") return 0;
  const [numerator, denominator] = cell.split("/");
  return denominator === undefined ? Number(numerator) : Number(numerator) / Number(denominator);
}

const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe("Fleiss' kappa against Fleiss (1971), Psychological Bulletin 76(5), 378-382: 30 patients, 6 psychiatrists each, 5 diagnoses", () => {
  // The original article could not be read (paywalled). Table and values come from the R packages
  // raters and irr and the statsmodels test suite; see transcribedFrom in the JSON file.
  const ref = fleiss1971;
  const result = fleissKappa(ref.counts);

  it("uses the Fleiss (1971) count table: 30 subjects, 6 ratings each (R raters::diagnostic)", () => {
    expect(ref.counts).toHaveLength(30);
    for (const row of ref.counts) {
      expect(row).toHaveLength(ref.categories.length);
      expect(row.reduce((s, x) => s + x, 0)).toBe(ref.ratersPerSubject);
    }
  });

  it("rebuilds the same count table from the rater-by-rater layout of R irr::diagnoses", () => {
    expect(countsFromLabels(ref.ratings, [1, 2, 3, 4, 5])).toEqual(ref.counts);
  });

  it("reproduces overall kappa 0.43 (printed by R irr kappam.fleiss) and 0.4302445 (irr value recorded in statsmodels)", () => {
    const { kappaPrinted, kappaUnrounded } = ref.expected;
    expect(result.kappa).toBeCloseTo(kappaPrinted.value, kappaPrinted.decimals);
    expect(result.kappa).toBeCloseTo(kappaUnrounded.value, kappaUnrounded.decimals);
    expect(result.subjects).toBe(30);
    expect(result.raters).toBe(6);
  });

  it("reproduces the category kappas .245 .245 .520 .471 .566 (R irr kappam.fleiss, detail = TRUE)", () => {
    const { values, decimals } = ref.expected.categoryKappas;
    expect(result.categoryKappas).toHaveLength(values.length);
    values.forEach((value, j) => {
      expect(result.categoryKappas[j], ref.categories[j]).toBeCloseTo(value, decimals);
    });
  });

  it("gives P-bar 500/900 and P-e 7126/32400 from the table (hand arithmetic, not a published value)", () => {
    // Sum of squared counts is 680, so P-bar = (680 - 30 * 6) / (30 * 6 * 5). Column totals are
    // 26, 26, 30, 55 and 43 of 180 assignments, so P-e = (26^2 + 26^2 + 30^2 + 55^2 + 43^2) / 180^2.
    expect(result.pBar).toBeCloseTo(500 / 900, 12);
    expect(result.pE).toBeCloseTo(7126 / 32400, 12);
    expect(result.categoryProportions.map((p) => p * 180)).toEqual(
      [26, 26, 30, 55, 43].map((t) => expect.closeTo(t, 9)),
    );
  });
});

describe("ICC against Shrout and Fleiss (1979), Psychological Bulletin 86(2), 420-428, Tables 2 to 4", () => {
  const ref = shroutFleiss1979;
  const result = intraclassCorrelations(ref.ratings);

  it("reproduces Table 3 (p. 423): df 5, 18, 3, 15 and mean squares 11.24, 6.26, 32.49, 1.02", () => {
    expect(result.targets).toBe(6);
    expect(result.judges).toBe(4);
    expect(result.df).toEqual(ref.expected.df);
    const ms = ref.expected.meanSquares;
    expect(result.meanSquares.between).toBeCloseTo(ms.between, ms.decimals);
    expect(result.meanSquares.within).toBeCloseTo(ms.within, ms.decimals);
    expect(result.meanSquares.judges).toBeCloseTo(ms.judges, ms.decimals);
    expect(result.meanSquares.residual).toBeCloseTo(ms.residual, ms.decimals);
  });

  it("reproduces Table 4 (p. 424): ICC(1,1) .17, (2,1) .29, (3,1) .71, (1,4) .44, (2,4) .62, (3,4) .91", () => {
    const { values, decimals } = ref.expected.icc;
    expect(Object.keys(values).sort()).toEqual(Object.keys(result.icc).sort());
    for (const [form, value] of Object.entries(values)) {
      expect(result.icc[form as IccForm], `ICC(${form})`).toBeCloseTo(value, decimals);
    }
  });

  it("matches the 7-decimal values the Stata 19 icc manual prints for the same data (a reproduction, Examples 1 to 3)", () => {
    const { values, decimals } = ref.expected.reproduction;
    for (const [form, value] of Object.entries(values)) {
      expect(result.icc[form as IccForm], `ICC(${form})`).toBeCloseTo(value, decimals);
    }
  });
});

describe("Krippendorff's alpha against Krippendorff (2011), Computing Krippendorff's Alpha-Reliability, ASC paper 43", () => {
  const { A, B, C } = krippendorff2011.examples;
  const unitsC = transpose(C.data);

  it("builds the coincidence matrix of example C printed on p. 4, with n = 40 pairable values", () => {
    const result = krippendorffAlpha(unitsC, "nominal");
    expect(result.values).toEqual(C.coincidences.values);
    expect(result.marginals).toEqual(C.coincidences.marginals);
    expect(result.pairableValues).toBe(C.pairableValues);
    const printed = C.coincidences.asPrinted.map((row) => row.map(printedCell));
    result.coincidences.forEach((row, c) =>
      row.forEach((cell, k) =>
        expect(cell, `o(${c + 1},${k + 1})`).toBeCloseTo(printed[c]![k]!, 12),
      ),
    );
  });

  // The paper gives the nominal alpha on p. 5 and the other three on p. 8.
  const metricCases = (["nominal", "ordinal", "interval", "ratio"] as const).map((metric) => ({
    metric,
    published: C.expected.alpha[metric],
    page: metric === "nominal" ? 5 : 8,
  }));

  it.each(metricCases)(
    "reproduces example C, $metric alpha $published (p. $page)",
    ({ metric, published }: { metric: AlphaMetric; published: number }) => {
      const result = krippendorffAlpha(unitsC, metric);
      expect(result.alpha).toBeCloseTo(published, C.expected.decimals);
    },
  );

  it("reproduces example A, binary alpha 0.095 for Meg and Owen (pp. 2 to 3)", () => {
    const result = krippendorffAlpha(transpose(A.data), "nominal");
    expect(result.pairableValues).toBe(A.pairableValues);
    expect(result.alpha).toBeCloseTo(A.expected.alpha.nominal, A.expected.decimals);
  });

  it("reproduces example B, nominal alpha 0.692 for Ben and Gerry (pp. 3 to 4)", () => {
    // Letters a to e become 1 to 5; the nominal metric only asks whether two values are equal.
    const coded = B.data.map((row) => row.map((letter) => letter.charCodeAt(0) - 96));
    const result = krippendorffAlpha(transpose(coded), "nominal");
    expect(result.pairableValues).toBe(B.pairableValues);
    expect(result.alpha).toBeCloseTo(B.expected.alpha.nominal, B.expected.decimals);
  });
});

describe("Fleiss' kappa, cases checked by hand", () => {
  it("gives 1 for perfect agreement", () => {
    const result = fleissKappa([
      [4, 0],
      [0, 4],
      [4, 0],
    ]);
    expect(result.kappa).toBe(1);
    expect(result.pBar).toBe(1);
    expect(result.categoryKappas).toEqual([1, 1]);
  });

  it("gives 0 when agreement is exactly what chance predicts", () => {
    // P_i = 1, 1/3, 1/3 so P-bar = 5/9; p = (2/3, 1/3) so P-e = 5/9 as well.
    const result = fleissKappa([
      [3, 0],
      [2, 1],
      [1, 2],
    ]);
    expect(result.pBar).toBeCloseTo(5 / 9, 12);
    expect(result.pE).toBeCloseTo(5 / 9, 12);
    expect(result.kappa).toBeCloseTo(0, 12);
  });

  it("gives -1 when two raters split on every subject", () => {
    const result = fleissKappa([
      [1, 1],
      [1, 1],
    ]);
    expect(result.pBar).toBe(0);
    expect(result.pE).toBe(0.5);
    expect(result.kappa).toBe(-1);
    expect(result.categoryKappas).toEqual([-1, -1]);
  });

  it("throws when subjects have different numbers of raters", () => {
    expect(() =>
      fleissKappa([
        [2, 1],
        [1, 1],
      ]),
    ).toThrow(/same number of raters/);
  });

  it("leaves a missing label out, so the matrix is refused rather than treated as complete", () => {
    const counts = countsFromLabels(
      [
        ["met", "met"],
        ["met", null],
      ],
      ["met", "not met"],
    );
    expect(counts).toEqual([
      [2, 0],
      [1, 0],
    ]);
    expect(() => fleissKappa(counts)).toThrow(/same number of raters/);
  });

  it("throws on a label that is not a category", () => {
    expect(() => countsFromLabels([["met", "maybe"]], ["met", "not met"])).toThrow(
      /not a category/,
    );
  });

  it("returns NaN, not a number, when every rating falls in one category", () => {
    const result = fleissKappa([
      [3, 0],
      [3, 0],
    ]);
    expect(result.kappa).toBeNaN();
    expect(result.categoryKappas.every(Number.isNaN)).toBe(true);
  });
});

describe("Krippendorff's alpha, cases checked by hand", () => {
  it.each(["nominal", "ordinal", "interval", "ratio"] as const)(
    "gives 1 for perfect agreement, %s metric",
    (metric: AlphaMetric) => {
      const result = krippendorffAlpha(
        [
          [1, 1, 1],
          [2, 2, 2],
          [3, 3, 3],
        ],
        metric,
      );
      expect(result.alpha).toBe(1);
    },
  );

  it("handles a missing value: 1 - (n - 1) o01 / (n0 n1) = 1 - 5 * 1 / (3 * 3) = 4/9", () => {
    // The last unit has one value, so it cannot be paired and adds nothing.
    const result = krippendorffAlpha(
      [
        [0, 1],
        [1, 1],
        [0, 0],
        [0, null],
      ],
      "nominal",
    );
    expect(result.pairableValues).toBe(6);
    expect(result.marginals).toEqual([3, 3]);
    expect(result.alpha).toBeCloseTo(4 / 9, 12);
  });

  it("ignores units with one value or none, whether missing is null, undefined or NaN", () => {
    const base = [
      [1, 2, 2],
      [3, 3, 1],
      [2, 2, 2],
    ];
    const withGaps = [...base, [null, 3, undefined], [NaN, null, null]];
    for (const metric of ["nominal", "ordinal", "interval", "ratio"] as const) {
      expect(krippendorffAlpha(withGaps, metric).alpha).toBeCloseTo(
        krippendorffAlpha(base, metric).alpha,
        12,
      );
    }
  });

  it("goes below 0 when raters disagree more than chance: two raters always opposite give -0.5", () => {
    const result = krippendorffAlpha(
      [
        [0, 1],
        [1, 0],
      ],
      "nominal",
    );
    expect(result.alpha).toBeCloseTo(-0.5, 12);
  });

  it("is undefined (NaN) when every value is the same", () => {
    expect(
      krippendorffAlpha(
        [
          [2, 2],
          [2, 2],
        ],
        "ordinal",
      ).alpha,
    ).toBeNaN();
  });

  it("refuses negative values under the ratio metric", () => {
    expect(() => krippendorffAlpha([[-1, 2]], "ratio")).toThrow(/ratio metric/);
  });
});

describe("ICC, cases checked by hand", () => {
  it("gives 1 for every form when all judges agree exactly", () => {
    const result = intraclassCorrelations([
      [1, 1, 1],
      [2, 2, 2],
      [4, 4, 4],
    ]);
    for (const value of Object.values(result.icc)) expect(value).toBeCloseTo(1, 12);
  });

  it("separates consistency from absolute agreement for a judge who is always one point higher", () => {
    // BMS = 4, WMS = 0.5, JMS = 1, EMS = 0 for [[1, 2], [3, 4]].
    const result = intraclassCorrelations([
      [1, 2],
      [3, 4],
    ]);
    expect(result.meanSquares.between).toBeCloseTo(4, 12);
    expect(result.meanSquares.within).toBeCloseTo(0.5, 12);
    expect(result.meanSquares.judges).toBeCloseTo(1, 12);
    expect(result.meanSquares.residual).toBeCloseTo(0, 12);
    expect(result.icc["1,1"]).toBeCloseTo(7 / 9, 12);
    expect(result.icc["2,1"]).toBeCloseTo(4 / 5, 12);
    expect(result.icc["3,1"]).toBeCloseTo(1, 12);
    expect(result.icc["1,k"]).toBeCloseTo(7 / 8, 12);
    expect(result.icc["2,k"]).toBeCloseTo(8 / 9, 12);
    expect(result.icc["3,k"]).toBeCloseTo(1, 12);
  });

  it("returns NaN when every rating is identical", () => {
    const result = intraclassCorrelations([
      [2, 2],
      [2, 2],
    ]);
    for (const value of Object.values(result.icc)) expect(value).toBeNaN();
  });

  it("refuses missing ratings, ragged rows and fewer than 2 targets or judges", () => {
    expect(() =>
      intraclassCorrelations([
        [1, 2],
        [3, NaN],
      ]),
    ).toThrow(/missing/);
    expect(() => intraclassCorrelations([[1, 2], [3]])).toThrow(/ratings/);
    expect(() => intraclassCorrelations([[1, 2]])).toThrow(/2 targets/);
    expect(() => intraclassCorrelations([[1], [2]])).toThrow(/2 judges/);
  });
});

describe("weighted kappa, cases checked by hand", () => {
  it("gives 1 for perfect agreement with either weighting", () => {
    expect(weightedKappa([0, 1, 2, 3], [0, 1, 2, 3], 4).kappa).toBe(1);
    expect(weightedKappa([0, 1, 2, 3], [0, 1, 2, 3], 4, "linear").kappa).toBe(1);
  });

  it("weights a near miss less under quadratic weights: [0,1,2] vs [0,2,1] gives 0.5 quadratic, 0.25 linear", () => {
    // Quadratic: observed 2/3, expected 12/9, kappa 1 - 0.5. Linear: observed 2/3, expected 8/9.
    expect(weightedKappa([0, 1, 2], [0, 2, 1], 3).kappa).toBeCloseTo(0.5, 12);
    expect(weightedKappa([0, 1, 2], [0, 2, 1], 3, "linear").kappa).toBeCloseTo(0.25, 12);
  });

  it("equals Cohen's unweighted kappa with two categories: p_o 0.6, p_e 0.56, kappa 1/11", () => {
    // Meg and Owen from Krippendorff (2011), example A, read as a contingency table.
    const [meg, owen] = krippendorff2011.examples.A.data;
    expect(weightedKappa(meg!, owen!, 2).kappa).toBeCloseTo(1 / 11, 12);
    expect(weightedKappa(meg!, owen!, 2, "linear").kappa).toBeCloseTo(1 / 11, 12);
  });

  it("drops items where either level is missing", () => {
    const result = weightedKappa([0, 1, null, 2], [0, 1, 2, undefined], 3);
    expect(result.pairs).toBe(2);
    expect(result.kappa).toBe(1);
  });

  it("refuses levels outside 0..K-1 and arrays of different length", () => {
    expect(() => weightedKappa([0, 4], [0, 1], 4)).toThrow(/outside 0..3/);
    expect(() => weightedKappa([0, 1.5], [0, 1], 4)).toThrow(/outside/);
    expect(() => weightedKappa([0, 1], [0], 4)).toThrow(/items/);
  });
});

describe("bootstrap confidence interval", () => {
  const items = [2.1, 3.4, 1.9, 5.0, 4.2, 3.3, 2.8, 4.7, 3.9, 2.5];

  it("is deterministic for a fixed seed", () => {
    const first = bootstrapCI(items, mean, { seed: 7 });
    const second = bootstrapCI(items, mean, { seed: 7 });
    expect(second).toEqual(first);
    const other = bootstrapCI(items, mean, { seed: 8 });
    expect([other.lower, other.upper]).not.toEqual([first.lower, first.upper]);
  });

  it("defaults to 2000 resamples, a 95% level and seed 1", () => {
    const result = bootstrapCI(items, mean);
    expect(result).toMatchObject({ resamples: 2000, level: 0.95, seed: 1, valid: 2000 });
    expect([DEFAULT_RESAMPLES, DEFAULT_LEVEL, DEFAULT_SEED]).toEqual([2000, 0.95, 1]);
  });

  it("brackets the estimate, and narrows as the level drops", () => {
    const wide = bootstrapCI(items, mean, { level: 0.95 });
    const narrow = bootstrapCI(items, mean, { level: 0.5 });
    expect(wide.estimate).toBeCloseTo(mean(items), 12);
    expect(wide.lower).toBeLessThan(wide.estimate);
    expect(wide.upper).toBeGreaterThan(wide.estimate);
    expect(narrow.lower).toBeGreaterThan(wide.lower);
    expect(narrow.upper).toBeLessThan(wide.upper);
  });

  it("gives a zero-width interval when every item is the same", () => {
    const result = bootstrapCI([3, 3, 3, 3], mean, { resamples: 50 });
    expect([result.lower, result.estimate, result.upper]).toEqual([3, 3, 3]);
  });

  it("leaves out resamples where the statistic is undefined and reports how many were used", () => {
    // Two items: about half the resamples draw the same item twice, where this statistic is NaN.
    const spread = (sample: readonly number[]) =>
      sample.every((x) => x === sample[0]) ? NaN : mean(sample);
    const result = bootstrapCI([0, 1], spread, { resamples: 400 });
    expect(result.valid).toBeGreaterThan(0);
    expect(result.valid).toBeLessThan(400);
    expect(result.lower).toBe(0.5);
    expect(result.upper).toBe(0.5);
  });

  it("mulberry32 repeats its sequence for a seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const draws = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(draws);
    expect(draws.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mean(draws)).toBeGreaterThan(0.45);
    expect(mean(draws)).toBeLessThan(0.55);
  });

  it("refuses an empty item list and a level outside (0, 1)", () => {
    expect(() => bootstrapCI([], mean)).toThrow(/no items/);
    expect(() => bootstrapCI(items, mean, { level: 1 })).toThrow(/level/);
  });
});

describe("strictness index", () => {
  it("is positive for a lenient rater and negative for the strict ones", () => {
    // Rater 2 is always one level above raters 0 and 1.
    const result = strictnessIndex([
      [1, 1, 2],
      [2, 2, 3],
      [2, 2, 3],
      [1, 1, 2],
    ]);
    expect(result.map((r) => r.index)).toEqual([-0.5, -0.5, 1]);
    expect(result.map((r) => r.items)).toEqual([4, 4, 4]);
  });

  it("sums to zero over raters when nothing is missing", () => {
    const result = strictnessIndex([
      [0, 3, 2, 1],
      [1, 3, 3, 0],
      [2, 2, 3, 1],
    ]);
    expect(result.reduce((s, r) => s + r.index, 0)).toBeCloseTo(0, 12);
  });

  it("skips missing levels and compares only with the raters who gave one", () => {
    // Item 0: raters 0 and 2 (2 vs 3). Item 1: raters 0 and 1 (1 vs 1). Item 2: raters 1 and 2.
    const result = strictnessIndex([
      [2, null, 3],
      [1, 1, undefined],
      [NaN, 2, 2],
    ]);
    expect(result).toEqual([
      { rater: 0, index: -0.5, items: 2 },
      { rater: 1, index: 0, items: 2 },
      { rater: 2, index: 0.5, items: 2 },
    ]);
  });

  it("gives NaN to a rater with no comparable item, and skips items only one rater scored", () => {
    const result = strictnessIndex([
      [3, null, null],
      [1, 2, null],
    ]);
    expect(result[0]).toEqual({ rater: 0, index: -1, items: 1 });
    expect(result[1]).toEqual({ rater: 1, index: 1, items: 1 });
    expect(result[2]!.items).toBe(0);
    expect(result[2]!.index).toBeNaN();
  });

  it("needs at least 2 raters", () => {
    expect(() => strictnessIndex([[1], [2]])).toThrow(/2 raters/);
  });
});
