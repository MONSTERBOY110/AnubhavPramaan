import "server-only";
import { withLock } from "@/lib/server/lock";
import type { RecordStore } from "@/lib/store/records";
import {
  integrityReport,
  sessionPoints,
  type EvidenceRef,
  type IntegrityReport,
  type SessionSpan,
} from "./checks";

// What the integrity checks remember between sign-offs: an index of evidence hashes (SHA-256,
// dHash, PC, time; never the photo) and each assessor's recent sessions (first and last place and
// time). Both live in the record store, so they expire with it.

const KIND = "integrity";
const INDEX_ID = "evidence-index";
/** The index keeps the newest items only; a production store would query a table instead. */
export const INDEX_LIMIT = 5000;
/** Sessions kept per assessor for the travel check. */
export const SESSION_HISTORY = 50;

const sessionsId = (assessorId: string) => `sessions-${assessorId}`;

export type SessionEvidence = {
  pcId: string;
  sha256: string;
  dhash?: string;
  capturedAt: string;
  lat?: number;
  lon?: number;
};

export async function checkIntegrity(
  store: RecordStore,
  input: { declarationId: string; assessorId: string; evidence: SessionEvidence[]; now: Date },
): Promise<IntegrityReport> {
  const stored = (await store.get<EvidenceRef[]>(KIND, INDEX_ID)) ?? [];
  const sessions = (await store.get<SessionSpan[]>(KIND, sessionsId(input.assessorId))) ?? [];
  return integrityReport({
    declarationId: input.declarationId,
    current: input.evidence.map((e) => ({
      declarationId: input.declarationId,
      pcId: e.pcId,
      sha256: e.sha256,
      dhash: e.dhash,
      capturedAt: e.capturedAt,
    })),
    stored,
    places: input.evidence,
    previousSessions: sessions,
    now: input.now,
  });
}

/** After the record is stored: add its evidence to the index and its session to the history. */
export async function rememberSession(
  store: RecordStore,
  input: { declarationId: string; assessorId: string; evidence: SessionEvidence[] },
): Promise<void> {
  await withLock(`${KIND}:${INDEX_ID}`, () => rememberUnlocked(store, input));
}

async function rememberUnlocked(
  store: RecordStore,
  input: { declarationId: string; assessorId: string; evidence: SessionEvidence[] },
): Promise<void> {
  const stored = (await store.get<EvidenceRef[]>(KIND, INDEX_ID)) ?? [];
  const fresh = input.evidence.map((e) => ({
    declarationId: input.declarationId,
    pcId: e.pcId,
    sha256: e.sha256,
    dhash: e.dhash,
    capturedAt: e.capturedAt,
  }));
  const kept = stored.filter((s) => s.declarationId !== input.declarationId);
  await store.put(KIND, INDEX_ID, [...kept, ...fresh].slice(-INDEX_LIMIT));
  const points = sessionPoints(input.evidence);
  if (points) {
    const sessions = (await store.get<SessionSpan[]>(KIND, sessionsId(input.assessorId))) ?? [];
    const others = sessions.filter((s) => s.declarationId !== input.declarationId);
    const span: SessionSpan = { declarationId: input.declarationId, ...points };
    await store.put(KIND, sessionsId(input.assessorId), [...others, span].slice(-SESSION_HISTORY));
  }
}
