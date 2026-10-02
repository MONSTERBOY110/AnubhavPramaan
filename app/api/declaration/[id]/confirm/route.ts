import { NextResponse } from "next/server";
import { z } from "zod";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { getRecordStore } from "@/lib/store/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ readBack: z.string().min(1).max(4000), confirmed: z.literal(true) });

/** The worker heard the read-back and said it is right. Recorded with the words they heard. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_confirmation" }, { status: 400 });
  const store = getRecordStore();
  const declaration = await store.get<SelfDeclaration>("declaration", id);
  if (!declaration) return NextResponse.json({ error: "not_found" }, { status: 404 });
  declaration.readBack = body.data.readBack;
  declaration.confirmedAt = new Date().toISOString();
  await store.put("declaration", id, declaration);
  return NextResponse.json(declaration);
}
