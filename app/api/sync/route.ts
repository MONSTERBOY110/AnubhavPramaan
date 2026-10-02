import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkSignOffProof, pinLocked } from "@/lib/cert/assessors";
import { SignOffError, ScoreInput, EvidenceInput, buildRecord } from "@/lib/cert/build";
import { verifyRecord } from "@/lib/cert/record";
import { checkIntegrity, rememberSession } from "@/lib/integrity/store";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { getPack } from "@/lib/packs/load";
import { rateLimit } from "@/lib/server/rate-limit";
import { getRecordStore } from "@/lib/store/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Offline outbox sync (TRD M8). Events carry client-made ids; an id seen before is accepted again
// without being applied twice, so a tablet can retry freely. A sign-off event carries the whole
// assessment and an HMAC proof of the assessor's PIN; the server checks the proof, rebuilds the
// record from the raw inputs and stores it, exactly as an online sign-off would.
//
// Guards: a sign-off must name the same candidate in its signed body as in its envelope; one proof
// seals at most one record (a replay, under any event id, gets the first record back); a proof is
// processed by one request at a time; wrong PINs count towards the assessor's lockout; and an
// event that can never succeed is recorded with its error, so the tablet shows it instead of
// retrying for ever.

/** Events per request; the tablet sends at most 100 at a time. */
const MAX_EVENTS = 200;

const Event = z.object({
  id: z.string().min(4).max(80),
  kind: z.enum(["score", "evidence", "sign-off"]),
  declarationId: z.string(),
  createdAt: z.string(),
  payload: z.unknown(),
});
const Body = z.object({ events: z.array(Event).max(MAX_EVENTS) });

const SignOffPayload = z.object({
  request: z.object({
    declarationId: z.string(),
    scores: z.array(ScoreInput).min(1),
    evidence: z.array(EvidenceInput).default([]),
    decision: z.object({
      acceptsRecommendation: z.boolean(),
      final: z.enum(["certify", "partial", "reassess"]).optional(),
      reason: z.string().optional(),
    }),
    assessorId: z.string().max(40),
    signedAt: z.string().max(40),
  }),
  proof: z.string(),
});

type MappingRecord = {
  decision?: {
    qp: string;
    route: string;
    agreesWithSuggestion: boolean;
    reason?: string;
    suggested: { qp: string | null; route: string | null; mode: string };
  };
};

type Outcome = { result: unknown; final: boolean };

// Proofs being processed right now, so two flushes at once cannot both mint a record.
const memo = globalThis as typeof globalThis & { __apProofsInFlight?: Set<string> };
const inFlight: Set<string> = (memo.__apProofsInFlight ??= new Set());

async function signOff(
  e: z.infer<typeof Event>,
  store: ReturnType<typeof getRecordStore>,
  source: string,
): Promise<Outcome> {
  const p = SignOffPayload.safeParse(e.payload);
  if (!p.success) return { result: { error: "invalid_sign_off" }, final: true };
  const { request, proof } = p.data;
  // The HMAC covers request.declarationId, not the envelope: they must name the same candidate.
  if (request.declarationId !== e.declarationId) {
    return { result: { error: "declaration_mismatch" }, final: true };
  }
  const proofKey = createHash("sha256").update(proof).digest("hex");
  const used = await store.get<{ result: unknown }>("signoff-proof", proofKey);
  if (used) return { result: used.result, final: true };
  if (inFlight.has(proofKey)) return { result: { error: "in_progress" }, final: false };
  if (pinLocked(request.assessorId, source))
    return { result: { error: "assessor_locked" }, final: false };

  inFlight.add(proofKey);
  try {
    const assessor = checkSignOffProof(request.assessorId, request, proof, source);
    if (!assessor) return { result: { error: "assessor_not_verified" }, final: true };
    const declaration = await store.get<SelfDeclaration>("declaration", request.declarationId);
    const mapping = await store.get<MappingRecord>("mapping", request.declarationId);
    if (!declaration || !mapping?.decision) return { result: { error: "not_ready" }, final: true };
    const session = {
      declarationId: declaration.id,
      assessorId: assessor.id,
      evidence: request.evidence,
    };
    // The checks run now, at sync, against everything the server holds; the record keeps the
    // assessor's own sign-off time.
    const integrity = await checkIntegrity(store, { ...session, now: new Date() });
    // The record id comes from the proof, so a retry after a lost reply, or the same event
    // reaching a second server instance, rewrites the same record instead of minting another.
    const record = await buildRecord({
      id: `s${proofKey.slice(0, 13)}`,
      pack: getPack(mapping.decision.qp),
      declaration,
      mappingDecision: mapping.decision,
      request: { ...request, pin: "" },
      assessor,
      integrity,
      now: new Date(request.signedAt),
    });
    const check = await verifyRecord(record);
    if (!check.valid) return { result: { error: "chain_mismatch" }, final: true };
    await store.put("certificate", record.id, record);
    const result = { recordId: record.id, url: `/verify/${record.id}` };
    await store.put("signoff-proof", proofKey, { eventId: e.id, result });
    try {
      await rememberSession(store, session);
    } catch {
      // The record is sealed; a failure to update the integrity index must not make the tablet
      // retry (and seal a second record).
    }
    return { result, final: true };
  } catch (err) {
    // A rule the assessment breaks is final; anything else (a store that did not answer) is not:
    // the tablet keeps the event and sends it again.
    if (err instanceof SignOffError) return { result: { error: err.code }, final: true };
    return { result: { error: "sign_off_failed" }, final: false };
  } finally {
    inFlight.delete(proofKey);
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`sync:${ip}`, 30))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const store = getRecordStore();
  const accepted: string[] = [];
  const results: Record<string, unknown> = {};
  for (const e of body.data.events) {
    const seen = await store.get<{ result?: unknown }>("event", e.id);
    if (seen) {
      accepted.push(e.id);
      results[e.id] = seen.result ?? null;
      continue;
    }
    const outcome: Outcome =
      e.kind === "sign-off" ? await signOff(e, store, ip) : { result: null, final: true };
    results[e.id] = outcome.result;
    if (!outcome.final) continue; // transient: the tablet keeps the event and sends it again
    await store.put("event", e.id, {
      ...e,
      receivedAt: new Date().toISOString(),
      result: outcome.result,
    });
    accepted.push(e.id);
  }
  return NextResponse.json({ accepted, results }, { headers: { "Cache-Control": "no-store" } });
}
