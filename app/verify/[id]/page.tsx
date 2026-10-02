import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { verifyRecord, type CertRecord } from "@/lib/cert/record";
import { getPack } from "@/lib/packs/load";
import { getRecordStore } from "@/lib/store/records";
import type { IntegrityReport } from "@/lib/integrity/checks";
import { JourneyBar } from "@/components/app-shell/journey-bar";

export const dynamic = "force-dynamic";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const REC = {
  certify: "Certify",
  partial: "Partial credit with a bridge plan",
  reassess: "Reassess",
} as const;

// Public verification page (TRD M6): recomputes the event chain and the record hash from the stored
// record on every view. Anyone with the link or the QR code can check that nothing was changed.

export default async function Verify({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getRecordStore().get<CertRecord>("certificate", id);
  if (!record) notFound();
  const check = await verifyRecord(record);
  const pack = getPack(record.pack.id);
  const titles = new Map(pack.nos.map((n) => [n.id, n.title]));
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${base.replace(/\/$/, "")}/verify/${record.id}`;
  const qr = await QRCode.toString(url, {
    type: "svg",
    margin: 0,
    color: { dark: "#1b2559", light: "#ffffff" },
  });

  return (
    <>
      <JourneyBar current="pramaan" />
      <main className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
        <div className="mt-2 flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold">Assessment record</h1>
            <p className="text-ink-soft mt-1">
              Candidate <span className="text-ink font-mono">{record.candidateRef}</span>,{" "}
              {record.pack.title}{" "}
              <span className="font-mono">
                {record.pack.id} v{record.pack.version}
              </span>
              , NSQF level {record.pack.nsqfLevel}
            </p>
          </div>
          <div
            className="size-28 shrink-0"
            aria-label="QR code for this page"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        </div>

        <section
          className={`mt-6 rounded-xl border-2 p-5 ${check.valid ? "border-ink" : "border-alert bg-alert-soft"}`}
          aria-live="polite"
        >
          <p className={`text-2xl font-bold ${check.valid ? "" : "text-alert"}`}>
            {check.valid ? "Record intact" : "Record has been changed"}
          </p>
          <p className="text-ink-soft mt-1 text-sm">
            Event chain {check.chainOk ? "matches" : "does not match"} ({record.chain.count}{" "}
            events); record hash {check.hashOk ? "matches" : "does not match"}. Both are recomputed
            from this record now, on this page.
          </p>
          {record.demo && (
            <p className="text-saffron-deep mt-2 text-sm font-semibold">
              Signed by the prototype&apos;s demo assessor: not a real certification.
            </p>
          )}
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="border-line rounded-xl border p-5">
            <h2 className="text-lg font-semibold">Competency profile, practical observation</h2>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {record.profile.perNos.map((n) => (
                  <tr key={n.nosId} className="border-line border-t">
                    <td className="py-2 pr-3">
                      <span className="block font-mono text-xs">{n.nosId}</span>
                      {titles.get(n.nosId)}
                      {!n.complete && n.scored !== undefined && n.total !== undefined && (
                        <span className="text-ink-soft block text-xs">
                          {n.scored} of {n.total} criteria scored; the rest count as not shown
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{pct(n.pct)}</td>
                    <td
                      className={`py-2 pl-3 text-right whitespace-nowrap ${n.pass ? "font-semibold" : "text-ink-soft"}`}
                    >
                      {n.pass ? "Met" : "Not yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-ink-soft mt-3 text-xs">
              A NOS is met at {pct(record.profile.passMark)}. Total {pct(record.profile.totalPct)}{" "}
              weighted by the QP&apos;s NOS weightage; PMKVY 4.0 band {record.profile.band}.
            </p>
          </div>
          <div className="border-decide bg-decide-soft order-first self-start rounded-xl border-2 p-5 md:order-none">
            <p className="text-decide text-sm font-semibold">
              Decided by assessor {record.assessor.id}
            </p>
            <p className="mt-1 text-xl font-bold">{REC[record.decision.final]}</p>
            <p className="text-ink-soft mt-1 text-sm">
              {record.decision.acceptsRecommendation
                ? "Accepted the tool's recommendation."
                : `Changed the tool's recommendation (${REC[record.profile.recommendation]}). Reason: ${record.decision.reason}`}
            </p>
            <p className="text-ink-soft mt-2 text-xs">
              {record.assessor.agency}, signed{" "}
              {new Date(record.assessor.signedAt).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
        </section>

        <section className="border-line mt-6 rounded-xl border p-5">
          <h2 className="text-lg font-semibold">
            What the tool suggested and what the assessor decided
          </h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-ink-soft text-left text-xs">
                <th className="font-medium">Step</th>
                <th className="font-medium">Tool suggested</th>
                <th className="font-medium">Assessor decided</th>
              </tr>
            </thead>
            <tbody>
              {record.aiLedger.map((l, i) => (
                <tr key={i} className="border-line border-t">
                  <td className="py-1.5 pr-3">{l.step}</td>
                  <td className="py-1.5 pr-3">{l.suggested}</td>
                  <td className="py-1.5">{l.decided}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-ink-soft mt-3 text-sm">{record.boundary}</p>
        </section>

        {record.integrity && (
          <IntegrityChecks
            report={record.integrity}
            photos={record.evidence.length}
            assessorId={record.assessor.id}
          />
        )}

        <section className="text-ink-soft mt-6 grid gap-1 text-xs">
          <p>
            {record.evidence.length} evidence items held as SHA-256 hashes; {record.scores.length}{" "}
            criteria scored. Speech, photos and video are not stored in this record.
          </p>
          <p className="font-mono break-all">record hash {record.recordHash}</p>
          <p className="font-mono break-all">chain head {record.chain.head}</p>
        </section>
      </main>
    </>
  );
}

const TRAVEL: Record<IntegrityReport["travel"], string> = {
  checked:
    "Travel: consistent with the assessor's previous session (no more than 120 km/h between them).",
  "no-place": "Travel: not checked, because no place was recorded for this session.",
  "first-session":
    "Travel: first session with a place on record for this assessor, nothing to compare.",
};

/** Automatic checks run at sign-off. They flag for review and never change the decision. */
function IntegrityChecks({
  report,
  photos,
  assessorId,
}: {
  report: IntegrityReport;
  photos: number;
  assessorId: string;
}) {
  const reuse = report.flags.filter((f) => f.kind !== "impossible-travel");
  const travel = report.flags.find((f) => f.kind === "impossible-travel");
  return (
    <section className="border-line mt-6 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">Automatic integrity checks at sign-off</h2>
      <p className="text-ink-soft mt-1 text-sm">
        A flag asks for a review. It does not change the assessor&apos;s decision.
      </p>
      <ul className="mt-3 grid gap-1.5 text-sm">
        {reuse.length === 0 ? (
          <li>
            Reused photos: none. {photos} photo{photos === 1 ? "" : "s"} compared with{" "}
            {report.evidenceCompared} stored for other candidates.
          </li>
        ) : (
          reuse.map((f, i) => (
            <li key={i} className="text-alert">
              {f.kind === "same-file"
                ? `Flag: the photo for ${f.pcId} is the same file as a photo stored for another candidate (sha256 ${f.sha256.slice(0, 12)}...).`
                : f.kind === "possible-reused-photo"
                  ? `Flag: the photo for ${f.pcId} looks like a photo stored for another candidate (${f.distance} of 64 bits differ; sha256 ${f.otherSha256.slice(0, 12)}...).`
                  : null}
            </li>
          ))
        )}
        <li className={travel ? "text-alert" : undefined}>
          {travel && travel.kind === "impossible-travel"
            ? `Flag: impossible travel. ${travel.km} km from the assessor's previous session implies ${travel.kmh < 0 ? "no time between them" : `${travel.kmh} km/h`}, above 120 km/h.`
            : TRAVEL[report.travel]}
        </li>
        <li>Assessor identity: {assessorId}, PIN checked at sign-off.</li>
      </ul>
    </section>
  );
}
