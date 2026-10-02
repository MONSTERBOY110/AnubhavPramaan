"use client";

import type { Claim, SelfDeclaration } from "./schemas";

// Browser helpers for the Bolo flow. Every call goes to this app's own routes.

export type AsrReply = {
  transcript: string;
  provider: "bhashini" | "elevenlabs-standin" | "groq-whisper-fallback";
  label: string;
  seconds: number;
  redacted: boolean;
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok)
    throw Object.assign(new Error(json.message ?? json.error ?? `HTTP ${res.status}`), {
      status: res.status,
      code: json.error,
    });
  return json;
}

export const startDeclaration = (lang = "hi") =>
  postJson<SelfDeclaration>("/api/declaration", { lang, consent: true });

export const transcribeAnswer = (audio: string, language = "hi") =>
  postJson<AsrReply>("/api/voice/asr", { audio, language });

export const saveAnswer = (id: string, answer: SelfDeclaration["answers"][number]) =>
  postJson<SelfDeclaration>(`/api/declaration/${id}/answer`, answer);

export type ExtractReply = {
  claims: Claim[];
  label: string;
  rejected: number;
  source: "llm" | "rules";
  extraction: SelfDeclaration["answers"][number]["extraction"];
  /** Set when the AI provider's content filter refused the answer; `notice` says what to do. */
  blocked?: "content_filter";
  notice?: { hi: string; en: string };
};

export const extractClaims = (id: string, answer: number) =>
  postJson<ExtractReply>(`/api/declaration/${id}/extract`, { answer });

export const confirmDeclaration = (id: string, readBack: string) =>
  postJson<SelfDeclaration>(`/api/declaration/${id}/confirm`, { readBack, confirmed: true });

export type TtsReply = { audio: string; format: string; provider: string; label: string };

export const synthesise = (text: string, language = "hi") =>
  postJson<TtsReply>("/api/voice/tts", { text, language });
