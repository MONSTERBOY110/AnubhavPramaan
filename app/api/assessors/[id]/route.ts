import { NextResponse } from "next/server";
import { assessorPublic } from "@/lib/cert/assessors";

export const runtime = "nodejs";

/** The public part of an assessor's register entry (never the PIN hash), cached by the tablet. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = assessorPublic(id);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(a);
}
