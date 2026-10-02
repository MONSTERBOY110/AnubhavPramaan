import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { JourneyBar } from "@/components/app-shell/journey-bar";

const STEPS = [
  {
    name: "Bolo",
    hi: "बोलो",
    gloss: "speak",
    text: "The worker describes their work by voice, in Hindi, and hears it read back.",
  },
  {
    name: "Milao",
    hi: "मिलाओ",
    gloss: "match",
    text: "Their words are matched to the closest NSQF Qualification Pack, criterion by criterion.",
  },
  {
    name: "Parkho",
    hi: "परखो",
    gloss: "assess",
    text: "The assessor scores the practical against anchored criteria, with evidence.",
  },
  {
    name: "Pramaan",
    hi: "प्रमाण",
    gloss: "certify",
    text: "A tamper-evident record that only the assessor signs, verifiable by QR.",
  },
];

export default function Home() {
  return (
    <>
      <JourneyBar />
      <main className="mx-auto max-w-[1100px] px-5 py-14 sm:px-8 lg:py-20">
        <section className="max-w-3xl">
          <h1 className="text-4xl leading-tight font-bold text-balance sm:text-5xl">
            AnubhavPramaan{" "}
            <span className="text-ink-soft block font-semibold sm:inline">अनुभव प्रमाण</span>
          </h1>
          <p className="text-ink-soft mt-5 max-w-[62ch] text-lg leading-relaxed">
            Recognition of Prior Learning for informal workers: speak your experience, get assessed
            fairly, carry a record anyone can verify.
          </p>
          <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
            <Link
              href="/declare"
              className="bg-ink hover:bg-ink/90 rounded-lg px-6 py-3.5 text-center text-base font-semibold text-white transition-colors"
            >
              शुरू करें <span className="font-normal text-white/80">Start a declaration</span>
            </Link>
            <Link
              href="/samaan"
              className="border-line hover:border-ink/40 rounded-lg border px-5 py-3.5 text-center text-base transition-colors"
            >
              Assessor consistency
            </Link>
            <Link
              href="/calibrate"
              className="border-line hover:border-ink/40 rounded-lg border px-5 py-3.5 text-center text-base transition-colors"
            >
              Calibration sets
            </Link>
          </div>
        </section>

        <ol className="border-line mt-16 grid gap-px overflow-hidden rounded-xl border bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.name} className="bg-paper p-5">
              <div className="flex items-center gap-2.5">
                <span className="bg-ink grid size-6 place-items-center rounded-full text-xs font-semibold text-white tabular-nums">
                  {i + 1}
                </span>
                <span className="font-semibold">{s.name}</span>
                <span className="text-ink-soft text-sm">{s.gloss}</span>
              </div>
              <p className="mt-3 text-lg font-semibold">{s.hi}</p>
              <p className="text-ink-soft mt-1 text-sm leading-relaxed">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="text-ink-soft mt-4 text-sm">
          Around all four steps,{" "}
          <Link href="/samaan" className="text-ink underline underline-offset-4">
            Samaan
          </Link>{" "}
          measures how consistently assessors score the same evidence.
        </p>

        <p className="border-decide/40 bg-decide-soft mt-12 flex items-start gap-3 rounded-xl border p-5">
          <ShieldCheck aria-hidden="true" className="text-decide mt-0.5 size-5 shrink-0" />
          <span>
            <span className="font-semibold">The AI suggests; the assessor decides.</span>{" "}
            <span className="text-ink-soft">
              No model output can set a score, a pass or fail, a route or a certificate.
            </span>
          </span>
        </p>
      </main>
    </>
  );
}
