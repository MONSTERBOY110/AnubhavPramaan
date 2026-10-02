import { NextResponse } from "next/server";
import { z } from "zod";
import { evidenceHint } from "@/lib/hints/evidence";
import { allPcs } from "@/lib/packs/schema";
import { getPack } from "@/lib/packs/load";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  qp: z.string(),
  pcId: z.string(),
  image: z.string().min(100).max(8_000_000),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

/** Evidence hint for one photo and one PC: per observable visible / not visible / cannot tell. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`hint:${ip}`, 30))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const pc = allPcs(getPack(body.data.qp)).find((p) => p.id === body.data.pcId);
  if (!pc?.observables?.length)
    return NextResponse.json({ error: "no_observables" }, { status: 400 });
  const out = await evidenceHint({
    imageBase64: body.data.image,
    mime: body.data.mime,
    pcText: pc.text,
    observables: pc.observables,
  });
  if (!out.ok)
    return NextResponse.json(
      { error: out.reason, message: out.message },
      { status: out.reason === "no_key" ? 503 : 502 },
    );
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
