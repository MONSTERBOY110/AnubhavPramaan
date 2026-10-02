"use client";

import { useState } from "react";

// The rater's screen for a calibration set: consent, then one photo at a time with a level for every
// criterion (the study protocol requires a level on every unit), then one submission. Unaided raters
// see the generic WorldSkills labels; assisted raters see each criterion's own anchors, what to
// check, and hints frozen before scoring. No total, grade or recommendation is ever shown.

export type CalibrationItemView = {
  id: string;
  image: string;
  credit: string;
  pcs: Array<{
    id: string;
    code: string;
    text: string;
    anchors?: [string, string, string, string];
    observables?: string[];
    hints?: Array<{ status: "visible" | "not_visible" | "cannot_tell"; reason: string }>;
  }>;
};

// WorldSkills Europe TD19, section 4.6: the same labels in both conditions, so "met" means the same.
const GENERIC = [
  "Below industry standard",
  "Meets industry standard",
  "Meets it and in specific respects exceeds it",
  "Wholly exceeds it, excellent",
];
const HINT = {
  visible: "visible",
  not_visible: "not visible",
  cannot_tell: "cannot tell",
} as const;

type Step = "consent" | "items" | "sending" | "done";

export function CalibrateBoard({
  setId,
  condition,
  items,
}: {
  setId: string;
  condition: "unaided" | "assisted";
  items: CalibrationItemView[];
}) {
  const [step, setStep] = useState<Step>("consent");
  const [rater, setRater] = useState("");
  const [background, setBackground] = useState<"qualified" | "volunteer">("volunteer");
  const [consent, setConsent] = useState(false);
  const [i, setI] = useState(0);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [openedAt, setOpenedAt] = useState(0);
  const [seconds, setSeconds] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const item = items[i]!;
  const key = (pcId: string) => `${item.id}|${pcId}`;
  const complete = item.pcs.every((pc) => levels[key(pc.id)] !== undefined);

  function begin() {
    setOpenedAt(Date.now());
    setStep("items");
  }

  function choose(pcId: string, level: number) {
    setLevels((l) => ({ ...l, [key(pcId)]: level }));
    // Time per photo: from opening it to its last level (the protocol's measure).
    setSeconds((s) => ({ ...s, [item.id]: Math.round((Date.now() - openedAt) / 100) / 10 }));
  }

  async function next() {
    if (i < items.length - 1) {
      setI(i + 1);
      setOpenedAt(Date.now());
      window.scrollTo({ top: 0 });
      return;
    }
    setStep("sending");
    setError(null);
    const ratings = items.flatMap((it) =>
      it.pcs.map((pc) => ({
        itemId: it.id,
        pcId: pc.id,
        level: levels[`${it.id}|${pc.id}`]!,
        seconds: seconds[it.id] ?? 0,
      })),
    );
    const res = await fetch(`/api/calibration/${setId}/ratings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rater: rater.trim(), background, condition, consent: true, ratings }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      setError(
        body?.message ??
          `Not saved: ${body?.error ?? "no connection"}. Your scores are still on this page; try again.`,
      );
      setStep("items");
      return;
    }
    setStep("done");
  }

  if (step === "consent") {
    const ok = /^[A-Za-z0-9-]{2,20}$/.test(rater.trim()) && consent;
    return (
      <section
        className="border-line mt-6 max-w-2xl rounded-xl border p-5"
        aria-label="Before you start"
      >
        <h2 className="text-lg font-semibold">Before you start</h2>
        <p className="text-ink-soft mt-1 text-sm">
          You will score {items.length} photos, every criterion on the 0 to 3 scale. Work alone and
          do not discuss the photos.
        </p>
        <label className="mt-4 block text-sm">
          Your rater code (given to you; never your name)
          <input
            value={rater}
            onChange={(e) => setRater(e.target.value)}
            className="border-line mt-1 block w-48 rounded-lg border px-3 py-2"
          />
        </label>
        <fieldset className="mt-4 grid gap-1 text-sm">
          <legend className="font-medium">Background</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={background === "qualified"}
              onChange={() => setBackground("qualified")}
            />{" "}
            Certified assessor, ITI instructor or electrician
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={background === "volunteer"}
              onChange={() => setBackground("volunteer")}
            />{" "}
            Volunteer without an electrical qualification
          </label>
        </fieldset>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          <span>
            I agree that my scores are stored under my rater code with my background, and may be
            published that way. I can withdraw, and my scores are then deleted.
          </span>
        </label>
        <button
          type="button"
          disabled={!ok}
          onClick={begin}
          className="bg-ink mt-5 rounded-lg px-5 py-3 font-semibold text-white disabled:opacity-40"
        >
          Start
        </button>
      </section>
    );
  }

  if (step === "done") {
    return (
      <section className="border-line mt-6 max-w-2xl rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Saved. Thank you.</h2>
        <p className="text-ink-soft mt-1 text-sm">
          Your {Object.keys(levels).length} scores are saved under code{" "}
          <span className="font-mono">{rater.trim()}</span>.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6" aria-label={`Photo ${i + 1} of ${items.length}`}>
      <p className="text-ink-soft text-sm tabular-nums">
        Photo {i + 1} of {items.length}
      </p>
      {error && (
        <p role="alert" className="bg-alert-soft text-alert mt-3 rounded-lg px-4 py-3 text-sm">
          {error}
        </p>
      )}
      <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <figure>
          {/* A local, openly licensed photo shown as is; next/image would not add anything here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image}
            alt={`Photo ${i + 1} to score`}
            className="border-line w-full rounded-xl border object-contain"
          />
          <figcaption className="text-ink-soft mt-2 text-xs">{item.credit}</figcaption>
        </figure>
        <div className="grid content-start gap-5">
          {item.pcs.map((pc) => (
            <fieldset key={pc.id} className="border-line rounded-xl border p-4">
              <legend className="px-1 text-sm">
                <span className="text-ink-soft mr-2 font-mono text-xs">{pc.code}</span>
                {pc.text}
              </legend>
              <div className="mt-2 grid gap-2">
                {[0, 1, 2, 3].map((level) => (
                  <label
                    key={level}
                    className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 text-sm ${levels[key(pc.id)] === level ? "border-ink bg-paper-soft" : "border-line"}`}
                  >
                    <input
                      type="radio"
                      name={key(pc.id)}
                      checked={levels[key(pc.id)] === level}
                      onChange={() => choose(pc.id, level)}
                    />
                    <span>
                      <span className="font-semibold">{level}</span>{" "}
                      {pc.anchors ? pc.anchors[level] : GENERIC[level]}
                    </span>
                  </label>
                ))}
              </div>
              {pc.observables && pc.observables.length > 0 && (
                <ul className="mt-3 grid gap-1 text-sm">
                  {pc.observables.map((o, k) => (
                    <li key={o} className="flex flex-wrap items-baseline gap-2">
                      <span>{o}</span>
                      {pc.hints?.[k] && (
                        <span
                          title={pc.hints[k]!.reason}
                          className="border-saffron text-saffron-deep rounded-full border border-dashed px-2 py-0.5 text-xs"
                        >
                          Hint, fixed before scoring: {HINT[pc.hints[k]!.status]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            disabled={!complete || step === "sending"}
            onClick={next}
            className="bg-ink w-fit rounded-lg px-5 py-3 font-semibold text-white disabled:opacity-40"
          >
            {step === "sending"
              ? "Saving..."
              : i < items.length - 1
                ? "Next photo"
                : "Save my scores"}
          </button>
          {!complete && (
            <p className="text-ink-soft text-xs">Give every criterion a level to go on.</p>
          )}
        </div>
      </div>
    </section>
  );
}
