import { z } from "zod";
import raw from "@/data/evidence/references.json";

// Reference photos on the assessor's checklist (PRD R8): openly licensed photos that show what an
// activity looks like, listed with their licence in public/evidence/ATTRIBUTION.md. They illustrate
// the criterion; they are not graded examples, and no reference photo is ever a calibration item.

const ReferenceSchema = z.object({
  image: z.string().startsWith("/evidence/"),
  credit: z.string().min(10),
  pcs: z.array(z.string()).min(1),
});
export type ReferencePhoto = { image: string; credit: string };

const REFERENCES = z.array(ReferenceSchema).parse(raw);

/** Reference photos per PC id. */
export function referencesByPc(): Record<string, ReferencePhoto[]> {
  const out: Record<string, ReferencePhoto[]> = {};
  for (const r of REFERENCES)
    for (const pc of r.pcs) (out[pc] ??= []).push({ image: r.image, credit: r.credit });
  return out;
}

export function allReferences(): Array<z.infer<typeof ReferenceSchema>> {
  return REFERENCES;
}
