import { NextResponse } from "next/server";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { getRecordStore } from "@/lib/store/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const declaration = await getRecordStore().get<SelfDeclaration>("declaration", id);
  if (!declaration) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(declaration, { headers: { "Cache-Control": "no-store" } });
}
