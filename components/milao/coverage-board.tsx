"use client";

import { useState } from "react";
import type { NosView, PcView } from "./view";

/**
 * The Qualification Pack as a fingerprint: one row per NOS, one tick per performance criterion.
 * A filled tick is a criterion the worker's own words support; a hollow tick is a gap. Selecting a
 * tick shows the criterion and the quotes behind it.
 */
export function CoverageBoard({ nos }: { nos: NosView[] }) {
  const firstCovered = nos.flatMap((n) => n.pcs).find((p) => p.covered) ?? nos[0]?.pcs[0];
  const [selected, setSelected] = useState<string | undefined>(firstCovered?.id);
  const pc = nos.flatMap((n) => n.pcs).find((p) => p.id === selected);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <table className="w-full border-collapse text-sm">
        <caption className="text-ink-soft mb-3 text-left text-sm">
          Each tick is one performance criterion. Filled: supported by the worker&apos;s words.
          Hollow: not mentioned.
        </caption>
        <thead>
          <tr className="text-ink-soft text-left text-xs">
            <th className="pb-2 font-medium">NOS</th>
            <th className="pr-4 pb-2 font-medium">Weight</th>
            <th className="pb-2 font-medium">Criteria</th>
            <th className="pb-2 text-right font-medium">Covered</th>
          </tr>
        </thead>
        <tbody>
          {nos.map((n) => (
            <tr key={n.id} className="border-line border-t align-top">
              <td className="py-3 pr-4">
                <span className="block font-mono text-xs">{n.id}</span>
                <span className="block max-w-[22rem] leading-snug">{n.title}</span>
              </td>
              <td className="text-ink-soft py-3 pr-4 tabular-nums">{n.weightagePct}%</td>
              <td className="py-3 pr-4">
                <div className="flex max-w-[26rem] flex-wrap gap-1">
                  {n.pcs.map((p) => (
                    <Tick
                      key={p.id}
                      pc={p}
                      active={p.id === selected}
                      onSelect={() => setSelected(p.id)}
                    />
                  ))}
                </div>
              </td>
              <td className="py-3 text-right tabular-nums">
                <span className="font-semibold">{n.covered}</span>
                <span className="text-ink-soft">/{n.pcs.length}</span>
                <span className="text-ink-soft block text-xs">{Math.round(n.pct * 100)}%</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <aside aria-live="polite" className="lg:sticky lg:top-6 lg:self-start">
        {pc ? <PcDetail pc={pc} /> : null}
      </aside>
    </div>
  );
}

function Tick({ pc, active, onSelect }: { pc: PcView; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${pc.code}: ${pc.text}`}
      aria-label={`${pc.code}, ${pc.covered ? "supported" : "gap"}`}
      aria-pressed={active}
      className={`size-4 rounded-[3px] border transition-transform motion-reduce:transition-none ${
        pc.covered ? "border-ink bg-ink" : "border-[#9aa3bf] bg-white"
      } ${active ? "ring-saffron scale-125 ring-2 ring-offset-1" : ""}`}
    />
  );
}

function PcDetail({ pc }: { pc: PcView }) {
  return (
    <div className="border-line rounded-xl border p-5">
      <p className="font-mono text-xs">{pc.id}</p>
      <p className="mt-1 text-base leading-relaxed">{pc.text}</p>
      {pc.covered ? (
        <div className="mt-4 grid gap-4">
          {pc.links.map((l, i) => (
            <figure key={i} className="border-saffron border-l-2 border-dashed pl-3">
              <blockquote className="text-lg leading-relaxed">&ldquo;{l.quote}&rdquo;</blockquote>
              <figcaption className="text-ink-soft mt-1 text-xs">
                Worker&apos;s words, answer on {l.topic}.{" "}
                {l.confidence === null
                  ? `Suggested link from a ${l.rationale}.`
                  : `Suggested link, confidence ${Math.round(l.confidence * 100)}%: ${l.rationale}`}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="text-ink-soft mt-4 text-sm">
          Not mentioned in the declaration. This is a gap to check in the practical or to cover in a
          bridge course; it is not a judgement of skill.
        </p>
      )}
    </div>
  );
}
