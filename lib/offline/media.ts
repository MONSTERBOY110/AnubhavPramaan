"use client";

// Photos and queued evidence hints on the assessor tablet (TRD M8, PRD R14). A photo is kept on
// the device under its SHA-256, so a hint can still be asked after a reload or once the network
// is back; a hint asked with the network off waits in a queue and runs when the tablet is online.
// Photos never leave the device except as the downscaled copy sent for a hint. A separate database
// from the outbox, so the outbox's schema never changes.

const DB = "anubhavpramaan-media";
const PHOTOS = "photos";
const QUEUE = "hint-queue";

export type StoredPhoto = {
  sha256: string;
  declarationId: string;
  pcId: string;
  blob: Blob;
  storedAt: string;
};
export type QueuedHint = {
  key: string;
  declarationId: string;
  pcId: string;
  sha256: string;
  queuedAt: string;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTOS))
        db.createObjectStore(PHOTOS, { keyPath: "sha256" });
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

/** TRD: evidence is kept 3 years, then deleted; the tablet applies the same rule to its copies. */
export const RETENTION_MS = 3 * 365 * 24 * 60 * 60 * 1000;

async function pruneOld(now: number): Promise<void> {
  const all = await tx<StoredPhoto[]>(
    PHOTOS,
    "readonly",
    (s) => s.getAll() as IDBRequest<StoredPhoto[]>,
  );
  for (const p of all) {
    if (now - Date.parse(p.storedAt) > RETENTION_MS)
      await tx(PHOTOS, "readwrite", (s) => s.delete(p.sha256));
  }
}

export async function keepPhoto(photo: Omit<StoredPhoto, "storedAt">): Promise<void> {
  await pruneOld(Date.now()).catch(() => undefined);
  await tx(PHOTOS, "readwrite", (s) => s.put({ ...photo, storedAt: new Date().toISOString() }));
}

export async function photo(sha256: string): Promise<Blob | null> {
  const found = await tx<StoredPhoto | undefined>(
    PHOTOS,
    "readonly",
    (s) => s.get(sha256) as IDBRequest<StoredPhoto | undefined>,
  );
  return found?.blob ?? null;
}

/** One queued hint per PC: asking again replaces the earlier request with the newest photo. */
export async function queueHint(item: Omit<QueuedHint, "key" | "queuedAt">): Promise<void> {
  await tx(QUEUE, "readwrite", (s) =>
    s.put({
      ...item,
      key: `${item.declarationId}|${item.pcId}`,
      queuedAt: new Date().toISOString(),
    }),
  );
}

export async function queuedHints(declarationId: string): Promise<QueuedHint[]> {
  const all = await tx<QueuedHint[]>(
    QUEUE,
    "readonly",
    (s) => s.getAll() as IDBRequest<QueuedHint[]>,
  );
  return all
    .filter((q) => q.declarationId === declarationId)
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function dropHint(key: string): Promise<void> {
  await tx(QUEUE, "readwrite", (s) => s.delete(key));
}
