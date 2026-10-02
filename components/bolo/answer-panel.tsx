"use client";

import { useState } from "react";
import { CONTENT_FILTER_NOTICE } from "@/lib/declaration/notices";
import type { Answer, Claim } from "@/lib/declaration/schemas";
import { QuoteText } from "./quote-text";

/**
 * The worker's answer as heard, with the claims suggested underneath. The transcript can be
 * corrected by hand; claims are marked as suggestions, say whether the AI or the simple rules found
 * them, and point at the words they came from. When the AI provider refused the answer, a notice
 * asks the worker to check the words or type a short summary; the transcript is kept either way.
 */
export function AnswerPanel({
  text,
  sourceLabel,
  claims,
  claimsNote,
  extraction,
  heard,
  onEdit,
  onSummary,
}: {
  text: string;
  sourceLabel: string;
  claims: Claim[];
  claimsNote: string | null;
  extraction?: Answer["extraction"];
  heard?: Answer["heard"];
  onEdit: (text: string) => void;
  onSummary?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const byRules = extraction?.source === "rules";
  return (
    <section className="mt-8" aria-label="Your answer">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-ink-soft text-sm font-semibold">आपका जवाब (your answer)</h2>
        <button
          type="button"
          className="text-saffron-deep text-sm underline underline-offset-4"
          onClick={() => {
            setDraft(text);
            setEditing((e) => !e);
          }}
        >
          {editing ? "रद्द करें (cancel)" : "ठीक करें (correct it)"}
        </button>
      </div>
      {editing ? (
        <div className="mt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            aria-label="Correct your answer"
            className="border-line w-full rounded-lg border p-3 text-xl leading-relaxed"
          />
          <button
            type="button"
            className="bg-ink mt-2 rounded-lg px-4 py-2 font-semibold text-white"
            onClick={() => {
              onEdit(draft);
              setEditing(false);
            }}
          >
            सहेजें (save)
          </button>
        </div>
      ) : (
        <blockquote className="mt-2 text-2xl leading-[1.7]">
          <QuoteText text={text} claims={claims} />
        </blockquote>
      )}
      <p className="text-ink-soft mt-2 text-xs">{sourceLabel}</p>
      {heard && (
        <p className="text-ink-soft mt-2 text-sm">
          जैसा सुना गया (as first heard, kept): <span className="text-ink">{heard.text}</span>{" "}
          <span className="text-xs">({heard.sourceLabel})</span>
        </p>
      )}

      {extraction?.contentFilter && (
        <div role="status" className="bg-saffron-soft mt-6 rounded-lg p-4">
          <p className="text-lg">{CONTENT_FILTER_NOTICE.hi}</p>
          <p className="text-ink-soft text-sm">{CONTENT_FILTER_NOTICE.en}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => {
                setDraft(text);
                setEditing(true);
              }}
            >
              जाँचें और ठीक करें (check the words)
            </button>
            {onSummary && (
              <button type="button" className="underline underline-offset-4" onClick={onSummary}>
                छोटा सार लिखें (type a short summary)
              </button>
            )}
          </div>
        </div>
      )}

      {(claims.length > 0 || claimsNote) && (
        <div className="border-saffron mt-6 rounded-lg border border-dashed p-4">
          <p className="text-saffron-deep text-sm font-semibold">
            {byRules
              ? "Suggestion found by simple rules, not by the AI. Your assessor checks every line."
              : "Suggestion: what the AI heard you do. Your assessor checks every line."}
          </p>
          {extraction && <p className="text-ink-soft mt-1 text-xs">{extraction.label}</p>}
          {claimsNote && <p className="text-ink-soft mt-2 text-sm">{claimsNote}</p>}
          <ul className="mt-3 grid gap-2">
            {claims.map((c) => (
              <li key={c.id}>
                <p className="text-lg">{c.summaryHi ?? c.summary}</p>
                <p className="text-ink-soft text-sm">{c.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
