import "server-only";
import { VoiceUnavailable } from "./bhashini";

// Automatic fallback recogniser for development audio when the ElevenLabs stand-in fails: Groq's
// OpenAI-compatible Whisper endpoint (docs: console.groq.com/docs/speech-to-text).
//   POST /openai/v1/audio/transcriptions  multipart: file, model, language, response_format
// Key: GROQ_API_KEY. Groq serves this project for this speech fallback only, never for text (lead
// decision, 2 Oct 2026 11:10). Labelled as a fallback on every transcript.

export const GROQ_BASE = "https://api.groq.com/openai/v1";
export const WHISPER_MODEL = "whisper-large-v3";
export const WHISPER_LABEL = "Fallback ASR: Groq Whisper large-v3 (Bhashini key pending)";

export type WhisperDeps = { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string };

/** The Groq key for the Whisper fallback; empty when GROQ_API_KEY is not set. */
export function groqKey(env: Record<string, string | undefined> = process.env): string {
  return env.GROQ_API_KEY?.trim() ?? "";
}

export async function transcribeWithGroqWhisper(
  wav: Uint8Array,
  opts: { language?: string },
  deps: WhisperDeps,
): Promise<{ text: string }> {
  if (!deps.apiKey)
    throw new VoiceUnavailable("no_key", "No Groq key is configured on the server.");
  const form = new FormData();
  form.append("file", new Blob([wav as unknown as BlobPart], { type: "audio/wav" }), "answer.wav");
  form.append("model", WHISPER_MODEL);
  form.append("response_format", "json");
  if (opts.language) form.append("language", opts.language);
  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(`${deps.baseUrl ?? GROQ_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${deps.apiKey}` },
      body: form,
    });
  } catch (err) {
    throw new VoiceUnavailable(
      "network",
      `Groq could not be reached (${err instanceof Error ? err.name : "Error"}).`,
    );
  }
  if (!res.ok) throw new VoiceUnavailable("upstream", `Groq Whisper answered HTTP ${res.status}.`);
  const json = (await res.json().catch(() => null)) as { text?: unknown } | null;
  if (typeof json?.text !== "string")
    throw new VoiceUnavailable("upstream", "Groq Whisper returned no transcript.");
  return { text: json.text.trim() };
}
