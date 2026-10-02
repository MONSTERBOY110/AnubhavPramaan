import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { checkAssessor, pinLocked } from "@/lib/cert/assessors";
import { SignInput, SignOffError, buildRecord } from "@/lib/cert/build";
import { verifyRecord } from "@/lib/cert/record";
import { checkIntegrity, rememberSession } from "@/lib/integrity/store";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { getPack } from "@/lib/packs/load";
import { rateLimit } from "@/lib/server/rate-limit";
import { getRecordStore } from "@/lib/store/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MappingRecord = {
  decision?: {
    qp: string;
    route: string;
    agreesWithSuggestion: boolean;
    reason?: string;
    suggested: { qp: string | null; route: string | null; mode: string };
  };
};

/**
 * Sign-off. Refused without a valid assessor id and PIN, and without the assessor's mapping
 * decision. The server recomputes every mark and the profile from the raw inputs, builds the
 * hash-chained record, verifies it, and only then stores it.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`cert:${ip}`, 20))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = SignInput.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "invalid_request", issues: body.error.issues.slice(0, 3) },
      { status: 400 },
    );
  if (pinLocked(body.data.assessorId, ip))
    return NextResponse.json(
      {
        error: "assessor_locked",
        message: "Too many wrong PINs for this assessor. Try again in 15 minutes.",
      },
      { status: 429 },
    );
  const assessor = checkAssessor(body.data.assessorId, body.data.pin, ip);
  if (!assessor)
    return NextResponse.json(
      { error: "assessor_not_verified", message: "Assessor id or PIN not recognised." },
      { status: 401 },
    );
  const store = getRecordStore();
  const declaration = await store.get<SelfDeclaration>("declaration", body.data.declarationId);
  const mapping = await store.get<MappingRecord>("mapping", body.data.declarationId);
  if (!declaration) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!mapping?.decision) {
    return NextResponse.json(
      {
        error: "mapping_not_decided",
        message: "Confirm or change the qualification and route first.",
      },
      { status: 409 },
    );
  }
  try {
    const session = {
      declarationId: declaration.id,
      assessorId: assessor.id,
      evidence: body.data.evidence,
    };
    const integrity = await checkIntegrity(store, { ...session, now: new Date() });
    const record = await buildRecord({
      id: nanoid(14),
      pack: getPack(mapping.decision.qp),
      declaration,
      mappingDecision: mapping.decision,
      request: body.data,
      assessor,
      integrity,
    });
    const check = await verifyRecord(record);
    if (!check.valid)
      return NextResponse.json({ error: "chain_mismatch", ...check }, { status: 422 });
    await store.put("certificate", record.id, record);
    await rememberSession(store, session);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    return NextResponse.json({
      id: record.id,
      recordHash: record.recordHash,
      url: `${base.replace(/\/$/, "")}/verify/${record.id}`,
      durable: store.kind === "upstash",
    });
  } catch (err) {
    if (err instanceof SignOffError)
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    throw err;
  }
}
