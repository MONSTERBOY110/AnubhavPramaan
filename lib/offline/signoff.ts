import { canonicalJson } from "@/lib/cert/canonical";

// Offline sign-off proof. The tablet must not keep the assessor's PIN in its outbox, so at sign-off
// it computes HMAC-SHA256 over the canonical sign-off payload, keyed by sha256(salt:PIN), which is
// the value the assessor register already stores. The server recomputes the HMAC with the stored
// value when the event syncs. This proves the PIN was entered at sign-off without storing it.
// Limitation, stated plainly: a 4 to 8 digit PIN has little entropy; production would bind the
// key to the device (WebAuthn or the agency's assessor app).

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pinKeyHex(salt: string, pin: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${pin}`) as unknown as BufferSource,
  );
  return bytesToHex(digest);
}

/** HMAC-SHA256(key = pinKeyHex, message = canonical JSON of the payload), as hex. */
export async function signOffProof(keyHex: string, payload: unknown): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(keyHex) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(canonicalJson(payload)) as unknown as BufferSource,
  );
  return bytesToHex(mac);
}
