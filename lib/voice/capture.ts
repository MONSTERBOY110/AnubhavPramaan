"use client";

import { ASR_RATE, encodeWav16 } from "./wav";

// Browser side of voice, ported from the team's SagarDrishti web app (apps/web/lib/voice.ts).
// The browser never talks to a speech provider: it records, converts to 16 kHz mono WAV, and posts
// to this app's own /api/voice routes, which hold the keys.

/**
 * Push to talk: start recording, and get back a function that stops it and resolves to WAV.
 * `onLevel` receives the input level (0 to 1) about 20 times a second, for the mic button's ring.
 */
export async function startRecording(
  onLevel?: (level: number) => void,
): Promise<{ stop: () => Promise<Uint8Array>; cancel: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let meterCtx: AudioContext | null = null;
  let meterTimer: ReturnType<typeof setInterval> | null = null;
  if (onLevel) {
    meterCtx = new AudioContext();
    const analyser = meterCtx.createAnalyser();
    analyser.fftSize = 512;
    meterCtx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    meterTimer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      onLevel(Math.min(1, peak * 1.6));
    }, 50);
  }
  const stopMeter = () => {
    if (meterTimer) clearInterval(meterTimer);
    void meterCtx?.close();
  };
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start();
  const release = () => {
    stopMeter();
    stream.getTracks().forEach((t) => t.stop());
  };
  return {
    stop: () =>
      new Promise<Uint8Array>((resolve, reject) => {
        rec.onstop = async () => {
          release();
          try {
            resolve(await toWav16k(await new Blob(chunks, { type: rec.mimeType }).arrayBuffer()));
          } catch (e) {
            reject(e);
          }
        };
        rec.stop();
      }),
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
      release();
    },
  };
}

/** Decode any audio the browser can play (a recording, an uploaded file), resample to mono 16 kHz. */
export async function toWav16k(buf: ArrayBuffer): Promise<Uint8Array> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buf.slice(0));
  await ctx.close();
  const frames = Math.max(1, Math.ceil(decoded.duration * ASR_RATE));
  const off = new OfflineAudioContext(1, frames, ASR_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  return encodeWav16(pcm, ASR_RATE);
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Play base64 WAV from the TTS route. Resolves when playback ends. */
export function playWav(b64: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const a = new Audio(`data:audio/wav;base64,${b64}`);
    a.onended = () => resolve();
    a.onerror = () => reject(new Error("playback failed"));
    void a.play().catch(reject);
  });
}

/** Can the device read Hindi aloud without the network? */
export function deviceVoiceFor(lang = "hi-IN"): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis.getVoices().find((v) => v.lang === lang) ?? null;
}

/** Read text with the device's own voice (the labelled fallback while Bhashini TTS is pending). */
export function speakWithDevice(text: string, lang = "hi-IN"): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = deviceVoiceFor(lang);
    if (v) u.voice = v;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}
