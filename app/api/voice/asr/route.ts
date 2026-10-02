import { NextResponse } from "next/server";
import { z } from "zod";
import { transcribe } from "@/lib/voice/asr";
import { VoiceUnavailable } from "@/lib/voice/bhashini";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  audio: z.string().min(100).max(8_000_000),
  language: z.string().default("hi"),
});

/** One recorded answer (16 kHz mono WAV, base64) to a redacted transcript, with the provider named. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`asr:${ip}`, 30))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    const out = await transcribe(body.data.audio, body.data.language);
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof VoiceUnavailable) {
      const status = err.reason === "bad_audio" ? 400 : 503;
      return NextResponse.json({ error: err.reason, message: err.message }, { status });
    }
    console.error("[voice/asr]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "asr_failed" }, { status: 502 });
  }
}
