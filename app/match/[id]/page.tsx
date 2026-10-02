import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverageBoard } from "@/components/milao/coverage-board";
import { DecisionPanel } from "@/components/milao/decision-panel";
import { GapPlan } from "@/components/milao/gap-plan";
import { RouteMeter } from "@/components/milao/route-meter";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { loadPacks } from "@/lib/packs/load";
import { getRecordStore } from "@/lib/store/records";
import { RunMapping } from "./run-mapping";
import { buildView, type MappingRecord } from "./view";
import { JourneyBar } from "@/components/app-shell/journey-bar";

export const dynamic = "force-dynamic";

const pct = (x: number) => `${Math.round(x * 100)}%`;

// Milao (match): the assessor's view of where the worker's own words land in the Qualification
// Pack. Everything the model produced is marked as a suggestion; only the decision panel commits.

export default async function Match({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getRecordStore();
  const decl = await store.get<SelfDeclaration>("declaration", id);
  if (!decl) notFound();
  const record = await store.get<MappingRecord>("mapping", id);
  const packs = loadPacks();
  const view = record ? buildView(decl, record, packs) : null;

  return (
    <>
      <JourneyBar current="milao" />
      <main className="mx-auto max-w-[1360px] px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Qualification match</h1>
            <p className="text-ink-soft mt-1">
              Candidate <span className="text-ink font-mono">{decl.candidateRef}</span>, declared{" "}
              {new Date(decl.consentAt).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {decl.confirmedAt
                ? ", read back and confirmed by the worker"
                : ", not yet confirmed by the worker"}
            </p>
          </div>
          <Link href={`/declare`} className="text-ink-soft text-sm underline underline-offset-4">
            New declaration
          </Link>
        </header>

        {!record && (
          <div className="mt-8">
            <RunMapping declarationId={decl.id} />
          </div>
        )}

        {record && !view && (
          <p className="border-line mt-8 rounded-xl border p-6 text-lg">
            No Qualification Pack is supported by this declaration&apos;s words, so the tool
            suggests none. Ask the worker about their work in more detail, or choose the
            qualification yourself.
          </p>
        )}

        {view && record && (
          <>
            <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
              <div className="grid gap-6">
                <div className="border-saffron rounded-xl border border-dashed p-5">
                  <p className="text-saffron-deep text-sm font-semibold">Suggested qualification</p>
                  <p className="mt-1 text-2xl font-bold">
                    {view.best.title}{" "}
                    <span className="text-ink-soft font-mono text-base font-normal">
                      {view.best.id} v{view.best.version}
                    </span>
                  </p>
                  <p className="text-ink-soft mt-1 text-sm">
                    NSQF level {view.best.nsqfLevel}. {view.model}. Speech:{" "}
                    {view.asrLabels.join("; ") || "typed"}.
                  </p>
                </div>
                <RouteMeter
                  route={view.route}
                  flatPct={view.best.flatPct}
                  weightedPct={view.best.weightedPct}
                />
              </div>
              <DecisionPanel
                declarationId={view.declarationId}
                suggestedQp={view.best.id}
                route={view.route}
                packs={[view.best, ...view.others]}
                decision={view.decision}
              />
            </section>

            <section className="mt-10" aria-labelledby="board-title">
              <h2 id="board-title" className="text-xl font-semibold">
                Where the worker&apos;s words land
              </h2>
              <div className="mt-4">
                <CoverageBoard nos={view.best.nos} />
              </div>
            </section>

            <section className="mt-10">
              <GapPlan nos={view.best.nos} direct={view.route.suggestion === "direct-assessment"} />
            </section>

            <section className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="border-line rounded-xl border p-5">
                <h2 className="font-semibold">Other qualifications considered</h2>
                <ul className="mt-2 grid gap-1 text-sm">
                  {view.others.map((o) => (
                    <li key={o.id}>
                      {o.title}{" "}
                      <span className="text-ink-soft font-mono">
                        {o.id} v{o.version}
                      </span>
                      : {pct(o.weightedPct)} weighted, {pct(o.flatPct)} of criteria
                      {o.status === "deactivated" ? " (deactivated QP, test pack only)" : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-line rounded-xl border p-5 text-sm">
                <h2 className="font-semibold">What the AI did</h2>
                <p className="text-ink-soft mt-2">
                  {record.result.claims.length} claims extracted, each tied to the worker&apos;s
                  exact words; {record.result.ledger.claimsRejected} rejected because their quote
                  was not in the answer; {record.result.ledger.linksDropped} links dropped below 60%
                  confidence. Models:{" "}
                  {record.result.ledger.models.join(", ") || "none (keyword baseline)"}. Every
                  suggestion here is checked by the assessor before it counts.
                </p>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
