import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { activeAsr, transcribe } from "@/lib/voice/asr";
import { Bhashini, VoiceUnavailable, bhashiniSettings } from "@/lib/voice/bhashini";
import { SCRIBE_LABEL, cachedFlash, transcribeWithScribe } from "@/lib/voice/elevenlabs";
import { WHISPER_LABEL, groqKey, transcribeWithGroqWhisper } from "@/lib/voice/groq-whisper";
import { activeTts } from "@/lib/voice/tts";
import { ASR_RATE, decodeWav16, durationOf, encodeWav16, splitAtPauses } from "@/lib/voice/wav";

// Voice without a network: every upstream is a mocked fetch, so no credits are spent. Request
// shapes follow the SagarDrishti ULCA client (services/agent/app/voice.py), the ElevenLabs API
// reference (speech-to-text/convert, text-to-speech/convert) and Groq's speech-to-text docs.

const tone = (seconds: number, rate = ASR_RATE, amp = 0.3) =>
  Float32Array.from(
    { length: Math.round(seconds * rate) },
    (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / rate),
  );

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("WAV helpers", () => {
  it("round-trips 16 kHz mono 16-bit PCM", () => {
    const wav = decodeWav16(encodeWav16(tone(0.5)));
    expect(wav.sampleRate).toBe(16000);
    expect(wav.channels).toBe(1);
    expect(wav.samples.length).toBe(8000);
    expect(durationOf(wav)).toBeCloseTo(0.5, 5);
  });

  it("refuses something that is not a WAV", () => {
    expect(() => decodeWav16(new Uint8Array(64))).toThrow(/not a WAV/);
  });

  it("cuts long speech at the quietest moment before each limit", () => {
    // 30 s of tone with a silent gap from 20.0 s to 20.5 s: the cut must fall inside the gap.
    const pcm = tone(30);
    pcm.fill(0, 20 * ASR_RATE, 20.5 * ASR_RATE);
    const samples = decodeWav16(encodeWav16(pcm)).samples;
    const pieces = splitAtPauses(samples, ASR_RATE, 25, 6);
    expect(pieces).toHaveLength(2);
    const cut = pieces[0]!.length / ASR_RATE;
    expect(cut).toBeGreaterThanOrEqual(20);
    expect(cut).toBeLessThanOrEqual(20.5);
    expect(pieces[0]!.length + pieces[1]!.length).toBe(samples.length);
  });

  it("keeps short audio in one piece", () => {
    expect(splitAtPauses(new Int16Array(16000 * 10), ASR_RATE, 25)).toHaveLength(1);
  });
});

describe("Bhashini ULCA client", () => {
  const settings = bhashiniSettings({ BHASHINI_USER_ID: "uid", BHASHINI_API_KEY: "ulca-key" });

  function ulca() {
    type UlcaBody = {
      pipelineTasks: Array<{ taskType: string; config: Record<string, unknown> }>;
      pipelineRequestConfig?: { pipelineId: string };
    };
    const calls: Array<{ url: string; headers: Record<string, string>; body: UlcaBody }> = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as UlcaBody;
      calls.push({ url, headers: init.headers as Record<string, string>, body });
      if (url.includes("getModelsPipeline")) {
        return json({
          pipelineInferenceAPIEndPoint: {
            callbackUrl: "https://dhruva.example/infer",
            inferenceApiKey: { name: "Authorization", value: "inference-key" },
          },
          pipelineResponseConfig: [
            { config: [{ serviceId: `svc-${body.pipelineTasks[0]!.taskType}` }] },
          ],
        });
      }
      const task = body.pipelineTasks[0]!.taskType;
      if (task === "asr")
        return json({ pipelineResponse: [{ output: [{ source: "मैं वायरिंग करता हूँ" }] }] });
      if (task === "tts")
        return json({ pipelineResponse: [{ audio: [{ audioContent: "UklGRg==" }] }] });
      return json({ pipelineResponse: [{ output: [{ target: "I do wiring" }] }] });
    });
    return { f: f as unknown as typeof fetch, calls };
  }

  it("discovers the pipeline once, then infers with the returned key and service id", async () => {
    const { f, calls } = ulca();
    const client = new Bhashini(settings, f);
    const audio = b64(encodeWav16(tone(1)));
    expect(await client.asr(audio, "hi")).toBe("मैं वायरिंग करता हूँ");
    expect(await client.asr(audio, "hi")).toBe("मैं वायरिंग करता हूँ");
    const config = calls.filter((c) => c.url.includes("getModelsPipeline"));
    expect(config).toHaveLength(1);
    expect(config[0]!.headers).toMatchObject({ userID: "uid", ulcaApiKey: "ulca-key" });
    expect(config[0]!.body.pipelineRequestConfig?.pipelineId).toBe("64392f96daac500b55c543cd");
    const infer = calls.find((c) => c.url === "https://dhruva.example/infer")!;
    expect(infer.headers.Authorization).toBe("inference-key");
    expect(infer.body.pipelineTasks[0]!.config).toMatchObject({
      language: { sourceLanguage: "hi" },
      serviceId: "svc-asr",
      audioFormat: "wav",
      samplingRate: 16000,
    });
  });

  it("sends audio longer than 25 s in pieces and joins the text", async () => {
    const { f, calls } = ulca();
    await new Bhashini(settings, f).asr(b64(encodeWav16(tone(40))), "hi");
    expect(calls.filter((c) => c.url.endsWith("/infer"))).toHaveLength(2);
  });

  it("speaks and translates through the same pipeline", async () => {
    const { f } = ulca();
    const client = new Bhashini(settings, f);
    expect(await client.tts("नमस्ते", "hi")).toBe("UklGRg==");
    expect(await client.translate("मैं वायरिंग करता हूँ", "hi", "en")).toBe("I do wiring");
  });

  it("says why it cannot run, without echoing the upstream body", async () => {
    await expect(
      new Bhashini(bhashiniSettings({}), vi.fn() as unknown as typeof fetch).asr("x", "hi"),
    ).rejects.toMatchObject({
      reason: "no_key",
    });
    const leaky = vi.fn(
      async () => new Response("bad key ulca-key", { status: 401 }),
    ) as unknown as typeof fetch;
    const err = await new Bhashini(settings, leaky).tts("नमस्ते", "hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VoiceUnavailable);
    expect((err as VoiceUnavailable).reason).toBe("upstream");
    expect((err as Error).message).not.toContain("ulca-key");
  });
});

const formOf = (init: RequestInit) => init.body as FormData;

describe("ElevenLabs stand-in", () => {
  it("sends Scribe v2 a WAV with language_code and the xi-api-key header", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = vi.fn(async (url: string, init: RequestInit) => {
      seen = { url, init };
      return json({ text: " मैं पाइप बिछाता हूँ ", language_code: "hin" });
    }) as unknown as typeof fetch;
    const out = await transcribeWithScribe(
      encodeWav16(tone(1)),
      { languageCode: "hi" },
      { apiKey: "xi", fetchImpl: f },
    );
    expect(out.text).toBe("मैं पाइप बिछाता हूँ");
    expect(seen!.url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((seen!.init.headers as Record<string, string>)["xi-api-key"]).toBe("xi");
    const form = formOf(seen!.init);
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.get("language_code")).toBe("hi");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("asks Flash v2.5 for WAV in the configured voice, and serves a repeat from the cache", async () => {
    const wav = encodeWav16(tone(0.2, 22050));
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) as Record<string, unknown> });
      return new Response(wav as unknown as BodyInit, {
        status: 200,
        headers: { "content-type": "audio/wav" },
      });
    }) as unknown as typeof fetch;
    const cacheDir = mkdtempSync(join(tmpdir(), "ap-tts-"));
    const opts = { voiceId: "voice-1", languageCode: "hi" };
    const first = await cachedFlash("नमस्ते", opts, { apiKey: "xi", fetchImpl: f, cacheDir });
    const second = await cachedFlash("नमस्ते", opts, { apiKey: "xi", fetchImpl: f, cacheDir });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.wav).toEqual(first.wav);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice-1?output_format=wav_22050",
    );
    expect(calls[0]!.body).toEqual({
      text: "नमस्ते",
      model_id: "eleven_flash_v2_5",
      language_code: "hi",
    });
    expect(readdirSync(cacheDir)).toHaveLength(1);
  });

  it("never echoes an upstream error body", async () => {
    const f = vi.fn(
      async () => new Response("bad key xi-secret", { status: 401 }),
    ) as unknown as typeof fetch;
    const err = await transcribeWithScribe(
      encodeWav16(tone(1)),
      {},
      { apiKey: "xi-secret", fetchImpl: f },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VoiceUnavailable);
    expect((err as Error).message).not.toContain("xi-secret");
  });
});

describe("Groq Whisper fallback", () => {
  it("posts the WAV to Groq's transcription endpoint with whisper-large-v3 and Hindi", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = vi.fn(async (url: string, init: RequestInit) => {
      seen = { url, init };
      return json({ text: "मैं वायरिंग करता हूँ" });
    }) as unknown as typeof fetch;
    const out = await transcribeWithGroqWhisper(
      encodeWav16(tone(1)),
      { language: "hi" },
      { apiKey: "gsk", fetchImpl: f },
    );
    expect(out.text).toBe("मैं वायरिंग करता हूँ");
    expect(seen!.url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect((seen!.init.headers as Record<string, string>).authorization).toBe("Bearer gsk");
    const form = formOf(seen!.init);
    expect(form.get("model")).toBe("whisper-large-v3");
    expect(form.get("language")).toBe("hi");
    expect(form.get("response_format")).toBe("json");
  });

  it("reads its key from GROQ_API_KEY only (Groq serves no text model here)", () => {
    expect(groqKey({ GROQ_API_KEY: " g2 " })).toBe("g2");
    expect(groqKey({ AZURE_OPENAI_API_KEY: "az" })).toBe("");
    expect(groqKey({})).toBe("");
  });
});

describe("which recogniser runs", () => {
  const standinEnv = { ELEVENLABS_API_KEY: "xi", GROQ_API_KEY: "gsk" };
  const bhashiniEnv = { BHASHINI_USER_ID: "u", BHASHINI_API_KEY: "k", ...standinEnv };

  it("uses only Bhashini when it is configured, so worker audio never reaches a stand-in", () => {
    expect(activeAsr(bhashiniEnv)).toMatchObject({ provider: "bhashini", chain: ["bhashini"] });
  });

  it("otherwise uses the labelled ElevenLabs stand-in with Groq Whisper behind it", () => {
    const a = activeAsr(standinEnv);
    expect(a.chain).toEqual(["elevenlabs-standin", "groq-whisper-fallback"]);
    expect(a.label).toBe(SCRIBE_LABEL);
    expect(a.label).toContain("Bhashini key pending");
    expect(activeAsr({}).provider).toBeNull();
  });

  it("falls back to Groq Whisper when Scribe fails, and says so", async () => {
    const f = vi.fn(async (url: string) => {
      if (url.includes("elevenlabs")) return new Response("down", { status: 503 });
      return json({ text: "मेरा नंबर 98765 43210 है, मैं वायरिंग करता हूँ" });
    }) as unknown as typeof fetch;
    const out = await transcribe(b64(encodeWav16(tone(1))), "hi", {
      env: standinEnv,
      fetchImpl: f,
    });
    expect(out.provider).toBe("groq-whisper-fallback");
    expect(out.label).toBe(WHISPER_LABEL);
    expect(out.fellBackFrom).toEqual([
      { provider: "elevenlabs-standin", reason: "ElevenLabs answered HTTP 503." },
    ]);
    expect(out.transcript).not.toMatch(/98765/);
    expect(out.redacted).toBe(true);
    expect(out.seconds).toBe(1);
  });

  it("does not fall back to a stand-in when Bhashini fails", async () => {
    const urls: string[] = [];
    const f = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response("down", { status: 500 });
    }) as unknown as typeof fetch;
    await expect(
      transcribe(b64(encodeWav16(tone(1))), "hi", { env: bhashiniEnv, fetchImpl: f }),
    ).rejects.toMatchObject({
      reason: "upstream",
    });
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => !u.includes("elevenlabs") && !u.includes("groq"))).toBe(true);
  });

  it("names the voice that speaks: Bhashini, the stand-in, or the device", () => {
    expect(activeTts({ BHASHINI_USER_ID: "u", BHASHINI_API_KEY: "k" }).provider).toBe("bhashini");
    expect(activeTts({ ELEVENLABS_API_KEY: "xi", ELEVENLABS_VOICE_ID: "v" }).provider).toBe(
      "elevenlabs-standin",
    );
    expect(activeTts({ ELEVENLABS_API_KEY: "xi" })).toMatchObject({
      provider: null,
      label: "Device voice (Bhashini TTS pending)",
    });
  });
});
