import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  QualificationPackSchema,
  allPcs,
  nosIdOf,
  type QualificationPack,
} from "@/lib/packs/schema";

// Pack integrity. Expected structure figures are read off the official PDFs, page cited per test.

const read = (name: string): unknown =>
  JSON.parse(readFileSync(`packs/qp/${name}.json`, "utf8")) as unknown;

const electrician = (): QualificationPack => QualificationPackSchema.parse(read("CON-Q0602-v4.0"));
const mason = (): QualificationPack => QualificationPackSchema.parse(read("CON-Q0103-v1.0"));

const total = (p: QualificationPack, key: "theory" | "practical") =>
  p.nos.reduce((s, n) => s + n.marks[key], 0);

describe("CON/Q0602 v4.0 Assistant Electrician", () => {
  it("validates against the pack schema", () => {
    expect(() => electrician()).not.toThrow();
  });

  it("has the 8 NOS, weightages and marks of the QP's Assessment Weightage table (pages 47 to 48)", () => {
    const p = electrician();
    expect(p.nos.map((n) => n.id)).toEqual([
      "CON/N0602",
      "CON/N0603",
      "CON/N0604",
      "CON/N0605",
      "CON/N9001",
      "CON/N8001",
      "CON/N8002",
      "DGT/VSQ/N0101",
    ]);
    expect(p.nos.map((n) => n.weightagePct)).toEqual([20, 20, 20, 20, 5, 5, 5, 5]);
    expect(total(p, "theory")).toBe(230);
    expect(total(p, "practical")).toBe(520);
  });

  it("has 119 PCs: 11, 16, 11, 16, 17, 12, 15 and 21 per NOS (Elements and Performance Criteria)", () => {
    const p = electrician();
    expect(p.nos.map((n) => n.pcs.length)).toEqual([11, 16, 11, 16, 17, 12, 15, 21]);
    expect(allPcs(p)).toHaveLength(119);
  });

  it("keeps both pass marks the QP states, with their quotes", () => {
    const rule = electrician().passRule!;
    expect(rule.qpPassPct).toBe(70);
    expect(rule.minAggregatePct).toBe(50);
    expect(rule.quotes.map((q) => q.source).join(" ")).toContain("page 46");
  });

  it("scores measurement items only against a band that names its source", () => {
    const measured = allPcs(electrician()).filter((pc) => pc.type === "measurement");
    expect(measured.length).toBeGreaterThan(0);
    for (const pc of measured) {
      expect(pc.tolerance?.source.length).toBeGreaterThan(10);
      expect(pc.anchors).toBeUndefined();
    }
  });

  it("words every judgement anchor on the WorldSkills scale, level 0 to 3", () => {
    const prefixes = ["Below standard", "Meets standard", "Exceeds in places", "Excellent"];
    for (const pc of allPcs(electrician()).filter((p) => p.type === "judgement")) {
      pc.anchors!.forEach((a, level) =>
        expect(a.startsWith(prefixes[level]!), `${pc.id} L${level}`).toBe(true),
      );
      expect(pc.observables!.length).toBeGreaterThan(0);
    }
  });
});

describe("CON/Q0103 v1.0 Mason General (mapping only)", () => {
  it("validates, and says it is deactivated and mapping-only", () => {
    const p = mason();
    expect(p.status).toBe("deactivated");
    expect(p.use).toBe("mapping-only");
  });

  it("has 8 NOS, 165 PCs and the 800 marks of its weightage table (page 53)", () => {
    const p = mason();
    expect(p.nos).toHaveLength(8);
    expect(allPcs(p)).toHaveLength(165);
    expect(total(p, "theory") + total(p, "practical")).toBe(800);
    expect(p.nos.map((n) => n.weightagePct)).toEqual([20, 15, 12, 12, 15, 6, 6, 14]);
  });
});

// En dash and em dash, built from code points so this file itself contains neither.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

describe("pack text", () => {
  it("contains no em or en dash anywhere", () => {
    for (const name of ["CON-Q0602-v4.0", "CON-Q0103-v1.0"]) {
      const text = readFileSync(`packs/qp/${name}.json`, "utf8");
      expect(text).not.toMatch(DASHES);
    }
  });

  it("names the NOS of a PC id", () => {
    expect(nosIdOf("DGT/VSQ/N0101.PC12")).toBe("DGT/VSQ/N0101");
    expect(nosIdOf("CON/N0604.PC6")).toBe("CON/N0604");
  });
});
