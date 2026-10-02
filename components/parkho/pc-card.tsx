"use client";

import { useState } from "react";
import { deviationCheck } from "@/lib/assess/deviation";
import { marksForLevel } from "@/lib/assess/scoring";
import {
  pcMax,
  toleranceText,
  withinTolerance,
  type EvidenceEntry,
  type LiteNos,
  type LitePc,
  type PcEntry,
} from "./state";

const LEVEL_NAMES = ["Below standard", "Meets standard", "Exceeds in places", "Excellent"];

// A follow-up on the worker's own words, as NCVET asks for questions based on prior job experience.
const PROBE_HI =
  "यह काम आप कैसे करते हैं? शुरू से आख़िर तक क्रम से बताइए, और इसमें किस बात का ध्यान रखते हैं?";
const PROBE_EN = "How do you do this? Tell me step by step, and what you take care of.";

/**
 * One performance criterion on the assessor's checklist. The assessor sets the level or enters the
 * reading; the photo is hashed on the device; the AI hint, when asked for, only says what it can
 * see. When the level contradicts the hint, a one-line reason is required before moving on.
 */
export function PcCard({
  nos,
  pc,
  entry,
  evidence,
  said = [],
  linkedBy = null,
  references = [],
  online,
  onChange,
  onPhoto,
  onHint,
}: {
  nos: LiteNos;
  pc: LitePc;
  entry: PcEntry;
  evidence: EvidenceEntry[];
  said?: string[];
  linkedBy?: string | null;
  references?: Array<{ image: string; credit: string }>;
  online: boolean;
  onChange: (next: PcEntry) => void;
  onPhoto: (file: File) => void;
  onHint: () => Promise<void>;
}) {
  const [hinting, setHinting] = useState(false);
  const max = pcMax(nos, pc);
  const statuses = entry.hint?.map((h) => h.status);
  const deviation =
    entry.level !== undefined ? deviationCheck(entry.level, statuses) : { needsReason: false };
  const marks =
    pc.type === "measurement"
      ? entry.reading !== undefined && pc.tolerance
        ? withinTolerance(pc.tolerance, entry.reading)
          ? max
          : 0
        : undefined
      : entry.level !== undefined
        ? marksForLevel(entry.level, max)
        : undefined;

  return (
    <article className="border-line rounded-xl border p-5" aria-labelledby={`${pc.id}-title`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id={`${pc.id}-title`} className="text-base leading-snug">
          <span className="text-ink-soft mr-2 font-mono text-xs">{pc.code}</span>
          {pc.text}
        </h3>
        <span className="text-ink-soft shrink-0 text-xs">
          {pc.type === "measurement" ? "Measured, scored by rule" : "Judgement, 0 to 3"}
        </span>
      </div>

      {said.length > 0 && (
        <div className="border-saffron mt-3 rounded-lg border border-dashed px-4 py-3">
          <p className="text-saffron-deep text-xs font-semibold">
            From the worker&apos;s declaration, linked by the tool. Check it.
          </p>
          {linkedBy && <p className="text-ink-soft mt-0.5 text-xs">{linkedBy}</p>}
          {said.map((q) => (
            <p key={q} className="mt-1 text-base leading-relaxed">
              &ldquo;{q}&rdquo;
            </p>
          ))}
          <p className="mt-2 text-sm">
            <span className="font-semibold">Ask:</span> {PROBE_HI}
            <span className="text-ink-soft block text-xs">{PROBE_EN}</span>
          </p>
        </div>
      )}

      {pc.type === "judgement" && pc.anchors && (
        <fieldset className="mt-4 grid gap-2 md:grid-cols-4">
          <legend className="sr-only">Level</legend>
          {pc.anchors.map((a, level) => {
            const chosen = entry.level === level;
            return (
              <label
                key={level}
                className={`cursor-pointer rounded-lg border p-3 text-sm leading-snug ${chosen ? "border-decide bg-decide-soft" : "border-line hover:border-ink"}`}
              >
                <input
                  type="radio"
                  name={pc.id}
                  className="sr-only"
                  checked={chosen}
                  onChange={() => onChange({ ...entry, level: level as 0 | 1 | 2 | 3 })}
                />
                <span className="block font-semibold">
                  {level} {LEVEL_NAMES[level]}
                </span>
                <span className="text-ink-soft">{a.replace(/^[^:]+:\s*/, "")}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {pc.type === "measurement" && pc.tolerance && (
        <div className="mt-4 grid gap-2">
          <p className="text-sm">{pc.measurementTask}</p>
          <label className="flex items-center gap-3 text-sm">
            Reading
            <input
              type="number"
              inputMode="decimal"
              value={entry.reading ?? ""}
              onChange={(e) =>
                onChange({
                  ...entry,
                  reading: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              className="border-line w-32 rounded-lg border px-3 py-2"
            />
            {pc.tolerance.unit === "Mohm" ? "megohm" : pc.tolerance.unit}
          </label>
          <p className="text-ink-soft text-xs">
            Pass band: {toleranceText(pc.tolerance)}. Source: {pc.tolerance.source}
          </p>
          {entry.reading !== undefined && (
            <p className="text-sm font-semibold">
              {withinTolerance(pc.tolerance, entry.reading)
                ? "Inside the band: full marks"
                : "Outside the band: zero marks"}
            </p>
          )}
        </div>
      )}

      {references.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4">
          {references.map((r) => (
            <figure key={r.image} className="flex max-w-md items-start gap-3">
              <a href={r.image} target="_blank" rel="noreferrer" className="shrink-0">
                {/* A local, openly licensed photo shown as a small thumbnail. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.image}
                  alt="Reference photo for this criterion"
                  className="border-line size-20 rounded-lg border object-cover"
                />
              </a>
              <figcaption className="text-ink-soft text-xs leading-snug">
                <span className="text-ink block font-medium">Reference photo</span>
                Shows what this work looks like; not a graded example. {r.credit}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {pc.observables && pc.observables.length > 0 && (
        <div className="mt-4">
          <p className="text-ink-soft text-xs font-semibold">What to check</p>
          <ul className="mt-1 grid gap-1 text-sm">
            {pc.observables.map((o, i) => {
              const h = entry.hint?.[i];
              return (
                <li key={o} className="flex flex-wrap items-baseline gap-2">
                  <span>{o}</span>
                  {h && (
                    <span
                      title={h.reason}
                      className={`rounded-full border border-dashed px-2 py-0.5 text-xs ${
                        h.status === "visible"
                          ? "border-ink"
                          : h.status === "not_visible"
                            ? "border-alert text-alert"
                            : "border-ink-soft text-ink-soft"
                      }`}
                    >
                      AI hint:{" "}
                      {h.status === "visible"
                        ? "visible"
                        : h.status === "not_visible"
                          ? "not visible"
                          : "cannot tell"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="border-line hover:border-ink cursor-pointer rounded-lg border px-3 py-2">
          Add photo evidence
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])}
          />
        </label>
        {evidence.length > 0 && pc.observables?.length ? (
          entry.hintQueued ? (
            <span className="border-saffron text-saffron-deep rounded-lg border border-dashed px-3 py-2">
              Hint queued: it runs when the network is back
            </span>
          ) : (
            <button
              type="button"
              disabled={hinting}
              onClick={async () => {
                setHinting(true);
                try {
                  await onHint();
                } finally {
                  setHinting(false);
                }
              }}
              className="border-saffron text-saffron-deep rounded-lg border border-dashed px-3 py-2 disabled:opacity-50"
            >
              {hinting
                ? "Looking at the photo..."
                : online
                  ? "Ask for an evidence hint"
                  : "Ask for a hint when back online"}
            </button>
          )
        ) : null}
        {evidence.map((e) => (
          <span key={e.sha256} className="text-ink-soft flex items-center gap-2 text-xs">
            {/* A blob: preview of a photo just taken on this device; next/image cannot optimise it. */}
            {e.preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={e.preview}
                alt=""
                className="border-line size-10 rounded border object-cover"
              />
            )}
            <span className="font-mono">sha256 {e.sha256.slice(0, 12)}...</span>
            <span>
              {new Date(e.capturedAt).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="tabular-nums">
              {e.lat !== undefined && e.lon !== undefined
                ? `${e.lat.toFixed(2)}, ${e.lon.toFixed(2)}`
                : "no place"}
            </span>
          </span>
        ))}
      </div>

      {deviation.needsReason && (
        <label className="mt-4 block text-sm">
          <span className="text-alert font-semibold">{deviation.why} Write one line on why.</span>
          <input
            value={entry.reason ?? ""}
            onChange={(e) => onChange({ ...entry, reason: e.target.value })}
            className="border-alert mt-1 block w-full rounded-lg border px-3 py-2"
            placeholder="What you saw that differs from the hint"
          />
        </label>
      )}

      <p className="text-ink-soft mt-3 text-xs tabular-nums">
        {marks === undefined
          ? "Not scored yet"
          : `${marks.toFixed(1)} of ${max.toFixed(1)} practical marks`}
        , from the element&apos;s marks shared equally among its criteria.
      </p>
    </article>
  );
}
