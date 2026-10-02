import "server-only";
import { redactIdentifiers } from "@/lib/cert/redact";
import { Bhashini, VoiceUnavailable, bhashiniConfigured, bhashiniSettings } from "./bhashini";
import { SCRIBE_LABEL, transcribeWithScribe } from "./elevenlabs";
import { WHISPER_LABEL, groqKey, transcribeWithGroqWhisper } from "./groq-whisper";
import { decodeWav16, durationOf } from "./wav";

// Which speech recogniser runs, said plainly (provider decision, 2 Oct 2026):
// - Bhashini when its key is configured, and then ONLY Bhashini: real worker audio never goes to a
//   stand-in, even if Bhashini fails;
// - otherwise, for development and role-play audio, ElevenLabs Scribe v2, with Groq Whisper as the
//   automatic fallback when Scribe fails.
// The response names the provider that actually served it. The transcript is redacted (Aadhaar,
// phone and account numbers, PAN) before it leaves this module.

export type AsrProvider = "bhashini" | "elevenlabs-standin" | "groq-whisper-fallback";
export const BHASHINI_LABEL = "Bhashini ASR";

type Env = Record<string, string | undefined>;

export type ActiveAsr = { provider: AsrProvider | null; label: string; chain: AsrProvider[] };

export function asrChain(env: Env = process.env): AsrProvider[] {
  if (bhashiniConfigured(bhashiniSettings(env))) return ["bhashini"];
  const chain: AsrProvider[] = [];
  if (env.ELEVENLABS_API_KEY?.trim()) chain.push("elevenlabs-standin");
  if (groqKey(env)) chain.push("groq-whisper-fallback");
  return chain;
}

const LABELS: Record<AsrProvider, string> = {
  bhashini: BHASHINI_LABEL,
  "elevenlabs-standin": SCRIBE_LABEL,
  "groq-whisper-fallback": WHISPER_LABEL,
};

export function activeAsr(env: Env = process.env): ActiveAsr {
  const chain = asrChain(env);
  const provider = chain[0] ?? null;
  return {
    provider,
    chain,
    label: provider
      ? LABELS[provider]
      : "No speech recogniser configured (Bhashini key pending, no stand-in key). Typed answers still work.",
  };
}

export type AsrOutcome = {
  transcript: string;
  provider: AsrProvider;
  label: string;
  latencyMs: number;
  seconds: number;
  redacted: boolean;
  /** Providers tried before the one that served this transcript, with why they failed. */
  fellBackFrom: Array<{ provider: AsrProvider; reason: string }>;
};

export type AsrDeps = { env?: Env; fetchImpl?: typeof fetch; now?: () => number };

/** 16 kHz mono 16-bit WAV (base64) in, redacted transcript out, with who produced it. */
export async function transcribe(
  wavBase64: string,
  language: string,
  deps: AsrDeps = {},
): Promise<AsrOutcome> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const chain = asrChain(env);
  if (chain.length === 0) throw new VoiceUnavailable("no_key", activeAsr(env).label);

  const bytes = Buffer.from(wavBase64, "base64");
  let seconds = 0;
  try {
    seconds = durationOf(decodeWav16(bytes));
  } catch (err) {
    throw new VoiceUnavailable(
      "bad_audio",
      err instanceof Error ? err.message : "unreadable audio",
    );
  }

  const fellBackFrom: AsrOutcome["fellBackFrom"] = [];
  for (const provider of chain) {
    try {
      const raw = await run(provider, bytes, wavBase64, language, env, deps.fetchImpl);
      const transcript = redactIdentifiers(raw);
      return {
        transcript,
        provider,
        label: LABELS[provider],
        latencyMs: now() - started,
        seconds: Math.round(seconds * 10) / 10,
        redacted: transcript !== raw,
        fellBackFrom,
      };
    } catch (err) {
      if (!(err instanceof VoiceUnavailable) || err.reason === "bad_audio") throw err;
      fellBackFrom.push({ provider, reason: err.message });
    }
  }
  const last = fellBackFrom[fellBackFrom.length - 1];
  throw new VoiceUnavailable(
    "upstream",
    `No recogniser could transcribe this answer (${last?.reason ?? "unknown"}).`,
  );
}

async function run(
  provider: AsrProvider,
  bytes: Buffer,
  wavBase64: string,
  language: string,
  env: Env,
  fetchImpl?: typeof fetch,
): Promise<string> {
  if (provider === "bhashini")
    return new Bhashini(bhashiniSettings(env), fetchImpl).asr(wavBase64, language);
  if (provider === "elevenlabs-standin") {
    const out = await transcribeWithScribe(
      new Uint8Array(bytes),
      { languageCode: language },
      { apiKey: env.ELEVENLABS_API_KEY!.trim(), fetchImpl },
    );
    return out.text;
  }
  const out = await transcribeWithGroqWhisper(
    new Uint8Array(bytes),
    { language },
    { apiKey: groqKey(env), fetchImpl },
  );
  return out.text;
}
