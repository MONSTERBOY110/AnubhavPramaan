import { Check } from "lucide-react";
import { CONSENT_EN, CONSENT_HI } from "@/lib/declaration/consent";

/** Consent before anything is recorded. Hindi first, English beneath each line for the assessor. */
export function ConsentStep({
  busy,
  onAgree,
  onDecline,
}: {
  busy: boolean;
  onAgree: () => void;
  onDecline: () => void;
}) {
  return (
    <section aria-labelledby="consent-title" className="max-w-2xl">
      <h1 id="consent-title" className="text-3xl leading-snug font-bold">
        शुरू करने से पहले
      </h1>
      <p className="text-ink-soft mt-1">Before we start</p>
      <ol className="mt-8 grid gap-5">
        {CONSENT_HI.map((line, i) => (
          <li key={line} className="flex gap-4">
            <Check aria-hidden="true" className="text-ink mt-1.5 size-5 shrink-0" />
            <div>
              <p className="text-xl leading-relaxed">{line}</p>
              <p className="text-ink-soft mt-1 text-sm">{CONSENT_EN[i]}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAgree}
          disabled={busy}
          className="bg-ink rounded-lg px-6 py-4 text-lg font-semibold text-white disabled:opacity-50"
        >
          हाँ, मैं सहमत हूँ
          <span className="block text-sm font-normal text-white/80">Yes, I agree</span>
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="border-line rounded-lg border px-6 py-4 text-lg"
        >
          नहीं
          <span className="text-ink-soft block text-sm">No, stop here</span>
        </button>
      </div>
    </section>
  );
}
