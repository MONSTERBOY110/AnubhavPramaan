import Link from "next/link";
import fleissData from "@/data/reference/fleiss-1971-diagnoses.json";
import alphaData from "@/data/reference/krippendorff-2011-alpha.json";
import iccData from "@/data/reference/shrout-fleiss-1979-icc.json";
import {
  bootstrapCI,
  fleissKappa,
  intraclassCorrelations,
  krippendorffAlpha,
  strictnessIndex,
  type AlphaMetric,
} from "@/lib/agreement";
import { JourneyBar } from "@/components/app-shell/journey-bar";

// Samaan (consistency): the agreement engine shown on PUBLISHED REFERENCE DATA. Each panel computes
// the statistic with the same code the assessor study will use and prints the published value next
// to it. These datasets are not assessments of workers; the with-versus-without assessor study is
// fixed in advance in docs/STUDY-PROTOCOL.md and runs on the ministry's dummy data.

export const dynamic = "force-static";

const f3 = (x: number) => x.toFixed(3);
const f2 = (x: number) => x.toFixed(2);

export default function Samaan() {
  // Fleiss (1971): 30 patients, 6 psychiatrists each, 5 categories.
  const counts = fleissData.counts as number[][];
  const fleiss = fleissKappa(counts);
  const fleissCi = bootstrapCI(counts, (rows) => fleissKappa(rows).kappa, {
    resamples: 2000,
    seed: 20261002,
  });

  // Shrout and Fleiss (1979): 6 targets rated by 4 judges.
  const ratings = iccData.ratings as number[][];
  const icc = intraclassCorrelations(ratings);
  const iccCi = bootstrapCI(ratings, (rows) => intraclassCorrelations(rows).icc["2,1"], {
    resamples: 2000,
    seed: 20261002,
  });
  const strict = strictnessIndex(ratings);

  // Krippendorff (2011), example C: 4 observers, 12 units, missing values.
  const ex = alphaData.examples.C as unknown as {
    data: (number | null)[][];
    expected: { alpha: Record<AlphaMetric, number> };
  };
  const unitsByRaters = ex.data[0]!.map((_, u) => ex.data.map((row) => row[u] ?? null));
  const metrics: AlphaMetric[] = ["nominal", "ordinal", "interval", "ratio"];
  const alphas = metrics.map((m) => ({
    m,
    ours: krippendorffAlpha(unitsByRaters, m).alpha,
    published: ex.expected.alpha[m],
  }));

  const maxStrict = Math.max(...strict.map((s) => Math.abs(s.index)));

  return (
    <>
      <JourneyBar current="samaan" />
      <main className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8">
        <h1 className="text-3xl font-bold">Samaan: consistency between assessors</h1>
        <p className="text-ink-soft mt-2 max-w-3xl">
          The agreement engine on published reference data. Each figure is computed by the same code
          the assessor study uses and printed next to the value its source publishes. These datasets
          are not assessments of workers.
        </p>

        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <Panel
            title="Fleiss' kappa, many raters"
            source="Fleiss (1971), Psychological Bulletin 76(5): 30 patients, 6 psychiatrists each, 5 diagnoses"
            note="Checked against reproductions of the paper (R irr, statsmodels); the 1971 original is paywalled."
          >
            <Big
              value={f3(fleiss.kappa)}
              label="kappa, all categories"
              published={`${fleissData.expected.kappaPrinted.value} (printed), ${fleissData.expected.kappaUnrounded.value} (unrounded)`}
            />
            <p className="text-ink-soft mt-2 text-xs tabular-nums">
              95% bootstrap interval over patients: {f2(fleissCi.lower)} to {f2(fleissCi.upper)} (
              {fleissCi.valid} of {fleissCi.resamples} resamples, seed {fleissCi.seed})
            </p>
            <ul className="mt-4 grid gap-1.5 text-sm">
              {(fleissData.categories as string[]).map((c, i) => (
                <li key={c} className="flex items-center gap-3">
                  <span className="w-40 shrink-0">{c}</span>
                  <span className="bg-paper-soft h-2 flex-1 rounded-full">
                    <span
                      className="bg-ink block h-2 rounded-full"
                      style={{ width: `${Math.max(0, fleiss.categoryKappas[i]!) * 100}%` }}
                    />
                  </span>
                  <span className="w-24 text-right tabular-nums">
                    {f3(fleiss.categoryKappas[i]!)}{" "}
                    <span className="text-ink-soft">
                      / {fleissData.expected.categoryKappas.values[i]!.toFixed(3)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-ink-soft mt-2 text-xs">Ours / published, per category.</p>
          </Panel>

          <Panel
            title="Intraclass correlation on totals"
            source="Shrout and Fleiss (1979), Psychological Bulletin 86(2), Tables 2 to 4: 6 targets, 4 judges"
          >
            <Big
              value={f2(icc.icc["2,1"])}
              label="ICC(2,1), two-way random, absolute agreement"
              published={f2(iccData.expected.icc.values["2,1"])}
            />
            <p className="text-ink-soft mt-2 text-xs tabular-nums">
              95% bootstrap interval over targets: {f2(iccCi.lower)} to {f2(iccCi.upper)} (
              {iccCi.valid} of {iccCi.resamples} resamples)
            </p>
            <table className="mt-4 w-full text-sm tabular-nums">
              <thead>
                <tr className="text-ink-soft text-left text-xs">
                  <th className="font-medium">Form</th>
                  <th className="text-right font-medium">Ours</th>
                  <th className="text-right font-medium">Published</th>
                </tr>
              </thead>
              <tbody>
                {(["1,1", "2,1", "3,1", "1,k", "2,k", "3,k"] as const).map((form) => (
                  <tr key={form} className="border-line border-t">
                    <td className="py-1">ICC({form.replace("k", "4")})</td>
                    <td className="text-right">{f2(icc.icc[form])}</td>
                    <td className="text-right">{f2(iccData.expected.icc.values[form])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel
            title="Krippendorff's alpha, missing data allowed"
            source="Krippendorff (2011), Computing Krippendorff's Alpha-Reliability, example C: 4 observers, 12 units"
          >
            <Big
              value={f3(alphas[1]!.ours)}
              label="alpha, ordinal (the 0 to 3 rubric levels use this)"
              published={f3(alphas[1]!.published)}
            />
            <table className="mt-4 w-full text-sm tabular-nums">
              <thead>
                <tr className="text-ink-soft text-left text-xs">
                  <th className="font-medium">Metric</th>
                  <th className="text-right font-medium">Ours</th>
                  <th className="text-right font-medium">Published</th>
                </tr>
              </thead>
              <tbody>
                {alphas.map((a) => (
                  <tr key={a.m} className="border-line border-t">
                    <td className="py-1 capitalize">{a.m}</td>
                    <td className="text-right">{f3(a.ours)}</td>
                    <td className="text-right">{f3(a.published)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </section>

        <section className="border-line mt-8 rounded-xl border p-6">
          <h2 className="text-xl font-semibold">Strictness index per rater</h2>
          <p className="text-ink-soft mt-1 max-w-3xl text-sm">
            On each item, a rater&apos;s score minus the mean of the other raters, averaged. Above
            zero: scores higher than colleagues; below zero: stricter. Shown here on the four judges
            of Shrout and Fleiss (1979); in use, it shows an agency which assessor to calibrate
            first. It never changes a score.
          </p>
          <div className="mt-5 grid max-w-3xl gap-3">
            {strict.map((s) => {
              const w = maxStrict > 0 ? (Math.abs(s.index) / maxStrict) * 50 : 0;
              return (
                <div key={s.rater} className="flex items-center gap-4 text-sm">
                  <span className="w-20 shrink-0">Judge {s.rater + 1}</span>
                  <div className="bg-paper-soft relative h-3 flex-1 rounded-full">
                    <span className="bg-line absolute top-0 left-1/2 h-3 w-px" />
                    <span
                      className={`absolute top-0 h-3 rounded-full ${s.index >= 0 ? "bg-saffron" : "bg-ink"}`}
                      style={
                        s.index >= 0
                          ? { left: "50%", width: `${w}%` }
                          : { right: "50%", width: `${w}%` }
                      }
                    />
                  </div>
                  <span className="w-32 text-right tabular-nums">
                    {s.index >= 0 ? "+" : ""}
                    {f2(s.index)} points
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <p className="text-ink-soft mt-8 max-w-3xl text-sm">
          Does assistance improve agreement? That is measured only in the with-versus-without
          assessor study, fixed in advance in docs/STUDY-PROTOCOL.md, on the ministry&apos;s dummy
          assessment data. The figures above show only that the engine computes each statistic
          correctly.
        </p>
        <p className="mt-3 max-w-3xl text-sm">
          <Link href="/calibrate" className="underline underline-offset-4">
            Calibration sets
          </Link>
          : assessors score the same photos, unaided or with the tool&apos;s anchors, and the same
          engine computes their agreement from their own scores once two people have scored.
        </p>
      </main>
    </>
  );
}

function Panel({
  title,
  source,
  note,
  children,
}: {
  title: string;
  source: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line rounded-xl border p-5">
      <p className="text-ink-soft text-xs font-semibold">Reference data</p>
      <h2 className="mt-1 text-lg font-semibold">{title}</h2>
      <p className="text-ink-soft mt-1 text-xs">{source}</p>
      {note && <p className="text-saffron-deep mt-1 text-xs">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Big({ value, label, published }: { value: string; label: string; published: string }) {
  return (
    <div>
      <p className="text-4xl font-bold tabular-nums">{value}</p>
      <p className="text-sm">{label}</p>
      <p className="text-ink-soft text-xs">Published: {published}</p>
    </div>
  );
}
