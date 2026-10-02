import "server-only";
import { z } from "zod";
import { deviationCheck, deviationSatisfied } from "@/lib/assess/deviation";
import { profile } from "@/lib/assess/grade";
import {
  marksForLevel,
  nosScores,
  pcPracticalMarks,
  scoreMeasurement,
  type Level,
  type PcScore,
} from "@/lib/assess/scoring";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import type { QualificationPack } from "@/lib/packs/schema";
import type { IntegrityReport } from "@/lib/integrity/checks";
import { canonicalJson, sha256Hex } from "./canonical";
import { redactIdentifiers } from "./redact";
import {
  BOUNDARY,
  chainHead,
  eventDigest,
  recordHash,
  type CertRecord,
  type ChainEvent,
} from "./record";

// Builds the certification record on the server from the assessor's raw inputs (levels, readings,
// reasons, evidence hashes). Marks, the profile, the band and the recommendation are recomputed
// here, never taken from the client, so a tampered tablet cannot inflate a result.

export const ScoreInput = z.object({
  pcId: z.string(),
  level: z.number().int().min(0).max(3).optional(),
  reading: z.number().optional(),
  reason: z.string().max(500).optional(),
  hint: z.array(z.enum(["visible", "not_visible", "cannot_tell"])).optional(),
});
export const EvidenceInput = z.object({
  pcId: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  capturedAt: z.string(),
  deviceId: z.string().max(80),
  /** 64-bit difference hash made on the tablet, for the reused-photo check. */
  dhash: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .optional(),
  /** Place of the session, rounded on the tablet to 2 decimals (about 1 km). */
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
});
export const SignInput = z.object({
  declarationId: z.string(),
  scores: z.array(ScoreInput).min(1),
  evidence: z.array(EvidenceInput).default([]),
  decision: z.object({
    acceptsRecommendation: z.boolean(),
    final: z.enum(["certify", "partial", "reassess"]).optional(),
    reason: z.string().max(1000).optional(),
  }),
  assessorId: z.string().max(40),
  pin: z.string().max(16),
});
export type SignRequest = z.infer<typeof SignInput>;

export class SignOffError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type MappingDecision = {
  qp: string;
  route: string;
  agreesWithSuggestion: boolean;
  reason?: string;
  suggested: { qp: string | null; route: string | null; mode: string };
};

export async function buildRecord(input: {
  id: string;
  pack: QualificationPack;
  declaration: SelfDeclaration;
  mappingDecision: MappingDecision;
  request: SignRequest;
  assessor: { id: string; agency: string; demo: boolean };
  /** Integrity checks run by the route before the build; printed on the record, never blocking. */
  integrity?: IntegrityReport;
  now?: Date;
}): Promise<CertRecord> {
  const { pack, declaration } = input;
  // Reasons are free text sealed into a public record: phone, Aadhaar and other identifier-length
  // numbers are redacted from them first, as from transcripts.
  const clean = (text?: string) => (text === undefined ? undefined : redactIdentifiers(text));
  const request: SignRequest = {
    ...input.request,
    scores: input.request.scores.map((s) => ({ ...s, reason: clean(s.reason) })),
    decision: { ...input.request.decision, reason: clean(input.request.decision.reason) },
  };
  const mappingDecision: MappingDecision = {
    ...input.mappingDecision,
    reason: clean(input.mappingDecision.reason),
  };
  const rawReason = new Map(input.request.scores.map((s) => [s.pcId, s.reason]));
  // One score per PC: a repeated PC would count its marks twice.
  const once = new Set<string>();
  for (const s of request.scores) {
    if (once.has(s.pcId))
      throw new SignOffError("duplicate_pc", `${s.pcId} is scored more than once`);
    once.add(s.pcId);
  }
  const pcs = new Map(pack.nos.flatMap((n) => n.pcs.map((pc) => [pc.id, { pc, nos: n }] as const)));

  const scored: Array<PcScore & { reason?: string }> = [];
  for (const s of request.scores) {
    const found = pcs.get(s.pcId);
    if (!found) throw new SignOffError("unknown_pc", `${s.pcId} is not in ${pack.id}`);
    const max = pcPracticalMarks(found.nos, found.pc);
    if (found.pc.type === "measurement") {
      if (s.reading === undefined)
        throw new SignOffError("reading_required", `${s.pcId} needs a reading`);
      const m = scoreMeasurement(found.pc.tolerance!, s.reading, max);
      scored.push({
        pcId: s.pcId,
        nosId: found.nos.id,
        type: "measurement",
        max,
        marks: m.marks,
        reading: s.reading,
        reason: s.reason,
      });
    } else {
      if (s.level === undefined)
        throw new SignOffError("level_required", `${s.pcId} needs a level`);
      const level = s.level as Level;
      // Lengths are checked on the reason as the assessor wrote it; only the sealed copy is redacted.
      if (!deviationSatisfied(deviationCheck(level, s.hint), rawReason.get(s.pcId))) {
        throw new SignOffError(
          "reason_required",
          `${s.pcId}: the level contradicts the evidence hint; a reason of at least 10 characters is required`,
        );
      }
      scored.push({
        pcId: s.pcId,
        nosId: found.nos.id,
        type: "judgement",
        max,
        marks: marksForLevel(level, max),
        level,
        reason: s.reason,
      });
    }
  }

  const prof = profile(pack, nosScores(pack, scored));
  const final = request.decision.acceptsRecommendation
    ? prof.recommendation
    : request.decision.final;
  if (!final)
    throw new SignOffError(
      "final_required",
      "Rejecting the recommendation needs the assessor's own recommendation",
    );
  if (
    !request.decision.acceptsRecommendation &&
    (input.request.decision.reason ?? "").trim().length < 10
  ) {
    throw new SignOffError(
      "reason_required",
      "Rejecting the recommendation needs a reason of at least 10 characters",
    );
  }

  const declarationHash = await sha256Hex(
    canonicalJson({
      id: declaration.id,
      answers: declaration.answers.map((a) => [a.topic, a.text]),
      claims: declaration.claims.map((c) => c.quote),
    }),
  );
  const signedAt = (input.now ?? new Date()).toISOString();
  const events: ChainEvent[] = [];
  let n = 0;
  const add = async (kind: ChainEvent["kind"], body: unknown) =>
    events.push({ id: `e${++n}`, kind, digest: await eventDigest(body) });
  await add("mapping-decision", mappingDecision);
  for (const s of scored)
    await add("score", {
      pcId: s.pcId,
      marks: s.marks,
      level: s.level ?? null,
      reading: s.reading ?? null,
      reason: s.reason ?? null,
    });
  for (const e of request.evidence) await add("evidence", e);
  await add("recommendation-decision", {
    suggested: prof.recommendation,
    final,
    reason: request.decision.reason ?? null,
  });
  await add("sign-off", { assessorId: input.assessor.id, signedAt });

  const md = mappingDecision;
  const record: CertRecord = {
    id: input.id,
    version: "1.0",
    pack: { id: pack.id, version: pack.version, title: pack.title, nsqfLevel: pack.nsqfLevel },
    candidateRef: declaration.candidateRef,
    declarationHash,
    mapping: {
      suggestedQp: md.suggested.qp,
      suggestedRoute: md.suggested.route,
      decidedQp: md.qp,
      decidedRoute: md.route,
      agreesWithSuggestion: md.agreesWithSuggestion,
      reason: md.reason,
    },
    scores: scored.map(({ pcId, type, max, marks, level, reading, reason }) => ({
      pcId,
      type,
      max,
      marks,
      level,
      reading,
      reason,
    })),
    evidence: request.evidence,
    profile: {
      perNos: prof.perNos.map((p) => ({
        nosId: p.nosId,
        pct: p.pct,
        pass: p.pass,
        complete: p.complete,
        scored: p.scored,
        total: p.total,
      })),
      totalPct: prof.totalPct,
      band: prof.band,
      passMark: prof.passMark,
      recommendation: prof.recommendation,
    },
    decision: {
      acceptsRecommendation: request.decision.acceptsRecommendation,
      final,
      reason: request.decision.reason,
    },
    aiLedger: [
      {
        step: "qualification",
        suggested: md.suggested.qp ?? "none",
        decided: md.qp,
        by: "assessor",
      },
      { step: "route", suggested: md.suggested.route ?? "none", decided: md.route, by: "assessor" },
      { step: "recommendation", suggested: prof.recommendation, decided: final, by: "assessor" },
      ...request.scores
        .filter((s) => s.hint && s.hint.length > 0)
        .map((s) => ({
          step: `evidence hint ${s.pcId}`,
          suggested: s.hint!.join(", "),
          decided: `level ${s.level ?? "n/a"}${s.reason ? `: ${s.reason}` : ""}`,
          by: "assessor",
        })),
    ],
    assessor: { id: input.assessor.id, agency: input.assessor.agency, signedAt },
    ...(input.integrity ? { integrity: input.integrity } : {}),
    events,
    chain: {
      count: events.length,
      head: await chainHead(
        { packId: pack.id, packVersion: pack.version, declarationHash },
        events,
      ),
    },
    boundary: BOUNDARY,
    demo: input.assessor.demo,
    createdAt: signedAt,
    recordHash: "",
  };
  record.recordHash = await recordHash(record);
  return record;
}
