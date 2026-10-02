import { z } from "zod";
import { IntegritySchema } from "@/lib/integrity/checks";
import { canonicalJson, sha256Hex } from "./canonical";

// The certification record (TRD M6): what a verify page and a QR code point at. It stores scores,
// hashes and decisions, never audio or photos. Two proofs make it tamper-evident, as in Saakshi's
// certificate:
//   1. an event chain: h0 = sha256("anubhavpramaan" | pack id | pack version | declaration hash),
//      h_i = sha256(h_(i-1) | event id | event kind | sha256(canonical event body));
//   2. a record hash: sha256 of the canonical JSON of the whole record with recordHash emptied.
// Anyone can recompute both from the stored record alone.

export const BOUNDARY =
  "The tool suggested the qualification, the route and the recommendation, and showed evidence hints. The assessor observed the work, set every judgement score, decided the route and signed or rejected the recommendation.";

export const EventSchema = z.object({
  id: z.string(),
  kind: z.enum(["score", "evidence", "mapping-decision", "recommendation-decision", "sign-off"]),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ChainEvent = z.infer<typeof EventSchema>;

export const RecordSchema = z.object({
  id: z.string().min(8),
  version: z.literal("1.0"),
  pack: z.object({ id: z.string(), version: z.string(), title: z.string(), nsqfLevel: z.string() }),
  candidateRef: z.string(),
  declarationHash: z.string().regex(/^[0-9a-f]{64}$/),
  mapping: z.object({
    suggestedQp: z.string().nullable(),
    suggestedRoute: z.string().nullable(),
    decidedQp: z.string(),
    decidedRoute: z.string(),
    agreesWithSuggestion: z.boolean(),
    reason: z.string().optional(),
  }),
  scores: z.array(
    z.object({
      pcId: z.string(),
      type: z.enum(["measurement", "judgement"]),
      max: z.number(),
      marks: z.number(),
      level: z.number().int().min(0).max(3).optional(),
      reading: z.number().optional(),
      reason: z.string().optional(),
    }),
  ),
  evidence: z.array(
    z.object({
      pcId: z.string(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      capturedAt: z.string(),
      deviceId: z.string(),
      dhash: z.string().optional(),
      lat: z.number().optional(),
      lon: z.number().optional(),
    }),
  ),
  profile: z.object({
    perNos: z.array(
      z.object({
        nosId: z.string(),
        pct: z.number(),
        pass: z.boolean(),
        complete: z.boolean(),
        scored: z.number().int().optional(),
        total: z.number().int().optional(),
      }),
    ),
    totalPct: z.number(),
    band: z.enum(["A", "B", "C", "NYC"]),
    passMark: z.number(),
    recommendation: z.enum(["certify", "partial", "reassess"]),
  }),
  decision: z.object({
    acceptsRecommendation: z.boolean(),
    final: z.enum(["certify", "partial", "reassess"]),
    reason: z.string().optional(),
  }),
  aiLedger: z.array(
    z.object({ step: z.string(), suggested: z.string(), decided: z.string(), by: z.string() }),
  ),
  assessor: z.object({ id: z.string(), agency: z.string(), signedAt: z.string() }),
  /** Automatic integrity checks at sign-off (reused photos, impossible travel); flags, not verdicts. */
  integrity: IntegritySchema.optional(),
  events: z.array(EventSchema),
  chain: z.object({ count: z.number().int(), head: z.string().regex(/^[0-9a-f]{64}$/) }),
  boundary: z.string(),
  demo: z.boolean(),
  createdAt: z.string(),
  recordHash: z.string(),
});
export type CertRecord = z.infer<typeof RecordSchema>;

export async function eventDigest(body: unknown): Promise<string> {
  return sha256Hex(canonicalJson(body));
}

export async function chainHead(
  seed: { packId: string; packVersion: string; declarationHash: string },
  events: ChainEvent[],
): Promise<string> {
  let h = await sha256Hex(
    `anubhavpramaan|${seed.packId}|${seed.packVersion}|${seed.declarationHash}`,
  );
  for (const e of events) h = await sha256Hex(`${h}|${e.id}|${e.kind}|${e.digest}`);
  return h;
}

export async function recordHash(record: Record<string, unknown>): Promise<string> {
  return sha256Hex(canonicalJson({ ...record, recordHash: "" }));
}

export type VerifyResult = { valid: boolean; chainOk: boolean; hashOk: boolean };

/** Recompute both proofs from the stored record alone. */
export async function verifyRecord(record: CertRecord): Promise<VerifyResult> {
  const head = await chainHead(
    {
      packId: record.pack.id,
      packVersion: record.pack.version,
      declarationHash: record.declarationHash,
    },
    record.events,
  );
  const chainOk = head === record.chain.head && record.events.length === record.chain.count;
  const hashOk = (await recordHash(record)) === record.recordHash;
  return { valid: chainOk && hashOk, chainOk, hashOk };
}
