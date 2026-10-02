import type { RouteView } from "./view";

const fmt = (x: number) => `${Math.round(x * 100)}%`;

/**
 * The route suggestion as one bar with NCVET's 70% line drawn on it. Both coverage figures are
 * shown; the one that drives the suggestion is named. Dashed saffron: this is a suggestion.
 */
export function RouteMeter({
  route,
  flatPct,
  weightedPct,
}: {
  route: RouteView;
  flatPct: number;
  weightedPct: number;
}) {
  const direct = route.suggestion === "direct-assessment";
  return (
    <section
      aria-label="Route suggestion"
      className="border-saffron rounded-xl border border-dashed p-5"
    >
      <p className="text-saffron-deep text-sm font-semibold">
        Suggestion, for the assessor to confirm or change
      </p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-5xl font-bold tabular-nums">{fmt(route.pct)}</p>
        <p className="text-lg">
          {direct ? "Direct assessment" : "Upskill first, then assess"}
          <span className="text-ink-soft block text-sm">
            {route.rule === "weighted"
              ? "Coverage weighted by the QP's own NOS weightage and marks"
              : "Share of all performance criteria covered"}
          </span>
        </p>
      </div>
      <div
        className="relative mt-5 h-3 rounded-full bg-[#eef1f6]"
        role="img"
        aria-label={`${fmt(route.pct)} against the 70% threshold`}
      >
        <div
          className={`h-3 rounded-full ${direct ? "bg-ink" : "bg-[#8b93b5]"}`}
          style={{ width: fmt(Math.min(1, route.pct)) }}
        />
        <div
          className="bg-saffron absolute -top-2 h-7 w-0.5"
          style={{ left: fmt(route.threshold) }}
        />
        <span
          className="text-saffron-deep absolute top-5 -translate-x-1/2 text-xs font-semibold"
          style={{ left: fmt(route.threshold) }}
        >
          70%
        </span>
      </div>
      <dl className="text-ink-soft mt-8 grid grid-cols-2 gap-2 text-sm sm:max-w-md">
        <div>
          <dt>Weighted coverage</dt>
          <dd className="text-ink text-base font-semibold tabular-nums">{fmt(weightedPct)}</dd>
        </div>
        <div>
          <dt>Criteria covered (count)</dt>
          <dd className="text-ink text-base font-semibold tabular-nums">{fmt(flatPct)}</dd>
        </div>
      </dl>
      <p className="text-ink-soft mt-3 text-xs">
        NCVET RPL Guidelines (2023): 70% or more of the qualification&apos;s learning outcomes
        allows direct assessment; otherwise upskilling first.
      </p>
    </section>
  );
}
