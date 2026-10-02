import Link from "next/link";
import { notFound } from "next/navigation";
import { AssessBoard } from "@/components/parkho/assess-board";
import type { LitePack } from "@/components/parkho/state";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { referencesByPc } from "@/lib/evidence/references";
import type { MappingResult } from "@/lib/mapping/map";
import { getPack } from "@/lib/packs/load";
import { litePack } from "@/lib/packs/lite";
import { getRecordStore } from "@/lib/store/records";
import { JourneyBar } from "@/components/app-shell/journey-bar";

export const dynamic = "force-dynamic";

type MappingRecord = { result?: MappingResult; decision?: { qp: string; route: string } };

/** The worker's own sentences linked to each PC of the decided pack, for the assessor to probe. */
function saidByPc(mapping: MappingRecord, qp: string): Record<string, string[]> {
  const links = mapping.result?.packs.find((p) => p.pack.id === qp)?.links ?? [];
  const out: Record<string, string[]> = {};
  for (const l of links) {
    const quotes = (out[l.pcId] ??= []);
    if (!quotes.includes(l.quote)) quotes.push(l.quote);
  }
  return out;
}

// Parkho (assess): the practical checklist for the qualification the assessor decided on the
// match screen. Nothing here starts until that decision exists.

export default async function Assess({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getRecordStore();
  const decl = await store.get<SelfDeclaration>("declaration", id);
  if (!decl) notFound();
  const mapping = await store.get<MappingRecord>("mapping", id);
  return (
    <>
      <JourneyBar current="parkho" />
      <main className="mx-auto max-w-[1360px] px-5 py-8 sm:px-8">
        <h1 className="text-3xl font-bold">Practical assessment</h1>
        {!mapping?.decision ? (
          <p className="border-line mt-6 rounded-xl border p-6">
            Decide the qualification and route first, on the{" "}
            <Link href={`/match/${id}`} className="underline underline-offset-4">
              match screen
            </Link>
            .
          </p>
        ) : (
          <div className="mt-4">
            <AssessBoard
              declarationId={id}
              candidateRef={decl.candidateRef}
              pack={litePack(getPack(mapping.decision.qp)) as LitePack}
              said={saidByPc(mapping, mapping.decision.qp)}
              linkedBy={mapping.result?.label ?? null}
              references={referencesByPc()}
            />
          </div>
        )}
      </main>
    </>
  );
}
