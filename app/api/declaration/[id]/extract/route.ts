import { NextResponse } from "next/server";
import { z } from "zod";
import { extractClaims } from "@/lib/declaration/extract";
import { CONTENT_FILTER_LABEL, CONTENT_FILTER_NOTICE } from "@/lib/declaration/notices";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { rateLimit } from "@/lib/server/rate-limit";
import { getRecordStore } from "@/lib/store/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ answer: z.number().int().nonnegative() });

/**
 * Extract claims from one stored answer. The model proposes; only claims whose quote occurs in the
 * answer are kept. With no model reachable, the rule-based fallback runs and the reply says so.
 * When the AI provider's content filter refuses the answer (a fixed property of the deployment),
 * the transcript stays as it is, the rules find the claims and are labelled as such, the worker is
 * asked to check the words or type a short summary, and the event is logged.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`extract:${ip}`, 40))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const store = getRecordStore();
  const declaration = await store.get<SelfDeclaration>("declaration", id);
  if (!declaration) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const index = body.data.answer;
  const answer = declaration.answers[index];
  if (!answer) return NextResponse.json({ error: "no_such_answer" }, { status: 400 });
  const out = await extractClaims(answer, index);
  const blocked = Boolean(out.contentFilter);
  const label =
    out.source === "llm"
      ? `AI suggestion (${out.model})`
      : blocked
        ? CONTENT_FILTER_LABEL
        : "Rule-based fallback (no model reachable)";
  const at = new Date().toISOString();
  answer.extraction = {
    source: out.source,
    label,
    ...(blocked ? { contentFilter: true } : {}),
    at,
  };
  declaration.claims = [...declaration.claims.filter((c) => c.answer !== index), ...out.claims];
  await store.put("declaration", id, declaration);
  if (blocked) {
    // The audit trail: which answer, what the filter said, and that the rules took over. The
    // filter's category stays in the server log; the worker sees a neutral notice.
    console.warn(
      JSON.stringify({
        event: "extraction.content_filter",
        declaration: id,
        answer: index,
        filter: out.contentFilter,
        fallback: "rules",
        claims: out.claims.length,
        at,
      }),
    );
  }
  return NextResponse.json({
    claims: out.claims,
    rejected: out.rejected,
    source: out.source,
    label,
    extraction: answer.extraction,
    ...(blocked ? { blocked: "content_filter", notice: CONTENT_FILTER_NOTICE } : {}),
  });
}
