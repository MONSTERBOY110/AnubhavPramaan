import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { decodeWav16, durationOf } from "@/lib/voice/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Development only: saves a role-play recording into docs/internal/recordings/<persona>/ (that
// folder is gitignored and never deployed). Off unless NODE_ENV is not production AND
// AP_DEV_RECORDINGS=1, so a deployed app can never write audio to disk.

const Body = z.object({
  persona: z.string().regex(/^R\d{2}$/),
  index: z.number().int().min(1).max(20),
  topic: z.string().regex(/^[a-z-]+$/),
  audio: z.string().min(100),
});

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" || process.env.AP_DEV_RECORDINGS !== "1") {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const bytes = Buffer.from(body.data.audio, "base64");
  let seconds = 0;
  try {
    seconds = durationOf(decodeWav16(bytes));
  } catch {
    return NextResponse.json({ error: "bad_audio" }, { status: 400 });
  }
  const dir = join(process.cwd(), "docs", "internal", "recordings", body.data.persona);
  await mkdir(dir, { recursive: true });
  const name = `q${body.data.index}-${body.data.topic}.wav`;
  await writeFile(join(dir, name), bytes);
  return NextResponse.json({
    saved: `docs/internal/recordings/${body.data.persona}/${name}`,
    seconds,
  });
}
