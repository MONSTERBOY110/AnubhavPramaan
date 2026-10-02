"use client";

import type { ObservableStatus } from "@/lib/assess/deviation";

// The assessor's working state for one candidate, kept on the device (localStorage) so the
// checklist, the sign-off page and a reload all see the same scores with the network off. Every
// change is also written to the IndexedDB outbox, which is what syncs to the server.

export type PcEntry = {
  level?: 0 | 1 | 2 | 3;
  reading?: number;
  reason?: string;
  hint?: Array<{ observable: string; status: ObservableStatus; reason: string }>;
  /** A hint was asked with the network off; it runs when the tablet is back online. */
  hintQueued?: boolean;
};
export type EvidenceEntry = {
  sha256: string;
  capturedAt: string;
  deviceId: string;
  preview?: string;
  name: string;
  dhash?: string;
  lat?: number;
  lon?: number;
};
/** Place of the session, recorded only when the assessor taps "Record place", rounded to about 1 km. */
export type SessionPlace = { lat: number; lon: number; at: string };
export type AssessState = {
  scores: Record<string, PcEntry>;
  evidence: Record<string, EvidenceEntry[]>;
  place?: SessionPlace;
};

/** The trimmed pack the tablet needs: text, item type, anchors, observables and tolerances. */
export type LitePc = {
  id: string;
  code: string;
  element: string;
  text: string;
  type: "measurement" | "judgement";
  anchors?: [string, string, string, string];
  observables?: string[];
  tolerance?: {
    kind: "band" | "min" | "max";
    target?: number;
    plusMinus?: number;
    min?: number;
    max?: number;
    unit: string;
    source: string;
  };
  measurementTask?: string;
};
export type LiteNos = {
  id: string;
  title: string;
  weightagePct: number;
  elements: Array<{ id: string; practical: number }>;
  pcs: LitePc[];
};
export type LitePack = {
  id: string;
  version: string;
  title: string;
  nsqfLevel: string;
  passPct: number;
  nos: LiteNos[];
};

// Keyed by candidate and qualification: if the assessor changes the qualification on the match
// screen, the checklist starts fresh instead of carrying levels over to other criteria.
const key = (declarationId: string, packId: string) => `ap:assess:${declarationId}:${packId}`;

export function loadState(declarationId: string, packId: string): AssessState {
  try {
    const raw = localStorage.getItem(key(declarationId, packId));
    if (raw) return JSON.parse(raw) as AssessState;
  } catch {
    // storage unavailable: start empty
  }
  return { scores: {}, evidence: {} };
}

export function saveState(declarationId: string, packId: string, state: AssessState): void {
  try {
    // Previews are object URLs, valid only for this page; do not persist them.
    const evidence = Object.fromEntries(
      Object.entries(state.evidence).map(([k, v]) => [
        k,
        v.map((item) => ({ ...item, preview: undefined })),
      ]),
    );
    localStorage.setItem(key(declarationId, packId), JSON.stringify({ ...state, evidence }));
  } catch {
    // storage full or blocked: the outbox still holds every event
  }
}

export function deviceId(): string {
  try {
    const existing = localStorage.getItem("ap:device");
    if (existing) return existing;
    const id = `tablet-${crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)}`;
    localStorage.setItem("ap:device", id);
    return id;
  } catch {
    return "tablet-unknown";
  }
}

/** Practical marks for a PC: its element's practical marks shared equally by the element's PCs. */
export function pcMax(nos: LiteNos, pc: LitePc): number {
  const el = nos.elements.find((e) => e.id === pc.element)!;
  return el.practical / nos.pcs.filter((p) => p.element === pc.element).length;
}

/** Inside the sourced band, by rule (full marks or zero). */
export function withinTolerance(t: NonNullable<LitePc["tolerance"]>, reading: number): boolean {
  if (t.kind === "band") return Math.abs(reading - t.target!) <= t.plusMinus!;
  if (t.kind === "min") return reading >= t.min!;
  return reading <= t.max!;
}

export function toleranceText(t: NonNullable<LitePc["tolerance"]>): string {
  const unit = t.unit === "Mohm" ? "megohm" : t.unit;
  if (t.kind === "band") return `${t.target} ${unit}, plus or minus ${t.plusMinus} ${unit}`;
  if (t.kind === "min") return `at least ${t.min} ${unit}`;
  return `at most ${t.max} ${unit}`;
}
