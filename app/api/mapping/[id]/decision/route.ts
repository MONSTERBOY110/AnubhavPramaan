import { NextResponse } from "next/server";
import { z } from "zod";
import type { MappingResult } from "@/lib/mapping/map";
import { getRecordStore } from "@/lib/store/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  qp: z.string().regex(/^[A-Z]+\/Q\d{4}$/),
  route: z.enum(["direct-assessment", "upskill-first"]),
  assessorId: z.string().trim().min(3).max(40),
  reason: z.string().trim().max(1000).optional(),
});

type MappingRecord = {
  declarationId: string;
  createdAt: string;
  result: MappingResult;
  decision?: unknown;
};

/**
 * The assessor's decision on the suggested QP and route. Agreeing needs only an assessor id;
 * changing either needs a reason of at least 10 characters. Both the suggestion and the decision
 * stay in the record, so the AI ledger shows what the tool said and what the person decided.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "invalid_decision", message: "An assessor id is required." },
      { status: 400 },
    );
  const store = getRecordStore();
  const record = await store.get<MappingRecord>("mapping", id);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const suggestion = record.result;
  const agrees =
    body.data.qp === suggestion.best && body.data.route === suggestion.route?.suggestion;
  if (!agrees && (body.data.reason ?? "").length < 10) {
    return NextResponse.json(
      {
        error: "reason_required",
        message: "Changing the suggestion needs a reason of at least 10 characters.",
      },
      { status: 400 },
    );
  }
  const decision = {
    qp: body.data.qp,
    route: body.data.route,
    agreesWithSuggestion: agrees,
    reason: agrees ? undefined : body.data.reason,
    assessorId: body.data.assessorId,
    at: new Date().toISOString(),
    suggested: {
      qp: suggestion.best,
      route: suggestion.route?.suggestion ?? null,
      mode: suggestion.mode,
    },
  };
  await store.put("mapping", id, { ...record, decision });
  return NextResponse.json(decision);
}
