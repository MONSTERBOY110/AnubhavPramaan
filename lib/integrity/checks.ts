import { z } from "zod";
import { hamming } from "@/lib/evidence/dhash";

// Integrity checks at sign-off (TRD M5, PRD R15). Plain code, no model. They flag a record for
// review and are printed on it; they never block a sign-off or change a decision, because a flag
// can have an innocent cause (a shared camp photo, a wrong clock) that only a person can judge.
//
// - Reused evidence: the same file (equal SHA-256) or a near copy (dHash at most 6 bits apart)
//   already stored for a different candidate. The CAG audit of PMKVY found reused photos [S14].
// - Impossible travel: the assessor's previous session and this one imply more than 120 km/h.
//   CAG found 80 such cases for inspectors [S14].

/** dHash distance at or below which two photos count as the same picture (TRD M5). */
export const REUSE_MAX_DISTANCE = 6;
/** Speed above which two sessions of one assessor cannot both be genuine (TRD M5). */
export const MAX_KMH = 120;
/**
 * Places are rounded to about 1 km on the tablet, so two sessions at one camp can sit up to about
 * 1.6 km apart after rounding. Below this distance travel is never flagged.
 */
export const MIN_TRAVEL_KM = 5;

// A flag names the matching photo by its hash only: the record is public through its QR code, so it
// never names the other candidate. The agency finds the other record from the hash.
export const FlagSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("same-file"), pcId: z.string(), sha256: z.string() }),
  z.object({
    kind: z.literal("possible-reused-photo"),
    pcId: z.string(),
    otherSha256: z.string(),
    distance: z.number().int(),
  }),
  z.object({
    kind: z.literal("impossible-travel"),
    from: z.string(),
    to: z.string(),
    km: z.number(),
    kmh: z.number(),
  }),
]);
export type IntegrityFlag = z.infer<typeof FlagSchema>;

export const IntegritySchema = z.object({
  checkedAt: z.string(),
  /** Stored photos of other candidates this record's photos were compared with. */
  evidenceCompared: z.number().int(),
  travel: z.enum(["checked", "no-place", "first-session"]),
  flags: z.array(FlagSchema),
});
export type IntegrityReport = z.infer<typeof IntegritySchema>;

/** One stored evidence item, as kept in the index: hashes and time only, never the photo. */
export type EvidenceRef = {
  declarationId: string;
  pcId: string;
  sha256: string;
  dhash?: string;
  capturedAt: string;
};
export type SessionPoint = { at: string; lat: number; lon: number };

/** Photos of this record that match a stored photo of a different candidate. */
export function reusedEvidence(current: EvidenceRef[], stored: EvidenceRef[]): IntegrityFlag[] {
  const flags: IntegrityFlag[] = [];
  for (const item of current) {
    for (const other of stored) {
      if (other.declarationId === item.declarationId) continue;
      if (other.sha256 === item.sha256) {
        flags.push({ kind: "same-file", pcId: item.pcId, sha256: item.sha256 });
        break;
      }
      if (item.dhash && other.dhash) {
        const distance = hamming(item.dhash, other.dhash);
        if (distance <= REUSE_MAX_DISTANCE) {
          flags.push({
            kind: "possible-reused-photo",
            pcId: item.pcId,
            otherSha256: other.sha256,
            distance,
          });
          break;
        }
      }
    }
  }
  return flags;
}

/** Great-circle distance in km (haversine, mean Earth radius 6371 km). */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A flag when going from the previous session to this one needs more than MAX_KMH. */
export function impossibleTravel(
  previous: SessionPoint,
  current: SessionPoint,
): IntegrityFlag | null {
  const km = haversineKm(previous, current);
  if (km < MIN_TRAVEL_KM) return null;
  const hours = Math.abs(Date.parse(current.at) - Date.parse(previous.at)) / 3_600_000;
  const kmh = hours > 0 ? km / hours : Infinity;
  if (kmh <= MAX_KMH) return null;
  return {
    kind: "impossible-travel",
    from: previous.at,
    to: current.at,
    km: Math.round(km),
    kmh: Number.isFinite(kmh) ? Math.round(kmh) : -1,
  };
}

/** The first and last place of a session, from its evidence items that carry a place. */
export function sessionPoints(
  evidence: Array<{ capturedAt: string; lat?: number; lon?: number }>,
): { first: SessionPoint; last: SessionPoint } | null {
  const placed = evidence
    .filter(
      (e): e is { capturedAt: string; lat: number; lon: number } =>
        typeof e.lat === "number" && typeof e.lon === "number",
    )
    .map((e) => ({ at: e.capturedAt, lat: e.lat, lon: e.lon }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (placed.length === 0) return null;
  return { first: placed[0]!, last: placed[placed.length - 1]! };
}

/** One session of an assessor, as the integrity store keeps it: first and last place and time. */
export type SessionSpan = { declarationId: string; first: SessionPoint; last: SessionPoint };

/** Everything the record needs, from this session and what the store already holds. */
export function integrityReport(input: {
  declarationId: string;
  current: EvidenceRef[];
  stored: EvidenceRef[];
  places: Array<{ capturedAt: string; lat?: number; lon?: number }>;
  /**
   * The assessor's recent sessions on record. Every session of another candidate is compared, in
   * whatever order they synced; a re-sign of this candidate never hides an earlier flag.
   */
  previousSessions: SessionSpan[];
  now: Date;
}): IntegrityReport {
  const flags = reusedEvidence(input.current, input.stored);
  const points = sessionPoints(input.places);
  const others = input.previousSessions.filter((s) => s.declarationId !== input.declarationId);
  let travel: IntegrityReport["travel"] = "no-place";
  if (points) {
    travel = others.length ? "checked" : "first-session";
    // The nearer ends of two sessions: the other's end against this start, and this end against
    // the other's start (impossibleTravel takes the time between them either way round).
    const flag = others
      .flatMap((o) => [
        impossibleTravel(o.last, points.first),
        impossibleTravel(points.last, o.first),
      ])
      .find((f): f is IntegrityFlag => f !== null);
    if (flag) flags.push(flag);
  }
  const compared = new Set(
    input.stored.filter((s) => s.declarationId !== input.declarationId).map((s) => s.sha256),
  );
  return { checkedAt: input.now.toISOString(), evidenceCompared: compared.size, travel, flags };
}
