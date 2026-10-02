import "server-only";

// Record storage for declarations, mappings and assessment records. Upstash Redis over its REST
// API when credentials are configured, otherwise an in-memory map so the whole flow works on a
// laptop with no store (pattern carried over from Saakshi's certificate store). Records hold
// redacted text, claims, scores and hashes; audio is never stored here.

/** Evidence retention: 3 years, matching the CSDCI assessment guide; then the record expires. */
export const RECORD_TTL_SECONDS = 3 * 365 * 24 * 60 * 60;

export type RecordStore = {
  readonly kind: "upstash" | "memory";
  put<T>(kind: string, id: string, value: T): Promise<void>;
  get<T>(kind: string, id: string): Promise<T | null>;
};

// Route handlers and server components are separate module graphs; anchor the map on globalThis
// so a record written by one is readable by the other.
const globalRef = globalThis as typeof globalThis & { __apRecords?: Map<string, string> };
const memory: Map<string, string> = (globalRef.__apRecords ??= new Map());

const key = (kind: string, id: string) => `ap:${kind}:${id}`;

export function getRecordStore(fetchImpl: typeof fetch = fetch): RecordStore {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) return upstashStore(url.replace(/\/$/, ""), token, fetchImpl);
  return memoryStore();
}

export function memoryStore(): RecordStore {
  return {
    kind: "memory",
    async put(kind, id, value) {
      memory.set(key(kind, id), JSON.stringify(value));
    },
    async get<T>(kind: string, id: string) {
      const raw = memory.get(key(kind, id));
      return raw ? (JSON.parse(raw) as T) : null;
    },
  };
}

function upstashStore(url: string, token: string, fetchImpl: typeof fetch): RecordStore {
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    kind: "upstash",
    async put(kind, id, value) {
      const res = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify([
          "SET",
          key(kind, id),
          JSON.stringify(value),
          "EX",
          String(RECORD_TTL_SECONDS),
        ]),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`record store write failed: ${res.status}`);
    },
    async get<T>(kind: string, id: string) {
      const res = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(["GET", key(kind, id)]),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`record store read failed: ${res.status}`);
      const body = (await res.json()) as { result?: string | null };
      return body.result ? (JSON.parse(body.result) as T) : null;
    },
  };
}
