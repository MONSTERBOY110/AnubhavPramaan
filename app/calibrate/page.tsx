import Link from "next/link";
import { agreementFor, MIN_RATERS } from "@/lib/calibration/agreement";
import { CONDITIONS, units, type Submission } from "@/lib/calibration/schema";
import { calibrationSets } from "@/lib/calibration/sets";
import { getRecordStore } from "@/lib/store/records";
import { JourneyBar } from "@/components/app-shell/journey-bar";

export const dynamic = "force-dynamic";

const f2 = (x: number | null) => (x === null ? "not defined" : x.toFixed(2));

// Calibration sets (PRD R12): assessors score the same photos without the tool's aids or with
// them, and agreement is computed from their real scores only. Nothing is shown until at least
// MIN_RATERS people have scored a condition; no rater is ever simulated.

export default async function Calibrate() {
  const store = getRecordStore();
  const sets = await Promise.all(
    calibrationSets().map(async (set) => ({
      set,
      subs: (await store.get<Submission[]>("calibration", set.id)) ?? [],
    })),
  );
  return (
    <>
      <JourneyBar current="samaan" />
      <main className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
        <h1 className="text-3xl font-bold">Calibration sets</h1>
        <p className="text-ink-soft mt-2 max-w-3xl">
          Assessors score the same photos of work, either unaided or with the tool&apos;s anchors
          (and hints, where a set has them frozen), and the agreement between them is computed here
          from their own scores. Nothing is shown for a condition until {MIN_RATERS} people have
          scored it. The full study is fixed in advance in the public study protocol.
        </p>
        {sets.length === 0 ? (
          <p className="border-line mt-6 rounded-xl border p-6">
            No calibration set yet: its photos are openly licensed images still under licence
            review.
          </p>
        ) : (
          sets.map(({ set, subs }) => (
            <section
              key={set.id}
              className="border-line mt-6 rounded-xl border p-5"
              aria-label={set.title}
            >
              <h2 className="text-xl font-semibold">{set.title}</h2>
              <p className="text-ink-soft mt-1 text-sm">
                {set.note} {set.items.length} photos, {units(set).length} criteria to score, pack{" "}
                {set.qp}.
              </p>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-ink-soft text-left text-xs">
                    <th className="font-medium">Condition</th>
                    <th className="font-medium">Raters</th>
                    <th className="font-medium">Krippendorff&apos;s alpha (ordinal)</th>
                    <th className="font-medium">Fleiss&apos; kappa (met or not)</th>
                    <th className="font-medium">Median time per photo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {CONDITIONS.map((condition) => {
                    const a = agreementFor(set, subs, condition);
                    const waiting = a.raters < MIN_RATERS;
                    return (
                      <tr key={condition} className="border-line border-t">
                        <td className="py-2 pr-3">
                          {condition === "unaided" ? "Unaided" : "Assisted"}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{a.raters}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {waiting
                            ? `waiting for raters (${a.raters} of ${MIN_RATERS})`
                            : f2(a.alpha)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{waiting ? "" : f2(a.kappa)}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {a.medianSecondsPerItem === null
                            ? ""
                            : `${Math.round(a.medianSecondsPerItem)} s`}
                        </td>
                        <td className="py-2 text-right">
                          <Link
                            href={`/calibrate/${set.id}?condition=${condition}`}
                            className="underline underline-offset-4"
                          >
                            Score {condition}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-ink-soft mt-3 text-xs">
                Live calibration data from real raters only, labelled with the number of raters. Not
                a study result until the pre-registered study runs.
              </p>
            </section>
          ))
        )}
      </main>
    </>
  );
}
