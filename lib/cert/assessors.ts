import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "./canonical";
import registry from "@/data/assessors.json";

// Assessor sign-off with an assessor id and PIN (TRD M5: sign-off is refused without both). The
// registry stores a salted SHA-256 of each PIN, never the PIN. The prototype ships one DEMO
// assessor, marked as such on every record it signs; a real deployment loads the agency's register.

type Assessor = {
  id: string;
  name: string;
  agency: string;
  salt: string;
  pinSha256: string;
  demo: boolean;
};

const ASSESSORS = registry as Assessor[];

// PIN guessing. A 4 to 8 digit PIN is weak, so after MAX_PIN_FAILURES wrong attempts for one
// registered assessor from one source address within LOCK_MS, every attempt for that assessor from
// that address is refused, right or wrong, until the window passes. Counting per address means a
// stranger can only lock themselves out, never the assessor at the camp (the demo PIN is public,
// so a shared lock would let anyone stop a live demo). Online sign-off and offline sync share the
// count. Only registered ids are counted, so the map stays small: an unknown id can never sign.
// Kept in server memory (per instance on a serverless host), anchored on globalThis because each
// route is its own module graph.
export const MAX_PIN_FAILURES = 5;
export const LOCK_MS = 15 * 60_000;
const memo = globalThis as typeof globalThis & { __apPinFailures?: Map<string, number[]> };
const failures: Map<string, number[]> = (memo.__apPinFailures ??= new Map());

function lockKey(id: string, source: string): string | null {
  const a = ASSESSORS.find((x) => x.id === id.trim());
  return a ? `${a.id}|${source.slice(0, 64)}` : null;
}

function recent(key: string, now: number): number[] {
  const kept = (failures.get(key) ?? []).filter((t) => now - t < LOCK_MS);
  if (kept.length) failures.set(key, kept);
  else failures.delete(key);
  return kept;
}

/** True while this assessor is locked for this source address after too many wrong PINs. */
export function pinLocked(id: string, source = "local", now: number = Date.now()): boolean {
  const key = lockKey(id, source);
  return key !== null && recent(key, now).length >= MAX_PIN_FAILURES;
}

function noteFailure(id: string, source: string, now: number): void {
  const key = lockKey(id, source);
  if (key) failures.set(key, [...recent(key, now), now]);
}

/** Tests only: forget every recorded failure. */
export function resetPinFailures(): void {
  failures.clear();
}

export function pinHash(salt: string, pin: string): string {
  return createHash("sha256").update(`${salt}:${pin}`, "utf8").digest("hex");
}

/** The assessor, if the id exists and the PIN matches; null otherwise (no hint about which failed). */
export function checkAssessor(
  id: string,
  pin: string,
  source = "local",
  now: number = Date.now(),
): Omit<Assessor, "salt" | "pinSha256"> | null {
  if (pinLocked(id, source, now)) return null;
  const a = ASSESSORS.find((x) => x.id === id.trim());
  const ok = (() => {
    if (!a || !/^\d{4,8}$/.test(pin)) return false;
    const given = Buffer.from(pinHash(a.salt, pin), "hex");
    const stored = Buffer.from(a.pinSha256, "hex");
    return given.length === stored.length && timingSafeEqual(given, stored);
  })();
  if (!ok || !a) {
    noteFailure(id, source, now);
    return null;
  }
  return { id: a.id, name: a.name, agency: a.agency, demo: a.demo };
}

/** Public part of a register entry, for a tablet to cache before going offline. */
export function assessorPublic(
  id: string,
): { id: string; name: string; agency: string; salt: string; demo: boolean } | null {
  const a = ASSESSORS.find((x) => x.id === id.trim());
  return a ? { id: a.id, name: a.name, agency: a.agency, salt: a.salt, demo: a.demo } : null;
}

/**
 * Check an offline sign-off proof: HMAC-SHA256 of the canonical payload keyed by the stored
 * sha256(salt:PIN) (lib/offline/signoff.ts computes the same on the tablet).
 */
export function checkSignOffProof(
  id: string,
  payload: unknown,
  proof: string,
  source = "local",
  now: number = Date.now(),
): Omit<Assessor, "salt" | "pinSha256"> | null {
  if (pinLocked(id, source, now)) return null;
  const a = ASSESSORS.find((x) => x.id === id.trim());
  const ok = (() => {
    if (!a || !/^[0-9a-f]{64}$/.test(proof)) return false;
    const expected = createHmac("sha256", Buffer.from(a.pinSha256, "hex"))
      .update(canonicalJson(payload), "utf8")
      .digest();
    const given = Buffer.from(proof, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  })();
  if (!ok || !a) {
    noteFailure(id, source, now);
    return null;
  }
  return { id: a.id, name: a.name, agency: a.agency, demo: a.demo };
}
