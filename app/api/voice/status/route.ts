import { NextResponse } from "next/server";
import { activeAsr } from "@/lib/voice/asr";
import { activeTts } from "@/lib/voice/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which recogniser and which voice are live right now, in words the page shows as they are. */
export async function GET() {
  const asr = activeAsr();
  const tts = activeTts();
  return NextResponse.json({
    asr: { provider: asr.provider, label: asr.label, chain: asr.chain },
    tts: { provider: tts.provider ?? "device", label: tts.label },
  });
}
