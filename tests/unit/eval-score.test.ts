import { describe, expect, it } from "vitest";
import { scoreLabels } from "@/lib/eval/score";

// Precision and recall over labelled turns. The numbers on the metrics page and in the README come
// from here, so the arithmetic is tested rather than trusted.

describe("scoreLabels", () => {
  it("counts a perfect prediction as all true positives", () => {
    const s = scoreLabels([{ expected: ["a", "b"], predicted: ["b", "a"] }]);
    expect(s).toMatchObject({ tp: 2, fp: 0, fn: 0 });
    expect(s.precision).toBe(1);
    expect(s.recall).toBe(1);
    expect(s.f1).toBe(1);
  });

  it("counts something predicted that was not there as a false positive", () => {
    const s = scoreLabels([{ expected: [], predicted: ["a"] }]);
    expect(s).toMatchObject({ tp: 0, fp: 1, fn: 0 });
    expect(s.precision).toBe(0);
    // Nothing was there to find, so recall is not a failure.
    expect(s.recall).toBe(1);
  });

  it("counts something missed as a false negative", () => {
    const s = scoreLabels([{ expected: ["a"], predicted: [] }]);
    expect(s).toMatchObject({ tp: 0, fp: 0, fn: 1 });
    expect(s.recall).toBe(0);
    expect(s.precision).toBe(1);
  });

  it("ignores a duplicate prediction rather than counting it twice", () => {
    const s = scoreLabels([{ expected: ["a"], predicted: ["a", "a"] }]);
    expect(s).toMatchObject({ tp: 1, fp: 0, fn: 0 });
  });

  it("adds up across many turns", () => {
    const s = scoreLabels([
      { expected: ["a"], predicted: ["a"] },
      { expected: ["b"], predicted: ["c"] },
      { expected: [], predicted: [] },
    ]);
    expect(s).toMatchObject({ tp: 1, fp: 1, fn: 1 });
    expect(s.precision).toBeCloseTo(0.5);
    expect(s.recall).toBeCloseTo(0.5);
    expect(s.f1).toBeCloseTo(0.5);
  });

  it("calls a corpus with nothing to find perfect rather than dividing by zero", () => {
    const s = scoreLabels([{ expected: [], predicted: [] }]);
    expect(s.precision).toBe(1);
    expect(s.recall).toBe(1);
    expect(s.f1).toBe(1);
  });

  it("reports which labels were wrong, so a bad pattern can be found", () => {
    const s = scoreLabels([
      { expected: ["a"], predicted: ["b"] },
      { expected: ["a"], predicted: [] },
    ]);
    expect(s.falsePositives).toEqual({ b: 1 });
    expect(s.falseNegatives).toEqual({ a: 2 });
  });
});
