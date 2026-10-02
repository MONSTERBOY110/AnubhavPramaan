import Link from "next/link";

/** The four steps every candidate passes through, in order, plus the consistency loop. */
export type JourneyStep = "bolo" | "milao" | "parkho" | "pramaan" | "samaan";

const FLOW = [
  { id: "bolo", name: "Bolo", hi: "बोलो", gloss: "speak" },
  { id: "milao", name: "Milao", hi: "मिलाओ", gloss: "match" },
  { id: "parkho", name: "Parkho", hi: "परखो", gloss: "assess" },
  { id: "pramaan", name: "Pramaan", hi: "प्रमाण", gloss: "certify" },
] as const;

const LOOP = { id: "samaan", name: "Samaan", hi: "समान", gloss: "consistency" } as const;

/** The product mark: a sealed record (ink square) with the assessor's tick (saffron). */
function Mark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7 shrink-0">
      <rect x="1" y="1" width="22" height="22" rx="6" className="fill-ink" />
      <path
        d="M7 12.5l3.2 3.2L17.5 8.4"
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-saffron"
      />
    </svg>
  );
}

/**
 * Shared top bar: the wordmark and where this screen sits in the candidate's journey. Steps are
 * position markers, not links, because each step needs a candidate id the bar does not know.
 */
export function JourneyBar({ current }: { current?: JourneyStep }) {
  const index = FLOW.findIndex((s) => s.id === current);
  const here = index >= 0 ? FLOW[index] : current === "samaan" ? LOOP : null;

  return (
    <header className="border-line bg-paper border-b">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-6 px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md"
          aria-label="AnubhavPramaan home"
        >
          <Mark />
          <span className="text-lg leading-none font-bold">अनुभव प्रमाण</span>
          <span className="text-ink-soft hidden text-sm leading-none md:inline">
            AnubhavPramaan
          </span>
        </Link>

        <nav aria-label="Assessment journey" className="hidden lg:block">
          <ol className="flex items-center gap-1">
            {FLOW.map((s, i) => {
              const isCurrent = s.id === current;
              const isDone = index > i;
              return (
                <li key={s.id} className="flex items-center gap-1">
                  <span
                    aria-current={isCurrent ? "step" : undefined}
                    className={`relative flex items-baseline gap-2 rounded-md px-3 py-2 text-sm ${
                      isCurrent ? "text-ink" : isDone ? "text-ink" : "text-ink-soft"
                    }`}
                  >
                    <span
                      className={`grid size-5 place-items-center self-center rounded-full text-[11px] font-semibold tabular-nums ${
                        isCurrent
                          ? "bg-saffron text-ink"
                          : isDone
                            ? "bg-ink text-white"
                            : "border-line border"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className={isCurrent ? "font-semibold" : undefined}>{s.name}</span>
                    <span className="text-ink-soft text-xs">{s.gloss}</span>
                    {isCurrent && (
                      <span
                        aria-hidden="true"
                        className="bg-saffron absolute inset-x-3 -bottom-[13px] h-[3px] rounded-full"
                      />
                    )}
                  </span>
                  {i < FLOW.length - 1 && <span aria-hidden="true" className="bg-line h-px w-4" />}
                </li>
              );
            })}
            <li aria-hidden="true" className="bg-line mx-3 h-6 w-px" />
            <li>
              <span
                aria-current={current === "samaan" ? "step" : undefined}
                className={`relative flex items-baseline gap-2 rounded-md px-3 py-2 text-sm ${
                  current === "samaan" ? "text-ink font-semibold" : "text-ink-soft"
                }`}
              >
                {LOOP.name}
                <span className="text-ink-soft text-xs font-normal">{LOOP.gloss}</span>
                {current === "samaan" && (
                  <span
                    aria-hidden="true"
                    className="bg-saffron absolute inset-x-3 -bottom-[13px] h-[3px] rounded-full"
                  />
                )}
              </span>
            </li>
          </ol>
        </nav>

        {here && (
          <p className="text-ink-soft text-sm whitespace-nowrap lg:hidden">
            {index >= 0 ? (
              <>
                Step <span className="tabular-nums">{index + 1}</span> of {FLOW.length}:{" "}
              </>
            ) : null}
            <span className="text-ink font-semibold">{here.hi}</span> {here.name}
          </p>
        )}
      </div>
    </header>
  );
}
