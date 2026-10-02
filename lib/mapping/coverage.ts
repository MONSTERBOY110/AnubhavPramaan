import type { QualificationPack } from "@/lib/packs/schema";

// Coverage of a Qualification Pack by the PCs a declaration supports (TRD M2, step 3). Plain code,
// no model: the mapper's links only decide WHICH PCs are covered; how much that counts is fixed
// here and tested against an independent Python implementation (eval/mapping/check_labels.py).
//
// Two figures, always shown together:
// - flat: covered PCs divided by all PCs (the design document's rule);
// - weighted: each PC carries the QP's own weight: its NOS weightage (the "Weightage" column),
//   times its element's share of the NOS marks, split equally among the element's PCs. The
//   weights of a pack sum to 1.

export type NosCoverage = {
  nosId: string;
  title: string;
  weightagePct: number;
  covered: string[];
  total: number;
  /** Share of this NOS's PCs that are covered. */
  pct: number;
  /** Share of this NOS's marks, by element, that is covered. */
  weightedPct: number;
};

export type Coverage = {
  flat: number;
  weighted: number;
  covered: string[];
  perNos: NosCoverage[];
};

/** Each PC's share of the whole QP. */
export function pcWeights(pack: QualificationPack): Map<string, number> {
  const weights = new Map<string, number>();
  for (const nos of pack.nos) {
    const nosMarks = nos.marks.theory + nos.marks.practical + nos.marks.project + nos.marks.viva;
    for (const el of nos.elements) {
      const elMarks = el.marks.theory + el.marks.practical + el.marks.project + el.marks.viva;
      const pcs = nos.pcs.filter((pc) => pc.element === el.id);
      for (const pc of pcs)
        weights.set(pc.id, ((nos.weightagePct / 100) * (elMarks / nosMarks)) / pcs.length);
    }
  }
  return weights;
}

export function coverage(pack: QualificationPack, coveredIds: Iterable<string>): Coverage {
  const all = new Set(pack.nos.flatMap((n) => n.pcs.map((pc) => pc.id)));
  const covered = new Set([...coveredIds].filter((id) => all.has(id)));
  const weights = pcWeights(pack);
  let weighted = 0;
  for (const id of covered) weighted += weights.get(id) ?? 0;
  const perNos = pack.nos.map((nos) => {
    const ids = nos.pcs.map((pc) => pc.id).filter((id) => covered.has(id));
    const nosWeight = nos.pcs.reduce((s, pc) => s + (weights.get(pc.id) ?? 0), 0);
    const nosCovered = ids.reduce((s, id) => s + (weights.get(id) ?? 0), 0);
    return {
      nosId: nos.id,
      title: nos.title,
      weightagePct: nos.weightagePct,
      covered: ids,
      total: nos.pcs.length,
      pct: ids.length / nos.pcs.length,
      weightedPct: nosWeight > 0 ? nosCovered / nosWeight : 0,
    };
  });
  return { flat: covered.size / all.size, weighted, covered: [...covered], perNos };
}
