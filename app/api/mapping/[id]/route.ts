import { NextResponse } from "next/server";
import { getRecordStore } from "@/lib/store/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const record = await getRecordStore().get("mapping", id);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(record, { headers: { "Cache-Control": "no-store" } });
}
