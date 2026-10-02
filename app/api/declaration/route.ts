import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CONSENT_VERSION } from "@/lib/declaration/consent";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { rateLimit } from "@/lib/server/rate-limit";
import { getRecordStore } from "@/lib/store/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  lang: z.string().default("hi"),
  consent: z.literal(true),
  candidateRef: z.string().max(40).optional(),
});

/** Start a declaration. Refused without an explicit consent flag: nothing is recorded before it. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`decl:${ip}`, 30))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "consent_required" }, { status: 400 });
  const id = nanoid(12);
  const declaration: SelfDeclaration & { consentVersion: string } = {
    id,
    candidateRef: body.data.candidateRef ?? `C-${id.slice(0, 6).toUpperCase()}`,
    lang: body.data.lang,
    consentAt: new Date().toISOString(),
    consentVersion: CONSENT_VERSION,
    answers: [],
    claims: [],
  };
  await getRecordStore().put("declaration", id, declaration);
  return NextResponse.json(declaration);
}
