"use client";

// The assessor tablet's outbox (TRD M8): every action is an event with a client-made id, kept in
// IndexedDB until the server has accepted it. Events are append-only, so syncing twice is harmless:
// the server ignores ids it has already seen. No dependency: a few lines over the IndexedDB API.

export type OutboxEvent = {
  id: string;
  kind: "score" | "evidence" | "sign-off";
  declarationId: string;
  createdAt: string;
  payload: unknown;
  syncedAt?: string;
  /** What the server answered for this event (for sign-off: the record id and link). */
  result?: unknown;
};

const DB = "anubhavpramaan";
const STORE = "outbox";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export function newEventId(): string {
  return `ev-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)}`;
}

/** Events per request to /api/sync (the server takes at most 200). */
const BATCH = 100;

export async function enqueue(
  event: Omit<OutboxEvent, "id" | "createdAt"> & { id?: string },
): Promise<OutboxEvent> {
  const full: OutboxEvent = {
    ...event,
    id: event.id ?? newEventId(),
    createdAt: new Date().toISOString(),
  };
  // A score typed key by key queues one event per keystroke. Unsent score events for the same
  // criterion are replaced by the newest, so a long day offline stays a short queue.
  if (full.kind === "score") {
    const pcId = (full.payload as { pcId?: string } | null)?.pcId;
    const stale = (await pending(full.declarationId)).filter(
      (e) => e.kind === "score" && (e.payload as { pcId?: string } | null)?.pcId === pcId,
    );
    for (const e of stale) await tx("readwrite", (s) => s.delete(e.id));
  }
  await tx("readwrite", (s) => s.put(full));
  return full;
}

export async function allEvents(declarationId?: string): Promise<OutboxEvent[]> {
  const all = await tx<OutboxEvent[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxEvent[]>);
  return all
    .filter((e) => !declarationId || e.declarationId === declarationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function pending(declarationId?: string): Promise<OutboxEvent[]> {
  return (await allEvents(declarationId)).filter((e) => !e.syncedAt);
}

type FlushResult = { sent: number; accepted: number; results: Record<string, unknown> };

let running: Promise<FlushResult> | null = null;

/**
 * Send pending events to /api/sync in batches and mark the ones the server accepted. One flush at a
 * time: a second call while one runs gets the same answer, so a sign-off is never sent twice at once.
 */
export function flush(): Promise<FlushResult> {
  running ??= sendAll().finally(() => {
    running = null;
  });
  return running;
}

async function sendAll(): Promise<FlushResult> {
  const queue = await pending();
  const out: FlushResult = { sent: 0, accepted: 0, results: {} };
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok) throw new Error(`sync failed: HTTP ${res.status}`);
    const body = (await res.json()) as { accepted: string[]; results: Record<string, unknown> };
    const now = new Date().toISOString();
    for (const e of batch) {
      if (body.accepted.includes(e.id))
        await tx("readwrite", (s) => s.put({ ...e, syncedAt: now, result: body.results[e.id] }));
    }
    out.sent += batch.length;
    out.accepted += body.accepted.length;
    Object.assign(out.results, body.results);
  }
  return out;
}
