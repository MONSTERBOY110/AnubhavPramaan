import { NextResponse } from "next/server";
import { z } from "zod";
import { VoiceUnavailable } from "@/lib/voice/bhashini";
import { speak } from "@/lib/voice/tts";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().min(1).max(1500), language: z.string().default("hi") });

/**
 * Text to speech: Bhashini when configured, else the labelled ElevenLabs stand-in (cached on disk).
 * With neither, 503 "no_key", and the page reads the text with the device's own voice, labelled
 * as such. It never pretends.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`tts:${ip}`, 30))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    return NextResponse.json(await speak(body.data.text, body.data.language), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof VoiceUnavailable) {
      return NextResponse.json({ error: err.reason, message: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "tts_failed" }, { status: 502 });
  }
}
