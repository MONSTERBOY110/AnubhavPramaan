import "server-only";
import { Bhashini, VoiceUnavailable, bhashiniConfigured, bhashiniSettings } from "./bhashini";
import { FLASH_LABEL, cachedFlash } from "./elevenlabs";

// Which voice speaks, said plainly: Bhashini when its key is configured; otherwise, for
// development and role-play only, the ElevenLabs Flash v2.5 stand-in with an on-disk cache;
// otherwise none, and the page falls back to the device's own voice, labelled as such.

export type TtsProvider = "bhashini" | "elevenlabs-standin";
type Env = Record<string, string | undefined>;

export function activeTts(env: Env = process.env): { provider: TtsProvider | null; label: string } {
  if (bhashiniConfigured(bhashiniSettings(env)))
    return { provider: "bhashini", label: "Bhashini TTS" };
  if (env.ELEVENLABS_API_KEY?.trim() && env.ELEVENLABS_VOICE_ID?.trim())
    return { provider: "elevenlabs-standin", label: FLASH_LABEL };
  return { provider: null, label: "Device voice (Bhashini TTS pending)" };
}

export type TtsOutcome = {
  audio: string;
  format: "wav";
  provider: TtsProvider;
  label: string;
  cached: boolean;
};

export async function speak(
  text: string,
  language: string,
  deps: { env?: Env; fetchImpl?: typeof fetch; cacheDir?: string } = {},
): Promise<TtsOutcome> {
  const env = deps.env ?? process.env;
  const active = activeTts(env);
  if (active.provider === "bhashini") {
    const audio = await new Bhashini(bhashiniSettings(env), deps.fetchImpl).tts(text, language);
    return { audio, format: "wav", provider: "bhashini", label: active.label, cached: false };
  }
  if (active.provider === "elevenlabs-standin") {
    const out = await cachedFlash(
      text,
      { voiceId: env.ELEVENLABS_VOICE_ID!.trim(), languageCode: language },
      {
        apiKey: env.ELEVENLABS_API_KEY!.trim(),
        fetchImpl: deps.fetchImpl,
        cacheDir: deps.cacheDir,
      },
    );
    return {
      audio: Buffer.from(out.wav).toString("base64"),
      format: "wav",
      provider: "elevenlabs-standin",
      label: active.label,
      cached: out.cached,
    };
  }
  throw new VoiceUnavailable(
    "no_key",
    "No speech voice is configured on the server; the device voice reads the text instead.",
  );
}
