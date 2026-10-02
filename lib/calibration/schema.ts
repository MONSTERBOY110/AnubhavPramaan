import { z } from "zod";

// Calibration sets (PRD R12, docs/STUDY-PROTOCOL.md). A set is a fixed list of items: one photo of
// work, openly licensed, with 1 to 5 judgement PCs of one pack that can be judged from it. Raters
// score every PC of every item on the 0 to 3 scale, in one of two conditions:
//   - unaided: the PC text and the generic WorldSkills labels only;
//   - assisted: the PC's own anchors and observables, plus hints frozen in the set file (never a
//     live model call during scoring, so every assisted rater sees exactly the same hints).
// Only real people's submissions are stored. Nothing here simulates a rater.

export const CONDITIONS = ["unaided", "assisted"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const ObservableStatusSchema = z.enum(["visible", "not_visible", "cannot_tell"]);
/** One frozen hint: what the model said about one observable, with its one-line reason. */
export const FrozenHintSchema = z.object({ status: ObservableStatusSchema, reason: z.string() });
export type FrozenHint = z.infer<typeof FrozenHintSchema>;

export const CalibrationItemSchema = z.object({
  id: z.string().regex(/^[A-Z]\d{2}$/),
  /** Public path of the photo, e.g. /evidence/... */
  image: z.string().startsWith("/"),
  /** Title, author, licence and source, as listed in public/evidence/ATTRIBUTION.md. */
  credit: z.string().min(10),
  pcs: z.array(z.string()).min(1).max(5),
  /** Frozen evidence hints per PC, generated once before any rater scores (assisted only). */
  hints: z.record(z.string(), z.array(FrozenHintSchema)).optional(),
});

export const CalibrationSetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string(),
    qp: z.string(),
    /** What the set is, in one line, shown wherever its numbers are. */
    note: z.string().min(10),
    /** Where the frozen hints came from: model, route and time (tools/freeze_hints.py writes it). */
    hintSource: z.string().optional(),
    /**
     * The rater codes the facilitator handed out (upper case). When present, no other code is
     * accepted, so only the session's raters enter the figures. The demo set has none.
     */
    raters: z.array(z.string().regex(/^[A-Z0-9-]{2,20}$/)).optional(),
    items: z.array(CalibrationItemSchema).min(1),
  })
  .superRefine((set, ctx) => {
    const ids = set.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "item ids repeat" });
  });

export type CalibrationSet = z.infer<typeof CalibrationSetSchema>;

/** A rater's code as given by the facilitator; case does not matter ("q7" is "Q7"). */
export const RaterCode = z
  .string()
  .regex(/^[A-Za-z0-9-]{2,20}$/)
  .transform((code) => code.toUpperCase());

export const RatingSchema = z.object({
  itemId: z.string(),
  pcId: z.string(),
  level: z.number().int().min(0).max(3),
  /** Seconds the item was open before its last level was set (the protocol's time per item). */
  seconds: z.number().min(0).max(36_000),
});

export const SubmissionSchema = z.object({
  /** A pseudonymous code, never a name: the protocol publishes codes and background only. */
  rater: RaterCode,
  background: z.enum(["qualified", "volunteer"]),
  condition: z.enum(CONDITIONS),
  consent: z.literal(true),
  ratings: z.array(RatingSchema).min(1),
});
export type Submission = z.infer<typeof SubmissionSchema> & {
  id: string;
  setId: string;
  at: string;
};

/** Every (item, PC) pair of a set: the units the protocol asks a level for. */
export function units(set: CalibrationSet): Array<{ itemId: string; pcId: string }> {
  return set.items.flatMap((item) => item.pcs.map((pcId) => ({ itemId: item.id, pcId })));
}

/** Problems with a submission against its set: a missing, repeated or unknown unit. */
export function coverageProblems(
  set: CalibrationSet,
  ratings: Array<{ itemId: string; pcId: string }>,
): string[] {
  const wanted = new Set(units(set).map((u) => `${u.itemId}|${u.pcId}`));
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const r of ratings) {
    const key = `${r.itemId}|${r.pcId}`;
    if (!wanted.has(key)) problems.push(`${key} is not in the set`);
    else if (seen.has(key)) problems.push(`${key} is rated twice`);
    seen.add(key);
  }
  for (const key of wanted) if (!seen.has(key)) problems.push(`${key} has no level`);
  return problems;
}
