import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { VoiceUnavailable } from "./bhashini";

// ElevenLabs as the development stand-in while the Bhashini key is pending (provider decision,
// 2 Oct 2026): Scribe v2 for Hindi speech recognition and Flash v2.5 for Hindi speech. Stand-ins
// carry development and role-play audio only, never real worker data, and every transcript or
// clip they produce is labelled as a stand-in.
//
// API (docs: api-reference/speech-to-text/convert and text-to-speech/convert):
//   POST /v1/speech-to-text            multipart: model_id, file, language_code; JSON { text, ... }
//   POST /v1/text-to-speech/{voice_id} JSON { text, model_id, language_code }; ?output_format=...
// Auth header: xi-api-key. The key is restricted (no user_read), so nothing here reads the
// account or the voice: TTS with the configured voice id is the only check that matters.

export const ELEVENLABS_BASE = "https://api.elevenlabs.io";
export const SCRIBE_MODEL = "scribe_v2";
export const FLASH_MODEL = "eleven_flash_v2_5";
export const TTS_FORMAT = "wav_22050";
export const SCRIBE_LABEL = "Stand-in ASR: ElevenLabs Scribe v2 (Bhashini key pending)";
export const FLASH_LABEL = "Stand-in voice: ElevenLabs Flash v2.5 (Bhashini key pending)";

export type ElevenDeps = { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string };

async function call(url: string, init: RequestInit, deps: ElevenDeps): Promise<Response> {
  if (!deps.apiKey)
    throw new VoiceUnavailable("no_key", "No ElevenLabs key is configured on the server.");
  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(url, {
      ...init,
      headers: { ...(init.headers ?? {}), "xi-api-key": deps.apiKey },
    });
  } catch (err) {
    throw new VoiceUnavailable(
      "network",
      `ElevenLabs could not be reached (${err instanceof Error ? err.name : "Error"}).`,
    );
  }
  // The body is not echoed: an error can quote the request.
  if (!res.ok) throw new VoiceUnavailable("upstream", `ElevenLabs answered HTTP ${res.status}.`);
  return res;
}

/** Hindi (or Hinglish) speech in a WAV file to text, with Scribe v2. */
export async function transcribeWithScribe(
  wav: Uint8Array,
  opts: { languageCode?: string },
  deps: ElevenDeps,
): Promise<{ text: string; languageCode?: string }> {
  const form = new FormData();
  form.append("model_id", SCRIBE_MODEL);
  form.append("file", new Blob([wav as unknown as BlobPart], { type: "audio/wav" }), "answer.wav");
  if (opts.languageCode) form.append("language_code", opts.languageCode);
  const res = await call(
    `${deps.baseUrl ?? ELEVENLABS_BASE}/v1/speech-to-text`,
    { method: "POST", body: form },
    deps,
  );
  const json = (await res.json().catch(() => null)) as {
    text?: unknown;
    language_code?: unknown;
  } | null;
  if (typeof json?.text !== "string")
    throw new VoiceUnavailable("upstream", "ElevenLabs returned no transcript.");
  return {
    text: json.text.trim(),
    languageCode: typeof json.language_code === "string" ? json.language_code : undefined,
  };
}

export type FlashOptions = { voiceId: string; languageCode: string };

/** Text to WAV bytes with Flash v2.5. */
export async function synthesiseWithFlash(
  text: string,
  opts: FlashOptions,
  deps: ElevenDeps,
): Promise<Uint8Array> {
  if (!opts.voiceId)
    throw new VoiceUnavailable("no_key", "No ElevenLabs voice id is configured on the server.");
  const url = `${deps.baseUrl ?? ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}?output_format=${TTS_FORMAT}`;
  const res = await call(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "audio/wav" },
      body: JSON.stringify({ text, model_id: FLASH_MODEL, language_code: opts.languageCode }),
    },
    deps,
  );
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 44) throw new VoiceUnavailable("upstream", "ElevenLabs returned no audio.");
  return bytes;
}

/** Cache key for a clip: the same words in the same voice are never paid for twice. */
export function ttsCacheKey(text: string, opts: FlashOptions): string {
  return createHash("sha256")
    .update([FLASH_MODEL, TTS_FORMAT, opts.voiceId, opts.languageCode, text].join("|"), "utf8")
    .digest("hex");
}

/** Flash v2.5 with an on-disk cache (gitignored), so repeated read-backs and demo runs cost nothing. */
export async function cachedFlash(
  text: string,
  opts: FlashOptions,
  deps: ElevenDeps & { cacheDir?: string },
): Promise<{ wav: Uint8Array; cached: boolean }> {
  const dir = deps.cacheDir ?? join(process.cwd(), ".cache", "tts");
  const file = join(dir, `${ttsCacheKey(text, opts)}.wav`);
  try {
    return { wav: new Uint8Array(await readFile(file)), cached: true };
  } catch {
    // not cached yet
  }
  const wav = await synthesiseWithFlash(text, opts, deps);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, wav);
  } catch {
    // A read-only filesystem (serverless) only loses the cache, never the clip.
  }
  return { wav, cached: false };
}
