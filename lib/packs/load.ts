import electrician from "@/packs/qp/CON-Q0602-v4.0.json";
import mason from "@/packs/qp/CON-Q0103-v1.0.json";
import { QualificationPackSchema, type QualificationPack } from "./schema";

// The pack library. Packs are bundled JSON, validated once on first use, so a malformed pack fails
// loudly at start-up instead of producing a quiet wrong mapping. The service worker precaches the
// same files for offline assessment.

const RAW: unknown[] = [electrician, mason];

let cache: QualificationPack[] | null = null;

export function loadPacks(): QualificationPack[] {
  cache ??= RAW.map((raw) => QualificationPackSchema.parse(raw));
  return cache;
}

export function getPack(id: string): QualificationPack {
  const pack = loadPacks().find((p) => p.id === id);
  if (!pack) throw new Error(`unknown Qualification Pack ${id}`);
  return pack;
}

/** Packs a mapper may suggest: every loaded pack, deactivated ones included but flagged. */
export function candidatePacks(): QualificationPack[] {
  return loadPacks();
}
