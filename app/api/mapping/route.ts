import { NextResponse } from "next/server";
import { z } from "zod";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { mapDeclaration } from "@/lib/mapping/map";
import { llmEndpoints } from "@/lib/analyzer/config";
import { candidatePacks } from "@/lib/packs/load";
import { rateLimit } from "@/lib/server/rate-limit";
import { getRecordStore } from "@/lib/store/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two link calls in a row, and a long declaration's reply can take about two minutes on its own.
export const maxDuration = 300;

const Body = z.object({
  declarationId: z.string().min(4),
  mode: z.enum(["llm", "keyword"]).optional(),
});

/**
 * Map a declaration to every candidate QP and store the result as a suggestion. Uses the LLM when
 * one is configured and falls back to the keyword baseline otherwise; the result names its mode.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`mapping:${ip}`, 10))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const store = getRecordStore();
  const declaration = await store.get<SelfDeclaration>("declaration", body.data.declarationId);
  if (!declaration) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const mode = body.data.mode ?? (llmEndpoints("link").length > 0 ? "llm" : "keyword");
  const result = await mapDeclaration(
    {
      answers: declaration.answers.map((a) => ({ topic: a.topic, q: a.q, text: a.text })),
      claims: declaration.claims.length ? declaration.claims : undefined,
    },
    candidatePacks(),
    { mode },
  );
  const record = { declarationId: declaration.id, createdAt: new Date().toISOString(), result };
  await store.put("mapping", declaration.id, record);
  return NextResponse.json(record, { headers: { "Cache-Control": "no-store" } });
}
