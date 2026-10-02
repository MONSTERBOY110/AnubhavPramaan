import demo from "@/data/calibration/demo-set.json";
import { getPack } from "@/lib/packs/load";
import { allPcs } from "@/lib/packs/schema";
import { CalibrationSetSchema, type CalibrationSet } from "./schema";

// Calibration sets are bundled JSON, like the packs, validated once on first use. Every photo must
// be listed with its licence in public/evidence/ATTRIBUTION.md, and every PC must be a judgement PC
// of the set's pack: measurement PCs are scored by rule, so the protocol leaves them out.

const RAW: unknown[] = [demo];

let cache: CalibrationSet[] | null = null;

export function validateSet(raw: unknown): CalibrationSet {
  const set = CalibrationSetSchema.parse(raw);
  const pcs = new Map(allPcs(getPack(set.qp)).map((pc) => [pc.id, pc]));
  for (const item of set.items) {
    for (const id of item.pcs) {
      const pc = pcs.get(id);
      if (!pc) throw new Error(`${set.id} ${item.id}: ${id} is not in ${set.qp}`);
      if (pc.type !== "judgement")
        throw new Error(`${set.id} ${item.id}: ${id} is a measurement PC`);
      const hints = item.hints?.[id];
      if (hints && hints.length !== (pc.observables?.length ?? 0)) {
        throw new Error(
          `${set.id} ${item.id}: ${id} has ${hints.length} hints for ${pc.observables?.length ?? 0} observables`,
        );
      }
    }
  }
  return set;
}

export function calibrationSets(): CalibrationSet[] {
  cache ??= RAW.map(validateSet);
  return cache;
}

export function calibrationSet(id: string): CalibrationSet | null {
  return calibrationSets().find((s) => s.id === id) ?? null;
}
