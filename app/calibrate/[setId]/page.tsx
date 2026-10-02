import Link from "next/link";
import { notFound } from "next/navigation";
import { CalibrateBoard, type CalibrationItemView } from "@/components/samaan/calibrate-board";
import { calibrationSet } from "@/lib/calibration/sets";
import { getPack } from "@/lib/packs/load";
import { allPcs } from "@/lib/packs/schema";

export const dynamic = "force-dynamic";

// One rater scores a whole calibration set in one condition. The condition comes from the link the
// facilitator gives (the protocol's crossover decides it, not the rater). The page only carries
// what that condition may show: an unaided rater's page has no anchors, observables or hints in it.

export default async function CalibrateSet({
  params,
  searchParams,
}: {
  params: Promise<{ setId: string }>;
  searchParams: Promise<{ condition?: string }>;
}) {
  const { setId } = await params;
  const { condition: asked } = await searchParams;
  const set = calibrationSet(setId);
  if (!set) notFound();
  const condition = asked === "assisted" ? "assisted" : "unaided";
  const pcs = new Map(allPcs(getPack(set.qp)).map((pc) => [pc.id, pc]));
  const items: CalibrationItemView[] = set.items.map((item) => ({
    id: item.id,
    image: item.image,
    credit: item.credit,
    pcs: item.pcs.map((id) => {
      const pc = pcs.get(id)!;
      return condition === "assisted"
        ? {
            id,
            code: pc.code,
            text: pc.text,
            anchors: pc.anchors,
            observables: pc.observables,
            hints: item.hints?.[id],
          }
        : { id, code: pc.code, text: pc.text };
    }),
  }));
  return (
    <main className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
      <Link href="/calibrate" className="text-ink-soft text-sm">
        Calibration sets
      </Link>
      <h1 className="mt-1 text-3xl font-bold">{set.title}</h1>
      <p className="text-ink-soft mt-1 text-sm">
        {condition === "unaided"
          ? "Unaided: the criterion and the 0 to 3 scale only."
          : set.hintSource
            ? `Assisted: the criterion's anchors, what to check, and hints frozen before scoring (${set.hintSource}).`
            : "Assisted: the criterion's anchors and what to check. This set has no hints: none were frozen for it."}
      </p>
      <CalibrateBoard setId={set.id} condition={condition} items={items} />
    </main>
  );
}
