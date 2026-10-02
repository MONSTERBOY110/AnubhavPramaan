"use client";

import { useRef, useState } from "react";
import { ELECTRICIAN_TOPICS } from "@/lib/declaration/topics";
import { startRecording, toBase64 } from "@/lib/voice/capture";
import { PERSONAS } from "./personas";

// Role-play recording kit for the held-out evaluation set. Records each answer as 16 kHz mono WAV
// in the browser and saves it into docs/internal/recordings/<persona>/ through a development-only
// route; if saving is disabled, the file downloads instead. Not linked from the app.

type Take = { url: string; seconds: number; saved: string };

export default function RecordKit() {
  const [persona, setPersona] = useState(PERSONAS[0]!.id);
  const [takes, setTakes] = useState<Record<string, Take>>({});
  const [active, setActive] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<null | (() => Promise<Uint8Array>)>(null);
  const card = PERSONAS.find((p) => p.id === persona)!;

  async function record(index: number) {
    setError(null);
    try {
      const rec = await startRecording();
      stopRef.current = rec.stop;
      setActive(index);
    } catch (e) {
      setError(`Microphone: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function stop(index: number, topic: string) {
    const stopFn = stopRef.current;
    stopRef.current = null;
    setActive(null);
    if (!stopFn) return;
    const wav = await stopFn();
    const seconds = (wav.length - 44) / 2 / 16000;
    const blobUrl = URL.createObjectURL(
      new Blob([wav as unknown as BlobPart], { type: "audio/wav" }),
    );
    let saved = "";
    const res = await fetch("/api/dev/recordings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ persona, index: index + 1, topic, audio: toBase64(wav) }),
    }).catch(() => null);
    if (res?.ok) {
      saved = ((await res.json()) as { saved: string }).saved;
    } else {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${persona}-q${index + 1}-${topic}.wav`;
      a.click();
      saved = `downloaded as ${a.download}`;
    }
    setTakes((t) => ({ ...t, [`${persona}:${index}`]: { url: blobUrl, seconds, saved } }));
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-bold">Role-play recordings for the held-out set</h1>
      <p className="text-ink-soft mt-2">
        Pick a persona, then answer each question in Hindi in your own words, 15 to 45 seconds each.
        Quiet room, fan off, about 30 cm from the microphone. No real names, phone numbers or
        Aadhaar.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPersona(p.id)}
            className={`rounded-md border px-3 py-2 text-sm ${p.id === persona ? "border-ink bg-ink text-white" : "border-line"}`}
          >
            {p.id} {p.required ? "" : "(optional)"}
          </button>
        ))}
      </div>

      <section className="border-line bg-paper-soft mt-4 rounded-lg border p-4">
        <h2 className="font-semibold">
          {card.id}: {card.title}
        </h2>
        <ul className="text-ink-soft mt-2 list-disc pl-5 text-sm">
          {card.brief.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>

      {error && <p className="text-alert mt-4">{error}</p>}

      <ol className="mt-6 grid gap-3">
        {ELECTRICIAN_TOPICS.map((t, i) => {
          const take = takes[`${persona}:${i}`];
          const recording = active === i;
          return (
            <li key={t.id} className="border-line rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg">
                    {i + 1}. {t.q}
                  </p>
                  <p className="text-ink-soft text-sm">{t.en}</p>
                </div>
                {recording ? (
                  <button
                    onClick={() => stop(i, t.id)}
                    className="bg-alert shrink-0 rounded-md px-4 py-2 font-semibold text-white"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => record(i)}
                    disabled={active !== null}
                    className="bg-ink shrink-0 rounded-md px-4 py-2 font-semibold text-white disabled:opacity-40"
                  >
                    {take ? "Re-record" : "Record"}
                  </button>
                )}
              </div>
              {recording && (
                <p className="text-saffron-deep mt-2 text-sm font-semibold">
                  Recording... speak now
                </p>
              )}
              {take && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <audio controls src={take.url} className="h-8" />
                  <span className="text-ink-soft">{take.seconds.toFixed(1)} s</span>
                  <span className="text-decide">{take.saved}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
