import "server-only";
import { decodeWav16, encodeWav16, monoOf, splitAtPauses, ASR_RATE } from "./wav";

// Bhashini through the ULCA pipeline, ported from the team's SagarDrishti agent
// (services/agent/app/voice.py). Server only: the key never reaches the browser.
//
// The ULCA flow is two calls. getModelsPipeline returns the inference endpoint, its key and a
// service id for a task and language; the inference call then does the work. The config is cached
// per (task, language) because it does not change within a session.
//
// Errors carry a stable reason code and a sentence a person can read. An upstream error body is
// never echoed, because it can quote the request and the request headers carry the key.

export const CONFIG_URL_DEFAULT =
  "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";
export const PIPELINE_ID_DEFAULT = "64392f96daac500b55c543cd";

/** Languages the key request was filed for. Adding one is a line here plus its font. */
export const BHASHINI_LANGUAGES = { hi: "हिन्दी", en: "English", bn: "বাংলা" } as const;
export type BhashiniLang = keyof typeof BHASHINI_LANGUAGES;

/** Longest audio sent in one ASR call; longer answers are cut at pauses and joined. */
export const ASR_CHUNK_SECONDS = 25;

export type VoiceReason = "no_key" | "language" | "network" | "upstream" | "bad_audio";

export class VoiceUnavailable extends Error {
  constructor(
    readonly reason: VoiceReason,
    message: string,
  ) {
    super(message);
    this.name = "VoiceUnavailable";
  }
}

export type BhashiniSettings = {
  userId: string;
  apiKey: string;
  pipelineId: string;
  configUrl: string;
  timeoutMs: number;
};

export function bhashiniSettings(
  env: Record<string, string | undefined> = process.env,
): BhashiniSettings {
  return {
    userId: env.BHASHINI_USER_ID?.trim() ?? "",
    apiKey: env.BHASHINI_API_KEY?.trim() ?? "",
    pipelineId: env.BHASHINI_PIPELINE_ID?.trim() || PIPELINE_ID_DEFAULT,
    configUrl: env.BHASHINI_CONFIG_URL?.trim() || CONFIG_URL_DEFAULT,
    timeoutMs: Number(env.BHASHINI_TIMEOUT_MS ?? 20000),
  };
}

export function bhashiniConfigured(s: BhashiniSettings): boolean {
  return Boolean(s.userId && s.apiKey);
}

type TaskConfig = { url: string; auth: Record<string, string>; serviceId: string };

export class Bhashini {
  private configs = new Map<string, TaskConfig>();

  constructor(
    private readonly settings: BhashiniSettings = bhashiniSettings(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private ready(lang: string): BhashiniLang {
    if (!bhashiniConfigured(this.settings)) {
      throw new VoiceUnavailable(
        "no_key",
        "No Bhashini key is configured on the server (BHASHINI_USER_ID and BHASHINI_API_KEY).",
      );
    }
    if (!(lang in BHASHINI_LANGUAGES)) {
      throw new VoiceUnavailable(
        "language",
        `'${lang}' is not one of ${Object.keys(BHASHINI_LANGUAGES).join(", ")}.`,
      );
    }
    return lang as BhashiniLang;
  }

  private async post(
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      throw new VoiceUnavailable("network", `Bhashini could not be reached (${name}).`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status !== 200)
      throw new VoiceUnavailable("upstream", `Bhashini answered HTTP ${res.status}.`);
    try {
      return await res.json();
    } catch {
      throw new VoiceUnavailable("upstream", "Bhashini answered with something that is not JSON.");
    }
  }

  private async config(task: string, language: Record<string, string>): Promise<TaskConfig> {
    const key = `${task}|${JSON.stringify(Object.entries(language).sort())}`;
    const cached = this.configs.get(key);
    if (cached) return cached;
    const cfg = (await this.post(
      this.settings.configUrl,
      { userID: this.settings.userId, ulcaApiKey: this.settings.apiKey },
      {
        pipelineTasks: [{ taskType: task, config: { language } }],
        pipelineRequestConfig: { pipelineId: this.settings.pipelineId },
      },
    )) as {
      pipelineInferenceAPIEndPoint?: {
        callbackUrl?: string;
        inferenceApiKey?: { name?: string; value?: string };
      };
      pipelineResponseConfig?: Array<{ config?: Array<{ serviceId?: string }> }>;
    };
    const endpoint = cfg.pipelineInferenceAPIEndPoint;
    const serviceId = cfg.pipelineResponseConfig?.[0]?.config?.[0]?.serviceId;
    const name = endpoint?.inferenceApiKey?.name;
    const value = endpoint?.inferenceApiKey?.value;
    if (!endpoint?.callbackUrl || !serviceId || !name || !value) {
      throw new VoiceUnavailable(
        "upstream",
        `Bhashini has no ${task} service for ${JSON.stringify(language)}.`,
      );
    }
    const out = { url: endpoint.callbackUrl, auth: { [name]: value }, serviceId };
    this.configs.set(key, out);
    return out;
  }

  private async infer(
    task: string,
    language: Record<string, string>,
    extra: Record<string, unknown>,
    inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const cfg = await this.config(task, language);
    const res = (await this.post(cfg.url, cfg.auth, {
      pipelineTasks: [{ taskType: task, config: { language, serviceId: cfg.serviceId, ...extra } }],
      inputData,
    })) as { pipelineResponse?: Array<Record<string, unknown>> };
    const first = res.pipelineResponse?.[0];
    if (!first) throw new VoiceUnavailable("upstream", `Bhashini returned no ${task} result.`);
    return first;
  }

  /** Speech (16 kHz mono 16-bit WAV, base64) to text in the same language. */
  async asr(wavBase64: string, language: string): Promise<string> {
    const lang = this.ready(language);
    let samples: Int16Array;
    let rate: number;
    try {
      const wav = decodeWav16(Buffer.from(wavBase64, "base64"));
      samples = monoOf(wav);
      rate = wav.sampleRate;
    } catch (err) {
      throw new VoiceUnavailable(
        "bad_audio",
        err instanceof Error ? err.message : "unreadable audio",
      );
    }
    if (rate !== ASR_RATE)
      throw new VoiceUnavailable("bad_audio", `audio is ${rate} Hz, expected ${ASR_RATE} Hz`);
    const parts: string[] = [];
    for (const piece of splitAtPauses(samples, rate, ASR_CHUNK_SECONDS)) {
      const out = await this.infer(
        "asr",
        { sourceLanguage: lang },
        { audioFormat: "wav", samplingRate: ASR_RATE },
        { audio: [{ audioContent: Buffer.from(encodeWav16(piece, rate)).toString("base64") }] },
      );
      const text = (out.output as Array<{ source?: unknown }> | undefined)?.[0]?.source;
      if (typeof text !== "string")
        throw new VoiceUnavailable("upstream", "Bhashini returned no transcript.");
      if (text.trim()) parts.push(text.trim());
    }
    return parts.join(" ");
  }

  /** Text between two supported languages. Identity when they are the same. */
  async translate(text: string, source: string, target: string): Promise<string> {
    const src = this.ready(source);
    const tgt = this.ready(target);
    if (src === tgt) return text;
    const out = await this.infer(
      "translation",
      { sourceLanguage: src, targetLanguage: tgt },
      {},
      { input: [{ source: text }] },
    );
    const translated = (out.output as Array<{ target?: unknown }> | undefined)?.[0]?.target;
    if (typeof translated !== "string")
      throw new VoiceUnavailable("upstream", "Bhashini returned no translation.");
    return translated.trim();
  }

  /** Text to speech. Returns base64 WAV as Bhashini sends it. */
  async tts(text: string, language: string, gender: "female" | "male" = "female"): Promise<string> {
    const lang = this.ready(language);
    const out = await this.infer(
      "tts",
      { sourceLanguage: lang },
      { gender, samplingRate: 22050 },
      { input: [{ source: text }] },
    );
    const audio = (out.audio as Array<{ audioContent?: unknown }> | undefined)?.[0]?.audioContent;
    if (typeof audio !== "string" || !audio)
      throw new VoiceUnavailable("upstream", "Bhashini returned no audio.");
    return audio;
  }
}
