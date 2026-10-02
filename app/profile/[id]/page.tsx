import Link from "next/link";
import { notFound } from "next/navigation";
import type { LitePack } from "@/components/parkho/state";
import { SignOff } from "@/components/pramaan/sign-off";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { getPack } from "@/lib/packs/load";
import { litePack } from "@/lib/packs/lite";
import { getRecordStore } from "@/lib/store/records";
import { JourneyBar } from "@/components/app-shell/journey-bar";

export const dynamic = "force-dynamic";

type MappingRecord = { decision?: { qp: string } };

// Pramaan (certify): profile, recommendation and the assessor's PIN sign-off.

export default async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getRecordStore();
  const decl = await store.get<SelfDeclaration>("declaration", id);
  if (!decl) notFound();
  const mapping = await store.get<MappingRecord>("mapping", id);
  return (
    <>
      <JourneyBar current="pramaan" />
      <main className="mx-auto max-w-[1360px] px-5 py-8 sm:px-8">
        <Link href={`/assess/${id}`} className="text-ink-soft text-sm">
          Back to the practical checklist
        </Link>
        <h1 className="text-3xl font-bold">Profile and sign-off</h1>
        <div className="mt-6">
          {mapping?.decision ? (
            <SignOff
              declarationId={id}
              candidateRef={decl.candidateRef}
              pack={litePack(getPack(mapping.decision.qp)) as LitePack}
            />
          ) : (
            <p className="border-line rounded-xl border p-6">
              Decide the qualification and route first.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
