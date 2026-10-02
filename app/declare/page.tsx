"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnswerPanel } from "@/components/bolo/answer-panel";
import { ConsentStep } from "@/components/bolo/consent-step";
import { MicButton } from "@/components/bolo/mic-button";
import { ReadbackStep } from "@/components/bolo/readback-step";
import {
  confirmDeclaration,
  extractClaims,
  saveAnswer,
  startDeclaration,
  synthesise,
  transcribeAnswer,
} from "@/lib/declaration/client";
import type { Claim, SelfDeclaration } from "@/lib/declaration/schemas";
import { ELECTRICIAN_TOPICS } from "@/lib/declaration/topics";
import { playWav, speakWithDevice, startRecording, toBase64, toWav16k } from "@/lib/voice/capture";

// Bolo: the worker's voice self-declaration (TRD M1). Consent, then one question at a time: speak
// (or upload a recording, or type), see the words as heard, correct them if needed, and see the
// claims the AI suggests underlined in those words. Then the read-back, and the worker's yes.

type Step = "consent" | "interview" | "readback" | "done" | "declined";
type Busy = null | "starting" | "transcribing" | "extracting" | "confirming";

export default function Declare() {
  const [step, setStep] = useState<Step>("consent");
  const [decl, setDecl] = useState<SelfDeclaration | null>(null);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [voiceLabel, setVoiceLabel] = useState("");
  const [typing, setTyping] = useState(false);
  // True when the typed box is for a short summary of an answer the AI could not process.
  const [summarising, setSummarising] = useState(false);
  const [draft, setDraft] = useState("");
  const stopRef = useRef<null | (() => Promise<Uint8Array>)>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const topic = ELECTRICIAN_TOPICS[i]!;

  // A draft belongs to its question: moving on closes the box and clears it.
  useEffect(() => {
    setTyping(false);
    setSummarising(false);
    setDraft("");
  }, [i]);
  const answerIndex = decl?.answers.findIndex((a) => a.topic === topic.id) ?? -1;
  const answer = answerIndex >= 0 ? decl!.answers[answerIndex] : undefined;
  const claimsFor = (idx: number): Claim[] => decl?.claims.filter((c) => c.answer === idx) ?? [];

  useEffect(() => {
    fetch("/api/voice/status")
      .then((r) => r.json())
      .then((s: { tts: { label: string } }) => setVoiceLabel(s.tts.label))
      .catch(() => setVoiceLabel(""));
  }, []);

  async function speak(text: string) {
    try {
      const out = await synthesise(text);
      setVoiceLabel(out.label);
      await playWav(out.audio);
    } catch {
      setVoiceLabel("Device voice (Bhashini TTS pending)");
      await speakWithDevice(text);
    }
  }

  async function begin() {
    setBusy("starting");
    setError(null);
    try {
      setDecl(await startDeclaration("hi"));
      setStep("interview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleAudio(wav: Uint8Array, uploaded: boolean) {
    if (!decl) return;
    setBusy("transcribing");
    setError(null);
    try {
      const heard = await transcribeAnswer(toBase64(wav));
      const saved = await saveAnswer(decl.id, {
        topic: topic.id,
        q: topic.q,
        text: heard.transcript,
        source: heard.provider,
        sourceLabel: uploaded ? `${heard.label}, from an uploaded recording` : heard.label,
        seconds: heard.seconds,
        edited: false,
      });
      setDecl(saved);
      await extract(
        saved,
        saved.answers.findIndex((a) => a.topic === topic.id),
      );
    } catch (e) {
      setError(
        `सुनने में दिक्कत हुई (could not transcribe): ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function extract(current: SelfDeclaration, idx: number) {
    setBusy("extracting");
    try {
      const out = await extractClaims(current.id, idx);
      setDecl({
        ...current,
        answers: current.answers.map((a, k) =>
          k === idx ? { ...a, extraction: out.extraction } : a,
        ),
        claims: [...current.claims.filter((c) => c.answer !== idx), ...out.claims],
      });
      setNotes((n) => ({
        ...n,
        // A refused answer has its own notice; an empty result otherwise says so.
        [idx]: out.claims.length || out.blocked ? "" : "No concrete activity found in this answer.",
      }));
    } catch (e) {
      const status = (e as { status?: number }).status;
      setNotes((n) => ({
        ...n,
        [idx]:
          status === 503 || status === 404
            ? "Claim extraction is not available yet (LLM key pending). The answer is saved."
            : `Claim extraction failed: ${e instanceof Error ? e.message : String(e)}`,
      }));
    }
  }

  async function startMic() {
    setError(null);
    try {
      const rec = await startRecording(setLevel);
      stopRef.current = rec.stop;
      setRecording(true);
    } catch (e) {
      setError(
        `माइक नहीं मिला (microphone unavailable): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function stopMic() {
    const stop = stopRef.current;
    stopRef.current = null;
    setRecording(false);
    setLevel(0);
    if (stop) await handleAudio(await stop(), false);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    await handleAudio(await toWav16k(await file.arrayBuffer()), true);
    if (fileRef.current) fileRef.current.value = "";
  }

  /** Text fallback (PRD R2): for a noisy camp or a worker who prefers a helper to type. */
  async function onType() {
    if (!decl || !draft.trim()) return;
    setBusy("extracting");
    setError(null);
    try {
      const saved = await saveAnswer(decl.id, {
        topic: topic.id,
        q: topic.q,
        text: draft.trim(),
        source: "typed",
        sourceLabel: summarising ? "Typed summary" : "Typed",
        edited: false,
      });
      setDecl(saved);
      setTyping(false);
      setSummarising(false);
      setDraft("");
      await extract(
        saved,
        saved.answers.findIndex((a) => a.topic === topic.id),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onEdit(text: string) {
    if (!decl || !answer) return;
    const saved = await saveAnswer(decl.id, { ...answer, text, edited: true });
    setDecl(saved);
    await extract(
      saved,
      saved.answers.findIndex((a) => a.topic === topic.id),
    );
    setBusy(null);
  }

  const readBackLines = (decl?.claims ?? []).map((c) => c.summaryHi ?? c.summary);
  const readBackText = readBackLines.length
    ? `आपने बताया कि ${readBackLines.join("। ")}। क्या यह सही है?`
    : decl?.answers.length === 1
      ? "आपने 1 सवाल का जवाब दिया। क्या हम इसे असेसर को भेज दें?"
      : `आपने ${decl?.answers.length ?? 0} सवालों के जवाब दिए। क्या हम इन्हें असेसर को भेज दें?`;

  async function confirm() {
    if (!decl) return;
    setBusy("confirming");
    try {
      setDecl(await confirmDeclaration(decl.id, readBackText));
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-10 flex items-center justify-between gap-4">
        <Link href="/" className="text-lg font-bold">
          अनुभव प्रमाण{" "}
          <span className="text-ink-soft hidden text-sm font-normal sm:inline">AnubhavPramaan</span>
        </Link>
        {step === "interview" && (
          <div
            className="flex items-center gap-3"
            aria-label={`Question ${i + 1} of ${ELECTRICIAN_TOPICS.length}`}
          >
            <span className="text-ink-soft text-sm whitespace-nowrap tabular-nums">
              {i + 1} / {ELECTRICIAN_TOPICS.length}
            </span>
            <div className="flex gap-1">
              {ELECTRICIAN_TOPICS.map((t, k) => (
                <span
                  key={t.id}
                  className={`h-1.5 w-3 rounded-full sm:w-5 ${k <= i ? "bg-ink" : "bg-line"}`}
                />
              ))}
            </div>
          </div>
        )}
      </header>

      {error && (
        <p role="alert" className="bg-alert-soft text-alert mb-6 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {step === "consent" && (
        <ConsentStep
          busy={busy === "starting"}
          onAgree={begin}
          onDecline={() => setStep("declined")}
        />
      )}

      {step === "declined" && (
        <section className="max-w-2xl">
          <h1 className="text-3xl font-bold">ठीक है, कुछ भी रिकॉर्ड नहीं हुआ।</h1>
          <p className="text-ink-soft mt-2">
            Nothing was recorded. The assessor can take your declaration on paper instead.
          </p>
        </section>
      )}

      {step === "interview" && (
        <section aria-labelledby="question">
          <h1 id="question" className="text-[1.9rem] leading-[1.5] font-semibold">
            {topic.q}
          </h1>
          <p className="text-ink-soft mt-2">{topic.en}</p>
          <button
            type="button"
            onClick={() => speak(topic.q)}
            className="text-saffron-deep mt-3 text-sm underline underline-offset-4"
          >
            सवाल सुनें (hear the question)
          </button>

          <div className="mt-10 flex flex-col items-center gap-3">
            <MicButton
              recording={recording}
              level={level}
              disabled={busy !== null}
              onStart={startMic}
              onStop={stopMic}
            />
            <p className="text-lg" aria-live="polite">
              {recording
                ? "बोलिए... खत्म होने पर फिर दबाएँ"
                : busy === "transcribing"
                  ? "सुन रहे हैं... (transcribing)"
                  : busy === "extracting"
                    ? "समझ रहे हैं... (finding activities)"
                    : answer
                      ? "फिर से बोलने के लिए दबाएँ"
                      : "बोलने के लिए दबाएँ"}
            </p>
            <div className="text-ink-soft flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">
              <label className="cursor-pointer underline underline-offset-4">
                या रिकॉर्डिंग चुनें (or choose a recording)
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setSummarising(false);
                  setTyping((t) => !t);
                }}
                aria-expanded={typing}
                className="underline underline-offset-4"
              >
                या लिखकर बताएँ (or type it)
              </button>
            </div>
          </div>

          {typing && (
            <div className="mt-6">
              <label className="text-ink-soft text-sm font-semibold" htmlFor="typed-answer">
                {summarising
                  ? "छोटा सार लिखें, बोला हुआ जवाब भी रखा जाएगा (type a short summary; the spoken answer is kept)"
                  : "अपना जवाब लिखें (type your answer)"}
              </label>
              <textarea
                id="typed-answer"
                autoFocus={summarising}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                className="border-line mt-2 w-full rounded-lg border p-3 text-xl leading-relaxed"
              />
              <button
                type="button"
                disabled={!draft.trim() || busy !== null}
                onClick={onType}
                className="bg-ink mt-2 rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-40"
              >
                सहेजें (save)
              </button>
            </div>
          )}

          {answer && (
            <AnswerPanel
              key={`${answer.topic}:${answer.text.length}`}
              text={answer.text}
              sourceLabel={
                answer.edited ? `${answer.sourceLabel}, corrected by hand` : answer.sourceLabel
              }
              claims={claimsFor(answerIndex)}
              claimsNote={notes[answerIndex] || null}
              extraction={answer.extraction}
              heard={answer.heard}
              onEdit={onEdit}
              onSummary={() => {
                setSummarising(true);
                setTyping(true);
              }}
            />
          )}

          <nav className="mt-10 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={i === 0 || busy !== null || recording}
              onClick={() => setI(i - 1)}
              className="border-line rounded-lg border px-5 py-3 disabled:opacity-40"
            >
              पिछला (back)
            </button>
            {i < ELECTRICIAN_TOPICS.length - 1 ? (
              <button
                type="button"
                disabled={busy !== null || recording}
                onClick={() => setI(i + 1)}
                className={`rounded-lg px-6 py-3 font-semibold disabled:opacity-40 ${
                  answer ? "bg-ink text-white" : "border-line text-ink border"
                }`}
              >
                {answer ? "अगला सवाल (next)" : "छोड़ें (skip)"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy !== null || recording || !decl?.answers.length}
                onClick={() => setStep("readback")}
                className="bg-ink rounded-lg px-6 py-3 font-semibold text-white disabled:opacity-40"
              >
                पढ़कर सुनाएँ (read it back)
              </button>
            )}
          </nav>
        </section>
      )}

      {step === "readback" && (
        <ReadbackStep
          lines={
            readBackLines.length
              ? readBackLines
              : [
                  `${decl?.answers.length ?? 0} ${decl?.answers.length === 1 ? "answer" : "answers"} saved`,
                ]
          }
          voiceLabel={voiceLabel}
          busy={busy === "confirming"}
          onListen={() => speak(readBackText)}
          onConfirm={confirm}
          onChange={() => setStep("interview")}
        />
      )}

      {step === "done" && decl && (
        <section className="max-w-2xl">
          <h1 className="text-3xl font-bold">धन्यवाद। आपकी जानकारी असेसर के पास पहुँच गई है।</h1>
          <p className="text-ink-soft mt-2">Thank you. Your declaration is with the assessor.</p>
          <p className="mt-6 text-lg">
            आपका नंबर (reference): <span className="font-mono">{decl.candidateRef}</span>
          </p>
          <Link
            href={`/match/${decl.id}`}
            className="border-ink mt-8 inline-block rounded-lg border px-5 py-3"
          >
            Assessor: open the qualification match
          </Link>
        </section>
      )}
    </main>
  );
}
