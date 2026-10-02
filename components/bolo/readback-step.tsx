"use client";

/** The read-back: the worker hears what was understood and says whether it is right. */
export function ReadbackStep({
  lines,
  voiceLabel,
  busy,
  onListen,
  onConfirm,
  onChange,
}: {
  lines: string[];
  voiceLabel: string;
  busy: boolean;
  onListen: () => void;
  onConfirm: () => void;
  onChange: () => void;
}) {
  return (
    <section className="max-w-2xl" aria-labelledby="readback-title">
      <h1 id="readback-title" className="text-3xl font-bold">
        आपने बताया
      </h1>
      <p className="text-ink-soft mt-1">What you told us. Listen, then say if it is right.</p>
      <ol className="mt-6 grid list-decimal gap-3 pl-6 text-xl leading-relaxed">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onListen}
        className="border-ink mt-6 rounded-lg border px-5 py-3 text-lg"
      >
        सुनें (listen)
      </button>
      <p className="text-ink-soft mt-1 text-xs">{voiceLabel}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="bg-ink rounded-lg px-6 py-4 text-lg font-semibold text-white disabled:opacity-50"
        >
          हाँ, सही है
          <span className="block text-sm font-normal text-white/85">Yes, this is right</span>
        </button>
        <button
          type="button"
          onClick={onChange}
          className="border-line rounded-lg border px-6 py-4 text-lg"
        >
          बदलना है
          <span className="text-ink-soft block text-sm">I want to change something</span>
        </button>
      </div>
    </section>
  );
}
