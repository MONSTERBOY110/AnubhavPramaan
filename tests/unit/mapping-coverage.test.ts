import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coverage, pcWeights } from "@/lib/mapping/coverage";
import { ROUTE_THRESHOLD, gapPlan, suggestRoute } from "@/lib/mapping/route";
import { getPack } from "@/lib/packs/load";

// Coverage and route are plain code. They are checked against a second, independent
// implementation: eval/mapping/check_labels.py (Python) wrote expected.coverageFlat,
// expected.coverageWeighted and both routes into every frozen declaration before this file existed.

type Frozen = {
  id: string;
  expected: {
    qp: string;
    pcIds: string[];
    coverageFlat: number;
    coverageWeighted: number;
    routeFlat: string;
    routeWeighted: string;
  };
};

const dir = "eval/mapping/declarations";
const frozen: Frozen[] = readdirSync(dir)
  .filter((f) => /^D\d+\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Frozen);

describe("coverage", () => {
  it("gives every pack's PC weights a total of 1", () => {
    for (const id of ["CON/Q0602", "CON/Q0103"]) {
      const total = [...pcWeights(getPack(id)).values()].reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it.each(frozen.map((d) => [d.id, d] as const))("matches the Python figures for %s", (_id, d) => {
    const cov = coverage(getPack(d.expected.qp), d.expected.pcIds);
    expect(cov.flat).toBeCloseTo(d.expected.coverageFlat, 4);
    expect(cov.weighted).toBeCloseTo(d.expected.coverageWeighted, 4);
    expect(suggestRoute(cov, "flat").suggestion).toBe(d.expected.routeFlat);
    expect(suggestRoute(cov, "weighted").suggestion).toBe(d.expected.routeWeighted);
  });

  it("ignores ids that are not in the pack", () => {
    const cov = coverage(getPack("CON/Q0602"), ["CON/N0602.PC1", "CON/N0110.PC1", "made-up"]);
    expect(cov.covered).toEqual(["CON/N0602.PC1"]);
  });

  it("reports per-NOS shares by count and by marks", () => {
    const cov = coverage(getPack("CON/Q0602"), ["CON/N0603.PC1", "CON/N0603.PC10"]);
    const n0603 = cov.perNos.find((n) => n.nosId === "CON/N0603")!;
    expect(n0603.pct).toBeCloseTo(2 / 16, 12);
    // Element E1 has 9 PCs and E2 has 7, each element half of the NOS marks (QP page 12).
    expect(n0603.weightedPct).toBeCloseTo(0.5 / 9 + 0.5 / 7, 12);
  });
});

describe("route", () => {
  it("suggests direct assessment at exactly 70% and upskilling just below", () => {
    const base = { covered: [], perNos: [] };
    expect(suggestRoute({ ...base, flat: ROUTE_THRESHOLD, weighted: 0 }, "flat").suggestion).toBe(
      "direct-assessment",
    );
    expect(suggestRoute({ ...base, flat: 0.6999, weighted: 0.9 }, "flat").suggestion).toBe(
      "upskill-first",
    );
    expect(suggestRoute({ ...base, flat: 0.1, weighted: 0.7 }, "weighted").suggestion).toBe(
      "direct-assessment",
    );
  });

  it("lists the gaps by NOS, heaviest NOS first", () => {
    const pack = getPack("CON/Q0602");
    const all = pack.nos.flatMap((n) => n.pcs.map((p) => p.id));
    const plan = gapPlan(
      pack,
      coverage(
        pack,
        all.filter((id) => !id.startsWith("CON/N0605") && id !== "CON/N9001.PC1"),
      ),
    );
    expect(plan.map((g) => g.nosId)).toEqual(["CON/N0605", "CON/N9001"]);
    expect(plan[0]!.pcs).toHaveLength(16);
  });
});
