import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { krippendorffAlpha } from "@/lib/agreement";
import { agreementFor, MIN_RATERS } from "@/lib/calibration/agreement";
import {
  CalibrationSetSchema,
  coverageProblems,
  units,
  type Submission,
} from "@/lib/calibration/schema";
import { calibrationSets, validateSet } from "@/lib/calibration/sets";
import { DELETE, POST } from "@/app/api/calibration/[setId]/ratings/route";
import { memoryStore } from "@/lib/store/records";

// Calibration agreement, computed only from submissions. The levels below are written for this
// test to exercise the code; they are nobody's ratings and are never reported anywhere.

const set = CalibrationSetSchema.parse({
  id: "test-set",
  title: "Test set",
  qp: "CON/Q0602",
  note: "Written for the unit test only.",
  items: [
    {
      id: "I01",
      image: "/evidence/a.jpg",
      credit: "test image, no file",
      pcs: ["CON/N0602.PC1", "CON/N0602.PC2"],
    },
    {
      id: "I02",
      image: "/evidence/b.jpg",
      credit: "test image, no file",
      pcs: ["CON/N0603.PC1", "CON/N0603.PC2", "CON/N0603.PC3"],
    },
  ],
});

function submission(
  rater: string,
  levels: number[],
  condition: "unaided" | "assisted" = "unaided",
): Submission {
  return {
    id: `s-${rater}-${condition}`,
    setId: set.id,
    at: "2026-10-02T04:00:00.000Z",
    rater,
    background: "volunteer",
    condition,
    consent: true,
    ratings: units(set).map((u, i) => ({ ...u, level: levels[i]!, seconds: 30 + i })),
  };
}

describe("calibration submissions", () => {
  it("must give a level on every unit, once", () => {
    const all = units(set);
    expect(all).toHaveLength(5);
    expect(coverageProblems(set, all)).toEqual([]);
    expect(coverageProblems(set, all.slice(1))).toEqual(["I01|CON/N0602.PC1 has no level"]);
    expect(coverageProblems(set, [...all, all[0]!])).toEqual(["I01|CON/N0602.PC1 is rated twice"]);
    expect(coverageProblems(set, [...all, { itemId: "I09", pcId: "x" }])).toEqual([
      "I09|x is not in the set",
    ]);
  });
});

describe("agreement per condition", () => {
  it(`computes nothing until ${MIN_RATERS} raters have submitted`, () => {
    const one = agreementFor(set, [submission("A1", [0, 1, 2, 3, 1])], "unaided");
    expect(one).toMatchObject({ raters: 1, units: 5, alpha: null, kappa: null });
  });

  it("gives alpha and kappa of 1 when two raters agree on every unit", () => {
    const a = agreementFor(
      set,
      [submission("A1", [0, 1, 2, 3, 1]), submission("A2", [0, 1, 2, 3, 1])],
      "unaided",
    );
    expect(a.alpha).toBeCloseTo(1, 12);
    expect(a.kappa).toBeCloseTo(1, 12);
  });

  it("uses the engine's own ordinal alpha on the units x raters matrix", () => {
    const subs = [
      submission("A1", [0, 1, 2, 3, 1]),
      submission("A2", [1, 1, 2, 2, 0]),
      submission("A3", [0, 2, 3, 3, 1]),
    ];
    const matrix = [0, 1, 2, 3, 4].map((u) => subs.map((s) => s.ratings[u]!.level));
    expect(agreementFor(set, subs, "unaided").alpha).toBeCloseTo(
      krippendorffAlpha(matrix, "ordinal").alpha,
      12,
    );
  });

  it("keeps the two conditions apart and names the stricter rater", () => {
    const subs = [
      submission("A1", [1, 2, 2, 3, 1]),
      submission("A2", [1, 2, 2, 3, 1]),
      submission("A3", [0, 1, 1, 2, 0]),
      submission("A1", [0, 0, 0, 0, 0], "assisted"),
    ];
    const unaided = agreementFor(set, subs, "unaided");
    expect(unaided.raters).toBe(3);
    const a3 = unaided.strictness.find((s) => s.rater === "A3")!;
    expect(a3.index).toBeLessThan(0);
    expect(agreementFor(set, subs, "assisted")).toMatchObject({ raters: 1, alpha: null });
  });
});

describe("calibration set validation", () => {
  const base = {
    id: "v-set",
    title: "Validation",
    qp: "CON/Q0602",
    note: "Written for the unit test only.",
  };
  const item = (
    pcs: string[],
    hints?: Record<
      string,
      Array<{ status: "visible" | "not_visible" | "cannot_tell"; reason: string }>
    >,
  ) => ({
    id: "I01",
    image: "/evidence/a.jpg",
    credit: "test image, no file",
    pcs,
    ...(hints ? { hints } : {}),
  });

  it("accepts judgement PCs of the set's pack", () => {
    expect(validateSet({ ...base, items: [item(["CON/N0602.PC1"])] }).items).toHaveLength(1);
  });

  it("refuses a measurement PC, an unknown PC and hints that do not match the observables", () => {
    expect(() => validateSet({ ...base, items: [item(["CON/N0604.PC5"])] })).toThrow(
      /measurement PC/,
    );
    expect(() => validateSet({ ...base, items: [item(["CON/N0602.PC99"])] })).toThrow(
      /is not in CON\/Q0602/,
    );
    expect(() =>
      validateSet({
        ...base,
        items: [
          item(["CON/N0602.PC1"], { "CON/N0602.PC1": [{ status: "visible", reason: "test" }] }),
        ],
      }),
    ).toThrow(/1 hints for 4 observables/);
  });

  it("ships the demo set, every photo on disk and listed with its licence in ATTRIBUTION.md", () => {
    const attribution = readFileSync("public/evidence/ATTRIBUTION.md", "utf8");
    const sets = calibrationSets();
    expect(sets.map((s) => s.id)).toEqual(["demo-electrician-1"]);
    for (const item of sets[0]!.items) {
      const file = item.image.replace(/^\/evidence\//, "");
      expect(existsSync(`public/evidence/${file}`), file).toBe(true);
      expect(attribution, file).toContain(`| ${file} |`);
    }
  });
});

describe("calibration API", () => {
  const SET = "demo-electrician-1";
  const params = { params: Promise.resolve({ setId: SET }) };
  const full = (rater: string) => ({
    rater,
    background: "volunteer",
    condition: "unaided",
    consent: true,
    ratings: units(calibrationSets()[0]!).map((u) => ({ ...u, level: 1, seconds: 5 })),
  });
  const call = (method: "POST" | "DELETE", body: unknown) =>
    new Request(`http://localhost/api/calibration/${SET}/ratings`, {
      method,
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });

  it("keeps every one of several submissions sent at the same moment", async () => {
    const codes = ["UT-A1", "UT-A2", "UT-A3"];
    const replies = await Promise.all(codes.map((c) => POST(call("POST", full(c)), params)));
    expect(replies.map((r) => r.status)).toEqual([200, 200, 200]);
    const stored = (await memoryStore().get<Submission[]>("calibration", SET)) ?? [];
    expect(codes.every((c) => stored.some((s) => s.rater === c))).toBe(true);
    for (const c of codes) await DELETE(call("DELETE", { rater: c, condition: "unaided" }), params);
    const after = (await memoryStore().get<Submission[]>("calibration", SET)) ?? [];
    expect(after.some((s) => codes.includes(s.rater))).toBe(false);
  });

  it("treats q7 and Q7 as the same rater", async () => {
    expect((await POST(call("POST", full("ut-q7")), params)).status).toBe(200);
    expect((await POST(call("POST", full("UT-Q7")), params)).status).toBe(409);
    expect(
      (await DELETE(call("DELETE", { rater: "Ut-Q7", condition: "unaided" }), params)).status,
    ).toBe(200);
  });
});
