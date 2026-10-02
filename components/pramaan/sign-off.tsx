"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { atLeast, band as bandOf } from "@/lib/assess/grade";
import { marksForLevel } from "@/lib/assess/scoring";
import { allEvents, enqueue, flush } from "@/lib/offline/outbox";
import { pinKeyHex, signOffProof } from "@/lib/offline/signoff";
import {
  loadState,
  pcMax,
  withinTolerance,
  type AssessState,
  type LitePack,
} from "@/components/parkho/state";

type Rec = "certify" | "partial" | "reassess";
const REC: Record<Rec, string> = {
  certify: "Certify",
  partial: "Partial credit with a bridge plan",
  reassess: "Reassess",
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

// What a sync error means for the assessor, and what to do.
const SIGN_ERRORS: Record<string, string> = {
  assessor_not_verified: "the assessor id or PIN was not recognised. Check them and sign again",
  assessor_locked:
    "too many wrong PINs for this assessor. It is kept and tried again in 15 minutes",
  declaration_mismatch: "the signed assessment does not belong to this candidate",
  duplicate_pc: "a criterion was scored twice",
  unknown_pc: "a criterion is not in this qualification",
  reason_required: "a level that differs from the hint needs a reason of 10 or more characters",
  not_ready: "the qualification decision for this candidate is missing on the server",
};
const signError = (code: string) => SIGN_ERRORS[code] ?? code.replace(/_/g, " ");

/** The assessor's public register entry (id and salt), from this tablet or, when online, the server. */
async function loadRegister(id: string): Promise<{ salt: string } | null> {
  try {
    const cached = localStorage.getItem(`ap:assessor:${id}`);
    if (cached) return JSON.parse(cached) as { salt: string };
  } catch {
    // storage blocked: fall through to the network
  }
  if (!navigator.onLine) return null;
  const entry = (await fetch(`/api/assessors/${encodeURIComponent(id)}`).then(
    (r) => (r.ok ? r.json() : null),
    () => null,
  )) as { id: string; salt: string } | null;
  if (!entry) return null;
  try {
    localStorage.setItem(`ap:assessor:${entry.id}`, JSON.stringify(entry));
  } catch {
    // not kept: signing still works while online
  }
  return entry;
}

/**
 * Pramaan: the competency profile from the assessor's own scores, the tool's recommendation as a
 * suggestion, and the sign-off. Sign-off always goes through the outbox, so it works the same with
 * or without the network: the PIN stays on the device and only an HMAC proof is queued.
 */
export function SignOff({
  declarationId,
  candidateRef,
  pack,
  state: liveState,
}: {
  declarationId: string;
  candidateRef: string;
  pack: LitePack;
  /** The checklist's live state; without it (the profile page) the saved state is read once. */
  state?: AssessState;
}) {
  const [saved, setSaved] = useState<AssessState>({ scores: {}, evidence: {} });
  const state = liveState ?? saved;
  const [accepts, setAccepts] = useState(true);
  const [final, setFinal] = useState<Rec>("partial");
  const [reason, setReason] = useState("");
  const [assessorId, setAssessorId] = useState("AS-0142");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // Keep the register entry for this assessor on the tablet, so sign-off works at a camp offline.
  useEffect(() => {
    let live = true;
    const id = assessorId.trim();
    void (id.length >= 3 ? loadRegister(id) : Promise.resolve(null)).then(
      (entry) => live && setReady(Boolean(entry)),
    );
    return () => {
      live = false;
    };
  }, [assessorId]);

  useEffect(() => {
    if (!liveState) setSaved(loadState(declarationId, pack.id));
    // The newest sign-off of this candidate decides what the panel shows: its record, or its error.
    const findLink = () =>
      allEvents(declarationId).then((events) => {
        const last = events.filter((e) => e.kind === "sign-off").at(-1);
        const r = last?.result as { url?: string; error?: string } | undefined;
        if (r?.url) setLink(r.url);
        else if (r?.error) setStatus(`Not signed: ${signError(r.error)}.`);
      });
    void findLink();
    // Back online: send whatever was signed offline, then show the sealed record.
    const onOnline = () => void flush().then(findLink, () => undefined);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // liveState is read once here on purpose: the effect only wires up the stored state and events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declarationId, pack.id]);

  const profile = useMemo(() => {
    const perNos = pack.nos.map((n) => {
      let marks = 0;
      let max = 0;
      let scored = 0;
      // Same rule as the server (lib/assess/scoring.ts): every PC's marks count in the maximum, so
      // a PC not scored yet counts as not shown.
      for (const pc of n.pcs) {
        const e = state.scores[pc.id];
        const m = pcMax(n, pc);
        max += m;
        if (pc.type === "measurement" && e?.reading !== undefined && pc.tolerance) {
          scored += 1;
          marks += withinTolerance(pc.tolerance, e.reading) ? m : 0;
        } else if (pc.type === "judgement" && e?.level !== undefined) {
          scored += 1;
          marks += marksForLevel(e.level, m);
        }
      }
      const p = max > 0 ? marks / max : 0;
      return {
        id: n.id,
        title: n.title,
        weightagePct: n.weightagePct,
        pct: p,
        pass: max > 0 && atLeast(p, pack.passPct / 100),
        scored,
        total: n.pcs.length,
      };
    });
    const total = perNos.reduce((a, n) => a + n.pct * (n.weightagePct / 100), 0);
    const passed = perNos.filter((n) => n.pass).length;
    const recommendation: Rec =
      passed === perNos.length ? "certify" : passed > 0 ? "partial" : "reassess";
    return {
      perNos,
      total,
      band: bandOf(total),
      recommendation,
      scored: perNos.reduce((a, n) => a + n.scored, 0),
    };
  }, [pack, state]);

  async function sign() {
    setBusy(true);
    setStatus(null);
    try {
      const entry = await loadRegister(assessorId.trim());
      if (!entry)
        throw new Error(
          navigator.onLine
            ? "Assessor id not recognised."
            : "This tablet has not loaded the assessor register yet; connect once to sign.",
        );
      const { salt } = entry;
      // Only this qualification's criteria: anything else on the tablet is from another checklist.
      const inPack = new Set(pack.nos.flatMap((n) => n.pcs.map((p) => p.id)));
      const scores = Object.entries(state.scores)
        .filter(
          ([pcId, e]) => inPack.has(pcId) && (e.level !== undefined || e.reading !== undefined),
        )
        .map(([pcId, e]) => ({
          pcId,
          level: e.level,
          reading: e.reading,
          reason: e.reason || undefined,
          hint: e.hint?.map((h) => h.status),
        }));
      if (scores.length === 0) throw new Error("Score at least one criterion before signing.");
      const evidence = Object.entries(state.evidence)
        .filter(([pcId]) => inPack.has(pcId))
        .flatMap(([pcId, items]) =>
          items.map((i) => ({
            pcId,
            sha256: i.sha256,
            dhash: i.dhash,
            capturedAt: i.capturedAt,
            deviceId: i.deviceId,
            lat: i.lat,
            lon: i.lon,
          })),
        );
      const request = {
        declarationId,
        scores,
        evidence,
        decision: accepts
          ? { acceptsRecommendation: true }
          : { acceptsRecommendation: false, final, reason },
        assessorId: assessorId.trim(),
        signedAt: new Date().toISOString(),
      };
      const proof = await signOffProof(
        await pinKeyHex(salt, pin),
        JSON.parse(JSON.stringify(request)),
      );
      const queued = await enqueue({
        kind: "sign-off",
        declarationId,
        payload: { request, proof },
      });
      setPin("");
      if (!navigator.onLine) {
        setStatus("Signed on this device. The record is created when the tablet is back online.");
        return;
      }
      // Read the answer for THIS event only. A flush already running may not include it, so try once
      // more if it is still unsent.
      const mine = async () => (await allEvents(declarationId)).find((e) => e.id === queued.id);
      let reply = (await flush().catch(() => null))?.results[queued.id];
      let ev = await mine();
      if (!ev?.syncedAt && reply === undefined) {
        reply = (await flush().catch(() => null))?.results[queued.id];
        ev = await mine();
      }
      // A stored result is final; a reply that was not stored (the event stays queued) still says why.
      const r = (ev?.result ?? reply) as { url?: string; error?: string } | undefined;
      if (r?.url) setLink(r.url);
      else if (r?.error) setStatus(`Not signed: ${signError(r.error)}.`);
      else setStatus("Queued; it is sent on the next sync.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canSign =
    /^\d{4,8}$/.test(pin) &&
    assessorId.trim().length >= 3 &&
    (accepts || reason.trim().length >= 10);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="border-line rounded-xl border p-5">
        <p className="text-ink-soft text-sm">
          Candidate <span className="text-ink font-mono">{candidateRef}</span>, {pack.title}{" "}
          <span className="font-mono">
            {pack.id} v{pack.version}
          </span>
        </p>
        <h2 className="mt-2 text-lg font-semibold">Competency profile, practical observation</h2>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {profile.perNos.map((n) => (
              <tr key={n.id} className="border-line border-t">
                <td className="py-2 pr-3">
                  <span className="block font-mono text-xs">{n.id}</span>
                  {n.title}
                </td>
                <td className="text-ink-soft py-2 text-right text-xs tabular-nums">
                  {n.scored}/{n.total} scored
                </td>
                <td className="py-2 pl-3 text-right tabular-nums">{n.scored ? pct(n.pct) : "-"}</td>
                <td className="py-2 pl-3 text-right">
                  {n.scored ? (n.pass ? "Met" : "Not yet") : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-ink-soft mt-3 text-xs">
          A NOS is met at {pack.passPct}% (the QP also states a 50% aggregate; the awarding body
          confirms which applies). Total {pct(profile.total)}, weighted by the QP&apos;s NOS
          weightage. PMKVY 4.0 band {profile.band}. The server recomputes all of this from your
          scores at sign-off.
        </p>
      </section>

      <section className="grid content-start gap-4">
        <div className="border-saffron rounded-xl border border-dashed p-5">
          <p className="text-saffron-deep text-sm font-semibold">
            Tool&apos;s recommendation (a suggestion)
          </p>
          <p className="mt-1 text-xl font-bold">{REC[profile.recommendation]}</p>
        </div>
        {link ? (
          <div className="border-decide bg-decide-soft rounded-xl border-2 p-5">
            <p className="text-decide font-semibold">Signed. The record is sealed.</p>
            <Link href={link} className="mt-2 inline-block underline underline-offset-4">
              Open the verifiable record
            </Link>
          </div>
        ) : (
          <div className="border-line rounded-xl border p-5">
            <h2 className="text-lg font-semibold">Your decision and sign-off</h2>
            <fieldset className="mt-3 grid gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={accepts} onChange={() => setAccepts(true)} /> Accept
                the recommendation
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!accepts} onChange={() => setAccepts(false)} /> Change
                it
              </label>
            </fieldset>
            {!accepts && (
              <div className="mt-3 grid gap-2 text-sm">
                <select
                  value={final}
                  onChange={(e) => setFinal(e.target.value as Rec)}
                  className="border-line rounded-lg border px-3 py-2"
                >
                  {(Object.keys(REC) as Rec[]).map((r) => (
                    <option key={r} value={r}>
                      {REC[r]}
                    </option>
                  ))}
                </select>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Reason (at least 10 characters)"
                  className="border-line rounded-lg border px-3 py-2"
                />
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <label>
                Assessor ID
                <input
                  value={assessorId}
                  onChange={(e) => setAssessorId(e.target.value)}
                  className="border-line mt-1 block w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label>
                PIN
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  className="border-line mt-1 block w-full rounded-lg border px-3 py-2"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!canSign || busy}
              onClick={sign}
              className="bg-decide mt-4 w-full rounded-lg px-5 py-3 font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Signing..." : "Sign with my PIN"}
            </button>
            <p className="text-ink-soft mt-2 text-xs">
              {ready
                ? "Assessor register on this tablet: signing works offline."
                : "Connect once to load the assessor register; then signing works offline."}
            </p>
            {status && <p className="mt-3 text-sm">{status}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
