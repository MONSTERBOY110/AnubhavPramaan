"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SignOff } from "@/components/pramaan/sign-off";
import { currentPlace, dHashOfImage } from "@/lib/evidence/capture";
import { dropHint, keepPhoto, photo, queueHint, queuedHints } from "@/lib/offline/media";
import { enqueue, flush, pending } from "@/lib/offline/outbox";
import { PcCard } from "./pc-card";
import {
  deviceId,
  loadState,
  saveState,
  type AssessState,
  type LitePack,
  type PcEntry,
} from "./state";

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Downscale a photo to at most 1024 px for the hint request (the hash is of the original file). */
async function downscale(file: Blob): Promise<{ base64: string; mime: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: url.slice(url.indexOf(",") + 1), mime: "image/jpeg" };
}

/** How long a recorded place is put on new photos before it must be recorded again. */
const PLACE_FRESH_MS = 6 * 60 * 60 * 1000;

const withEntry = (s: AssessState, pcId: string, patch: Partial<PcEntry>): AssessState => ({
  ...s,
  scores: { ...s.scores, [pcId]: { ...(s.scores[pcId] ?? {}), ...patch } },
});

/**
 * Parkho: the assessor's practical checklist. Works with the network off: every change is saved
 * on the device and queued in the outbox; photos stay on the device, and a hint asked offline
 * waits in a queue and runs when the network is back.
 */
export function AssessBoard({
  declarationId,
  candidateRef,
  pack,
  said = {},
  linkedBy = null,
  references = {},
}: {
  declarationId: string;
  candidateRef: string;
  pack: LitePack;
  /** The worker's own sentences linked to each PC on the match screen. */
  said?: Record<string, string[]>;
  /** How those links were made (the mapping's label), shown with them. */
  linkedBy?: string | null;
  /** Openly licensed reference photos per PC (public/evidence/ATTRIBUTION.md). */
  references?: Record<string, Array<{ image: string; credit: string }>>;
}) {
  const [state, setState] = useState<AssessState>({ scores: {}, evidence: {} });
  const [nosId, setNosId] = useState(pack.nos[0]!.id);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [placing, setPlacing] = useState(false);
  // Photos of this session in memory, for a device where IndexedDB is unavailable.
  const blobs = useRef(new Map<string, Blob>());

  const refreshQueue = useCallback(
    async () => setQueued((await pending(declarationId)).length),
    [declarationId],
  );

  /** Every state change goes through here, from the latest state, and is saved on the device. */
  const mutate = useCallback(
    (fn: (s: AssessState) => AssessState) =>
      setState((prev) => {
        const next = fn(prev);
        saveState(declarationId, pack.id, next);
        return next;
      }),
    [declarationId, pack.id],
  );

  /** Ask the hint service about one stored photo: "ok", or a message for the assessor. */
  const runHint = useCallback(
    async (pcId: string, sha256: string): Promise<string> => {
      const blob = blobs.current.get(sha256) ?? (await photo(sha256).catch(() => null));
      if (!blob) return "This photo is no longer on this device; take it again to ask for a hint.";
      const scaled = await downscale(blob).catch(() => null);
      if (!scaled)
        return "This photo cannot be read on this device (for example HEIC); take it again as JPEG.";
      const { base64, mime } = scaled;
      const res = await fetch("/api/hints/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qp: pack.id, pcId, image: base64, mime }),
      }).catch(() => null);
      if (!res?.ok) {
        const body = (await res?.json().catch(() => null)) as { message?: string } | null;
        return body?.message ?? "Evidence hints are unavailable right now.";
      }
      const out = (await res.json()) as { hints: PcEntry["hint"] };
      mutate((s) => withEntry(s, pcId, { hint: out.hints, hintQueued: undefined }));
      return "ok";
    },
    [mutate, pack.id],
  );

  /**
   * Run the hints asked while offline, oldest first; stop at the first failure and keep the rest.
   * One run at a time: the browser can fire "online" more than once, and a hint must not be asked
   * (and paid for) twice.
   */
  const queueRunning = useRef(false);
  const runQueue = useCallback(async () => {
    if (!navigator.onLine || queueRunning.current) return;
    queueRunning.current = true;
    try {
      const waiting = await queuedHints(declarationId).catch(() => []);
      for (const q of waiting) {
        const out = await runHint(q.pcId, q.sha256);
        if (out !== "ok") {
          setNote(`Queued hints wait: ${out}`);
          break;
        }
        await dropHint(q.key);
      }
    } finally {
      queueRunning.current = false;
    }
  }, [declarationId, runHint]);

  useEffect(() => {
    setState(loadState(declarationId, pack.id));
    setOnline(navigator.onLine);
    const up = () => {
      setOnline(true);
      void runQueue();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    void refreshQueue();
    void runQueue();
    const timer = setInterval(() => void refreshQueue(), 2000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [declarationId, pack.id, refreshQueue, runQueue]);

  async function setEntry(pcId: string, entry: PcEntry) {
    mutate((s) => ({ ...s, scores: { ...s.scores, [pcId]: entry } }));
    await enqueue({
      kind: "score",
      declarationId,
      payload: {
        pcId,
        level: entry.level ?? null,
        reading: entry.reading ?? null,
        reason: entry.reason ?? null,
      },
    });
    await refreshQueue();
  }

  async function recordPlace() {
    setPlacing(true);
    const place = await currentPlace();
    setPlacing(false);
    if ("error" in place)
      return setNote(
        `Place not recorded: ${place.error}. Photos keep their time and hash without it.`,
      );
    mutate((s) => ({ ...s, place }));
  }

  async function addPhoto(pcId: string, file: File) {
    const [sha256, dhash] = await Promise.all([
      file.arrayBuffer().then(sha256Hex),
      dHashOfImage(file),
    ]);
    // A place older than PLACE_FRESH_MS is not put on a photo: the assessor may have moved on.
    const place =
      state.place && Date.now() - Date.parse(state.place.at) < PLACE_FRESH_MS
        ? state.place
        : undefined;
    blobs.current.set(sha256, file);
    await keepPhoto({ sha256, declarationId, pcId, blob: file }).catch(() => undefined);
    const item = {
      sha256,
      dhash: dhash ?? undefined,
      capturedAt: new Date().toISOString(),
      deviceId: deviceId(),
      lat: place?.lat,
      lon: place?.lon,
      preview: URL.createObjectURL(file),
      name: file.name,
    };
    mutate((s) => ({
      ...s,
      evidence: { ...s.evidence, [pcId]: [...(s.evidence[pcId] ?? []), item] },
    }));
    await enqueue({
      kind: "evidence",
      declarationId,
      payload: {
        pcId,
        sha256,
        dhash: item.dhash,
        capturedAt: item.capturedAt,
        deviceId: item.deviceId,
        lat: item.lat,
        lon: item.lon,
      },
    });
    await refreshQueue();
  }

  async function askHint(pcId: string) {
    const latest = (state.evidence[pcId] ?? []).at(-1);
    if (!latest) return setNote("Add a photo first.");
    if (!navigator.onLine) {
      await queueHint({ declarationId, pcId, sha256: latest.sha256 });
      mutate((s) => withEntry(s, pcId, { hintQueued: true }));
      return;
    }
    const out = await runHint(pcId, latest.sha256);
    if (out !== "ok") setNote(out);
  }

  async function syncNow() {
    try {
      const out = await flush();
      setNote(`Synced ${out.accepted} of ${out.sent} events.`);
    } catch {
      setNote("Sync failed; the events stay on this device.");
    }
    await refreshQueue();
  }

  const nos = pack.nos.find((n) => n.id === nosId)!;
  const scoredIn = (id: string) =>
    pack.nos
      .find((n) => n.id === id)!
      .pcs.filter(
        (p) => state.scores[p.id]?.level !== undefined || state.scores[p.id]?.reading !== undefined,
      ).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-soft text-sm">
          Candidate <span className="text-ink font-mono">{candidateRef}</span>, {pack.title}{" "}
          <span className="font-mono">
            {pack.id} v{pack.version}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
          {state.place ? (
            <span className="text-ink-soft flex items-center gap-2 tabular-nums">
              <span title="Rounded to about 1 km; used only for the travel check">
                Place {state.place.lat.toFixed(2)}, {state.place.lon.toFixed(2)}
              </span>
              <button
                type="button"
                onClick={recordPlace}
                disabled={placing}
                className="underline underline-offset-4 disabled:opacity-50"
              >
                {placing ? "Reading..." : "Record again"}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={recordPlace}
              disabled={placing}
              className="border-line rounded-lg border px-3 py-1 disabled:opacity-50"
            >
              {placing ? "Reading place..." : "Record place"}
            </button>
          )}
          <span
            className={`rounded-full px-3 py-1 ${online ? "bg-paper-soft" : "bg-alert-soft text-alert"}`}
          >
            {online ? "Online" : "Offline: saving on this device"}
          </span>
          <span className="text-ink-soft tabular-nums">{queued} waiting to sync</span>
          {online && queued > 0 && (
            <button
              type="button"
              onClick={syncNow}
              className="border-line rounded-lg border px-3 py-1"
            >
              Sync now
            </button>
          )}
        </div>
      </div>
      {note && <p className="bg-paper-soft mt-3 rounded-lg px-4 py-2 text-sm">{note}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Below the large breakpoint (a tablet held upright) the NOS list is one row that
            scrolls sideways, so the first criterion stays on the first screen. */}
        <nav
          aria-label="NOS"
          className="flex gap-2 overflow-x-auto pb-2 lg:grid lg:content-start lg:gap-1 lg:overflow-visible lg:pb-0"
        >
          {pack.nos.map((n) => {
            const done = scoredIn(n.id);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setNosId(n.id)}
                aria-current={n.id === nosId}
                className={`w-56 shrink-0 rounded-lg px-3 py-2 text-left text-sm lg:w-auto lg:shrink ${n.id === nosId ? "bg-ink text-white" : "border-line hover:bg-paper-soft border lg:border-0"}`}
              >
                <span className="block font-mono text-xs opacity-80">{n.id}</span>
                <span className="line-clamp-2 leading-snug lg:line-clamp-none">{n.title}</span>
                <span className="block text-xs tabular-nums opacity-80">
                  {done} of {n.pcs.length} scored
                </span>
              </button>
            );
          })}
        </nav>
        <section aria-label={nos.title} className="grid gap-4">
          {nos.pcs.map((pc) => (
            <PcCard
              key={pc.id}
              nos={nos}
              pc={pc}
              entry={state.scores[pc.id] ?? {}}
              evidence={state.evidence[pc.id] ?? []}
              said={said[pc.id] ?? []}
              linkedBy={linkedBy}
              references={references[pc.id] ?? []}
              online={online}
              onChange={(e) => void setEntry(pc.id, e)}
              onPhoto={(f) => void addPhoto(pc.id, f)}
              onHint={() => askHint(pc.id)}
            />
          ))}
          {!signing && (
            <button
              type="button"
              onClick={() => setSigning(true)}
              className="bg-ink mt-2 w-fit rounded-lg px-5 py-3 font-semibold text-white"
            >
              Continue to profile and sign-off
            </button>
          )}
        </section>
      </div>
      {signing && (
        // Same page, no navigation: sign-off must work with the network off.
        <section className="mt-10" aria-label="Profile and sign-off">
          <h2 className="mb-4 text-2xl font-bold">Profile and sign-off</h2>
          <SignOff
            declarationId={declarationId}
            candidateRef={candidateRef}
            pack={pack}
            state={state}
          />
        </section>
      )}
    </div>
  );
}
