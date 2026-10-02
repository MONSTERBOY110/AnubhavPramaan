import type { Nos, Pc, QualificationPack, Tolerance } from "@/lib/packs/schema";

// Practical scoring (TRD M4). Plain code: the assessor enters a reading or chooses a level, and
// these functions turn it into marks. No model is involved anywhere in this file.
//
// Marks per PC are DERIVED: the QP sets practical marks per element (the "Assessment Criteria for
// Outcomes" table), so each PC gets an equal share of its element's practical marks. The screen
// says so next to every mark.

export type Level = 0 | 1 | 2 | 3;

/** Practical marks available for a PC: its element's practical marks shared equally by its PCs. */
export function pcPracticalMarks(nos: Nos, pc: Pc): number {
  const el = nos.elements.find((e) => e.id === pc.element);
  if (!el) throw new Error(`${pc.id}: unknown element ${pc.element}`);
  const siblings = nos.pcs.filter((p) => p.element === pc.element).length;
  return el.marks.practical / siblings;
}

export type MeasurementScore = {
  within: boolean;
  marks: number;
  max: number;
  reading: number;
  tolerance: Tolerance;
};

/**
 * Measurement items: full marks inside the sourced band, zero outside (WorldSkills marking by
 * measurement, "only the maximum mark or zero"; CSDCI tolerance sheets).
 */
export function scoreMeasurement(
  tolerance: Tolerance,
  reading: number,
  max: number,
): MeasurementScore {
  if (!Number.isFinite(reading)) throw new Error("a reading must be a number");
  const within =
    tolerance.kind === "band"
      ? Math.abs(reading - tolerance.target) <= tolerance.plusMinus
      : tolerance.kind === "min"
        ? reading >= tolerance.min
        : reading <= tolerance.max;
  return { within, marks: within ? max : 0, max, reading, tolerance };
}

/**
 * The level that means "performance meets industry standard" on the WorldSkills judgement scale
 * every anchor in the packs is written on (0 below, 1 meets, 2 meets and in specific respects
 * exceeds, 3 wholly exceeds and excellent; WorldSkills Europe TD19, section 4.6).
 */
export const MEETS_STANDARD: Level = 1;

/**
 * Judgement items: a PC judged at or above the standard earns its marks, a PC below it earns none,
 * the same full-or-zero rule as measurement items. Levels 2 and 3 stay in the record and on the
 * profile as strengths but add no marks, so the QP's pass percentage reads "the standard is met on
 * PCs carrying that share of the marks". (A share of marks per level, max x level / 3, would give
 * a PC that meets the standard a third of its marks and fail a worker who meets it everywhere.)
 */
export function marksForLevel(level: Level, max: number): number {
  if (![0, 1, 2, 3].includes(level)) throw new Error("a level is 0, 1, 2 or 3");
  return level >= MEETS_STANDARD ? max : 0;
}

export type PcScore = {
  pcId: string;
  nosId: string;
  type: Pc["type"];
  max: number;
  marks: number;
  level?: Level;
  reading?: number;
};

export type NosScore = {
  nosId: string;
  title: string;
  weightagePct: number;
  marks: number;
  max: number;
  pct: number;
  scored: number;
  total: number;
};

/**
 * Per NOS: marks awarded over the practical marks of ALL its PCs. A PC the assessor did not score
 * counts as not shown, so scoring a few PCs well can never make a NOS look met.
 */
export function nosScores(pack: QualificationPack, scores: PcScore[]): NosScore[] {
  const byPc = new Map(scores.map((s) => [s.pcId, s]));
  return pack.nos.map((nos) => {
    // Summed in the pack's own PC order, like the tablet, so rounding never depends on the order
    // in which the assessor happened to score.
    let marks = 0;
    let max = 0;
    let scored = 0;
    for (const pc of nos.pcs) {
      max += pcPracticalMarks(nos, pc);
      const s = byPc.get(pc.id);
      if (s && s.nosId === nos.id) {
        marks += s.marks;
        scored += 1;
      }
    }
    return {
      nosId: nos.id,
      title: nos.title,
      weightagePct: nos.weightagePct,
      marks,
      max,
      pct: max > 0 ? marks / max : 0,
      scored,
      total: nos.pcs.length,
    };
  });
}
