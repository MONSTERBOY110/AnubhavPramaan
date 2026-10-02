import { z } from "zod";

// Qualification Pack (QP) as versioned JSON (TRD section 3). The structure follows the official QP
// PDF: a QP has NOS; a NOS has elements (the "outcomes" that carry theory and practical marks) and
// performance criteria (PCs) under each element. Text comes from tools/extract_qp.py; the
// assessment content (item type, observables, anchors, tolerances, synonyms) comes from a reviewed
// overlay merged by tools/build_pack.py. Everything here is data: no rule in this file decides a
// score, a route or a certificate.

export const MarksSchema = z.object({
  theory: z.number().nonnegative(),
  practical: z.number().nonnegative(),
  project: z.number().nonnegative(),
  viva: z.number().nonnegative(),
});
export type Marks = z.infer<typeof MarksSchema>;

export const UnitSchema = z.enum(["mm", "Mohm", "ohm", "V", "A", "deg"]);

/**
 * A measurement item is scored by rule from the reading the assessor enters: full marks inside the
 * band, zero outside (WorldSkills marking by measurement; CSDCI tolerance sheets). Every band names
 * its source, because the number is shown to the assessor.
 */
export const ToleranceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("band"),
    target: z.number(),
    plusMinus: z.number().positive(),
    unit: UnitSchema,
    source: z.string().min(10),
  }),
  z.object({ kind: z.literal("min"), min: z.number(), unit: UnitSchema, source: z.string().min(10) }),
  z.object({ kind: z.literal("max"), max: z.number(), unit: UnitSchema, source: z.string().min(10) }),
]);
export type Tolerance = z.infer<typeof ToleranceSchema>;

/** Levels 0 to 3, worded on the WorldSkills judgement scale. */
export const AnchorsSchema = z.tuple([z.string().min(10), z.string().min(10), z.string().min(10), z.string().min(10)]);

export const PcSchema = z.object({
  id: z.string().regex(/^[A-Z]+(?:\/[A-Z]+)*\/N\d{4}\.PC\d+$/),
  code: z.string().regex(/^PC\d+$/),
  element: z.string().regex(/^E\d+$/),
  text: z.string().min(3),
  page: z.number().int().positive(),
  type: z.enum(["measurement", "judgement"]),
  /** Measurement items: what the assessor measures, in one line. */
  measurementTask: z.string().min(10).optional(),
  tolerance: ToleranceSchema.optional(),
  /** Judgement items: what level 0, 1, 2 and 3 look like for this PC. */
  anchors: AnchorsSchema.optional(),
  /** What an assessor, or a hint model looking at evidence, can check. */
  observables: z.array(z.string().min(5)).optional(),
  observablesSource: z.string().optional(),
  /** Hindi and trade words a worker may use for this activity (mapping prompts). */
  synonyms: z.array(z.string().min(1)).optional(),
  textHi: z.string().optional(),
});
export type Pc = z.infer<typeof PcSchema>;

export const ElementSchema = z.object({
  id: z.string().regex(/^E\d+$/),
  title: z.string().min(3),
  marks: MarksSchema,
  page: z.number().int().positive(),
});
export type Element = z.infer<typeof ElementSchema>;

export const NosSchema = z.object({
  id: z.string().regex(/^[A-Z]+(?:\/[A-Z]+)*\/N\d{4}$/),
  title: z.string().min(3),
  version: z.string().nullable(),
  nsqfLevel: z.string().nullable(),
  credits: z.string().nullable(),
  /** The QP's own "Weightage" column; the NOS weightages of a QP sum to 100. */
  weightagePct: z.number().positive(),
  marks: MarksSchema,
  elements: z.array(ElementSchema).min(1),
  pcs: z.array(PcSchema).min(1),
});
export type Nos = z.infer<typeof NosSchema>;

/** Pass marks quoted from the QP. Where the QP contradicts itself, both are kept and shown. */
export const PassRuleSchema = z.object({
  qpPassPct: z.number().min(0).max(100).optional(),
  minAggregatePct: z.number().min(0).max(100).optional(),
  practicalPerNosPct: z.number().min(0).max(100).optional(),
  quotes: z.array(z.object({ text: z.string().min(5), source: z.string().min(5) })).min(1),
  note: z.string().optional(),
});

export const QualificationPackSchema = z
  .object({
    id: z.string().regex(/^[A-Z]+\/Q\d{4}$/),
    version: z.string().regex(/^\d+(?:\.\d+)?$/),
    title: z.string().min(3),
    nsqfLevel: z.string(),
    sector: z.string().optional(),
    subSector: z.string().optional(),
    occupation: z.string().optional(),
    credits: z.number().optional(),
    ncoCode: z.string().optional(),
    nqrCode: z.string().optional(),
    entryRoutes: z.array(z.string()).optional(),
    /** "deactivated" packs are kept only to test trade discrimination, and say so on screen. */
    status: z.enum(["active", "deactivated"]),
    /** "mapping-only" packs have PCs for matching but no anchors or tolerances for scoring. */
    use: z.enum(["assessment", "mapping-only"]),
    passRule: PassRuleSchema.optional(),
    notes: z.array(z.string()).optional(),
    nos: z.array(NosSchema).min(1),
    source: z.object({
      url: z.string().url(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      pages: z.number().int().positive(),
      extractedAt: z.string(),
      extractor: z.string(),
      overlay: z.string().optional(),
    }),
  })
  .superRefine((pack, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });

    const weightage = pack.nos.reduce((sum, n) => sum + n.weightagePct, 0);
    if (Math.abs(weightage - 100) > 1e-9) issue(`NOS weightage sums to ${weightage}, not 100`);

    const seen = new Set<string>();
    for (const nos of pack.nos) {
      const elementIds = new Set(nos.elements.map((e) => e.id));
      for (const key of ["theory", "practical", "project", "viva"] as const) {
        const sum = nos.elements.reduce((s, e) => s + e.marks[key], 0);
        if (Math.abs(sum - nos.marks[key]) > 1e-9) {
          issue(`${nos.id}: element ${key} marks sum to ${sum}, NOS says ${nos.marks[key]}`);
        }
      }
      nos.pcs.forEach((pc, i) => {
        if (pc.id !== `${nos.id}.PC${i + 1}` || pc.code !== `PC${i + 1}`) {
          issue(`${nos.id}: PC ${pc.id} out of order or misnamed`);
        }
        if (seen.has(pc.id)) issue(`duplicate PC id ${pc.id}`);
        seen.add(pc.id);
        if (!elementIds.has(pc.element)) issue(`${pc.id}: unknown element ${pc.element}`);
        if (pc.type === "measurement" && pc.anchors) issue(`${pc.id}: measurement items carry no anchors`);
        if (pc.type === "judgement" && pc.tolerance) issue(`${pc.id}: judgement items carry no tolerance`);
        if (pack.use === "assessment") {
          if (pc.type === "judgement" && (!pc.anchors || !pc.observables?.length)) {
            issue(`${pc.id}: a judgement item needs four anchors and at least one observable`);
          }
          if (pc.type === "measurement" && (!pc.tolerance || !pc.measurementTask)) {
            issue(`${pc.id}: a measurement item needs a tolerance and a measurement task`);
          }
        }
      });
      for (const el of nos.elements) {
        if (!nos.pcs.some((pc) => pc.element === el.id)) issue(`${nos.id} ${el.id}: element has no PCs`);
      }
    }
    if (pack.use === "assessment" && !pack.passRule) issue("an assessment pack needs a pass rule");
  });

export type QualificationPack = z.infer<typeof QualificationPackSchema>;

/** Every PC of a pack in document order. */
export function allPcs(pack: QualificationPack): Pc[] {
  return pack.nos.flatMap((n) => n.pcs);
}

/** The NOS a PC id belongs to: everything before ".PC". */
export function nosIdOf(pcId: string): string {
  return pcId.slice(0, pcId.lastIndexOf(".PC"));
}
