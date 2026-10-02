import type { QualificationPack } from "./schema";

// The part of a pack the assessor's tablet needs, without synonyms or review notes: the screens
// receive this instead of the full pack JSON.

export function litePack(pack: QualificationPack) {
  return {
    id: pack.id,
    version: pack.version,
    title: pack.title,
    nsqfLevel: pack.nsqfLevel,
    passPct: pack.passRule?.qpPassPct ?? 70,
    nos: pack.nos.map((n) => ({
      id: n.id,
      title: n.title,
      weightagePct: n.weightagePct,
      elements: n.elements.map((e) => ({ id: e.id, practical: e.marks.practical })),
      pcs: n.pcs.map((pc) => ({
        id: pc.id,
        code: pc.code,
        element: pc.element,
        text: pc.text,
        type: pc.type,
        anchors: pc.anchors,
        observables: pc.observables,
        tolerance: pc.tolerance,
        measurementTask: pc.measurementTask,
      })),
    })),
  };
}
