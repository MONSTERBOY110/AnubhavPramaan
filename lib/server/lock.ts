// Serialises read-modify-write updates of one store key inside this server process. The record
// store has no transactions, so two requests that read a list, add to it and write it back at the
// same time would lose one update. On one server (the prototype, the dev server at a camp laptop)
// this lock makes such updates safe; a multi-instance host needs the store's own atomic operations.
// Anchored on globalThis because each route is its own module graph.

const memo = globalThis as typeof globalThis & { __apLocks?: Map<string, Promise<void>> };
const locks: Map<string, Promise<void>> = (memo.__apLocks ??= new Map());

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => mine);
  locks.set(key, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}
