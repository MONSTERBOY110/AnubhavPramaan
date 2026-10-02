import { describe, expect, it } from "vitest";
import { deviationCheck, deviationSatisfied } from "@/lib/assess/deviation";
import { band, profile } from "@/lib/assess/grade";
import {
  MEETS_STANDARD,
  marksForLevel,
  nosScores,
  pcPracticalMarks,
  scoreMeasurement,
  type PcScore,
} from "@/lib/assess/scoring";
import { allPcs, nosIdOf } from "@/lib/packs/schema";
import { getPack } from "@/lib/packs/load";

const pack = getPack("CON/Q0602");

describe("measurement items", () => {
  it("gives full marks inside the band and zero outside (WorldSkills: maximum mark or zero)", () => {
    const band = {
      kind: "band" as const,
      target: 1000,
      plusMinus: 5,
      unit: "mm" as const,
      source: "test band for this unit test",
    };
    expect(scoreMeasurement(band, 1004, 10).marks).toBe(10);
    expect(scoreMeasurement(band, 1005, 10).within).toBe(true);
    expect(scoreMeasurement(band, 1006, 10).marks).toBe(0);
  });

  it("applies the pack's sourced limits: saddle gap at most 500 mm, insulation at least 1 megohm", () => {
    const saddle = allPcs(pack).find((p) => p.id === "CON/N0604.PC5")!;
    const megger = allPcs(pack).find((p) => p.id === "CON/N0604.PC10")!;
    expect(scoreMeasurement(saddle.tolerance!, 480, 1).within).toBe(true);
    expect(scoreMeasurement(saddle.tolerance!, 520, 1).within).toBe(false);
    expect(scoreMeasurement(megger.tolerance!, 0.8, 1).within).toBe(false);
    expect(scoreMeasurement(megger.tolerance!, 50, 1).within).toBe(true);
  });
});

describe("judgement items and marks", () => {
  it("gives a PC its marks when the level meets the standard (WorldSkills level 1) and none below it", () => {
    expect(MEETS_STANDARD).toBe(1);
    expect(marksForLevel(0, 9)).toBe(0);
    expect(marksForLevel(1, 9)).toBe(9);
    expect(marksForLevel(2, 9)).toBe(9);
    expect(marksForLevel(3, 9)).toBe(9);
  });

  it("splits an element's practical marks equally among its PCs", () => {
    const nos = pack.nos.find((n) => n.id === "CON/N0603")!;
    // Element E1 has 35 practical marks over 9 PCs (QP page 12).
    expect(pcPracticalMarks(nos, nos.pcs[0]!)).toBeCloseTo(35 / 9, 12);
    expect(nos.pcs.reduce((a, pc) => a + pcPracticalMarks(nos, pc), 0)).toBeCloseTo(70, 12);
  });
});

describe("deviation rule", () => {
  it("asks for a reason when the level contradicts the evidence hint", () => {
    // Standard met while an observable is not visible, or not met while every observable is.
    expect(deviationCheck(3, ["visible", "not_visible"]).needsReason).toBe(true);
    expect(deviationCheck(1, ["visible", "not_visible"]).needsReason).toBe(true);
    expect(deviationCheck(0, ["visible", "visible"]).needsReason).toBe(true);
  });

  it("asks for nothing when the level agrees with the hint, or there is no hint", () => {
    expect(deviationCheck(1, ["visible", "visible"]).needsReason).toBe(false);
    expect(deviationCheck(0, ["visible", "not_visible"]).needsReason).toBe(false);
    expect(deviationCheck(2, ["visible", "cannot_tell"]).needsReason).toBe(false);
    expect(deviationCheck(0, null).needsReason).toBe(false);
  });

  it("accepts the decision once a reason of 10 or more characters is given", () => {
    const check = deviationCheck(3, ["not_visible"]);
    expect(deviationSatisfied(check, "too short")).toBe(false);
    expect(deviationSatisfied(check, "Saw the joint taped in person")).toBe(true);
  });
});

describe("profile, band and recommendation", () => {
  it("uses the PMKVY 4.0 bands", () => {
    expect(band(0.85)).toBe("A");
    expect(band(0.849)).toBe("B");
    expect(band(0.7)).toBe("B");
    expect(band(0.5)).toBe("C");
    expect(band(0.49)).toBe("NYC");
  });

  function scoresAt(level: (nosId: string) => 0 | 1 | 2 | 3): PcScore[] {
    return pack.nos.flatMap((nos) =>
      nos.pcs.map((pc) => {
        const max = pcPracticalMarks(nos, pc);
        const l = level(nosIdOf(pc.id));
        return {
          pcId: pc.id,
          nosId: nos.id,
          type: pc.type,
          max,
          marks: marksForLevel(l, max),
          level: l,
        };
      }),
    );
  }

  it("recommends certification when every NOS passes, partial credit when some do", () => {
    const all = profile(
      pack,
      nosScores(
        pack,
        scoresAt(() => 3),
      ),
    );
    expect(all.recommendation).toBe("certify");
    expect(all.band).toBe("A");
    expect(all.totalPct).toBeCloseTo(1, 12);
    const some = profile(
      pack,
      nosScores(
        pack,
        scoresAt((n) => (n === "CON/N0605" ? 0 : 3)),
      ),
    );
    expect(some.recommendation).toBe("partial");
    expect(some.bridge).toEqual(["CON/N0605"]);
    // N0605 weighs 20% of the QP and earns nothing: total = 0.8.
    expect(some.totalPct).toBeCloseTo(0.8, 12);
  });

  it("recommends certification for a worker who meets the standard on every PC", () => {
    const met = profile(
      pack,
      nosScores(
        pack,
        scoresAt(() => 1),
      ),
    );
    expect(met.recommendation).toBe("certify");
    expect(met.totalPct).toBeCloseTo(1, 12);
  });

  it("counts a PC not scored as not shown, so a few good scores never make a NOS met", () => {
    const nos = pack.nos.find((n) => n.id === "CON/N0602")!;
    const three = nos.pcs.slice(0, 3).map((pc) => {
      const max = pcPracticalMarks(nos, pc);
      return {
        pcId: pc.id,
        nosId: nos.id,
        type: pc.type,
        max,
        marks: marksForLevel(3, max),
        level: 3 as const,
      };
    });
    const n0602 = profile(pack, nosScores(pack, three)).perNos.find(
      (n) => n.nosId === "CON/N0602",
    )!;
    expect(n0602.complete).toBe(false);
    expect(n0602.pct).toBeLessThan(0.7);
    expect(n0602.pass).toBe(false);
  });

  it("gives the same result in any scoring order, even exactly on the pass mark", () => {
    // DGT/VSQ/N0101 with PC7 to PC21 met is 21 of its 30 practical marks: exactly 70%. Summed in
    // scoring order this came out as 0.7000000000000001 one way and 0.6999999999999998 the other.
    const nos = pack.nos.find((n) => n.id === "DGT/VSQ/N0101")!;
    const met = nos.pcs.slice(6).map((pc) => {
      const max = pcPracticalMarks(nos, pc);
      return {
        pcId: pc.id,
        nosId: nos.id,
        type: pc.type,
        max,
        marks: marksForLevel(1, max),
        level: 1 as const,
      };
    });
    const forward = profile(pack, nosScores(pack, met)).perNos.find((n) => n.nosId === nos.id)!;
    const backward = profile(pack, nosScores(pack, [...met].reverse())).perNos.find(
      (n) => n.nosId === nos.id,
    )!;
    expect(forward.pct).toBe(backward.pct);
    expect(forward.pct).toBeCloseTo(0.7, 12);
    expect(forward.pass).toBe(true);
    expect(backward.pass).toBe(true);
  });

  it("recommends reassessment when no NOS passes", () => {
    expect(
      profile(
        pack,
        nosScores(
          pack,
          scoresAt(() => 0),
        ),
      ).recommendation,
    ).toBe("reassess");
  });
});
