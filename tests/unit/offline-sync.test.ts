import { beforeEach, describe, expect, it } from "vitest";
import { POST as sync } from "@/app/api/sync/route";
import { checkSignOffProof, MAX_PIN_FAILURES, resetPinFailures } from "@/lib/cert/assessors";
import { verifyRecord, type CertRecord } from "@/lib/cert/record";
import { pinKeyHex, signOffProof } from "@/lib/offline/signoff";
import { getPack } from "@/lib/packs/load";
import { resetRateLimit } from "@/lib/server/rate-limit";
import { memoryStore } from "@/lib/store/records";

// Offline sign-off: the tablet's proof (WebCrypto) must verify on the server (node:crypto), and a
// sync must be safe to repeat.

const pack = getPack("CON/Q0602");
const declarationId = "decl-sync-1";

async function seed() {
  const store = memoryStore();
  await store.put("declaration", declarationId, {
    id: declarationId,
    candidateRef: "C-SYNC01",
    lang: "hi",
    consentAt: "2026-10-02T03:00:00.000Z",
    answers: [
      {
        topic: "wiring",
        q: "q",
        text: "पाइप में तार खींचता हूँ",
        source: "typed",
        sourceLabel: "Typed",
        edited: false,
      },
    ],
    claims: [],
  });
  await store.put("mapping", declarationId, {
    declarationId,
    createdAt: "2026-10-02T03:05:00.000Z",
    result: {},
    decision: {
      qp: "CON/Q0602",
      route: "direct-assessment",
      agreesWithSuggestion: true,
      assessorId: "AS-0142",
      at: "x",
      suggested: { qp: "CON/Q0602", route: "direct-assessment", mode: "llm" },
    },
  });
}

beforeEach(() => {
  resetPinFailures();
  resetRateLimit();
});

function signRequest(signedAt = "2026-10-02T03:30:00.000Z") {
  return {
    declarationId,
    scores: pack.nos.flatMap((n) =>
      n.pcs.map((pc) =>
        pc.type === "measurement"
          ? { pcId: pc.id, reading: pc.tolerance!.kind === "min" ? 20 : 400 }
          : { pcId: pc.id, level: 2 },
      ),
    ),
    evidence: [],
    decision: { acceptsRecommendation: true },
    assessorId: "AS-0142",
    signedAt,
  };
}

type SyncReply = {
  accepted: string[];
  results: Record<string, { error?: string; recordId?: string }>;
};
const goodProof = async (payload: unknown) =>
  signOffProof(await pinKeyHex("ap-demo-2026", "2468"), payload);
const signEvent = (id: string, payload: unknown, envelope = declarationId) => ({
  id,
  kind: "sign-off",
  declarationId: envelope,
  createdAt: "2026-10-02T03:30:00.000Z",
  payload,
});

const post = (events: unknown[], ip?: string) =>
  sync(
    new Request("http://localhost/api/sync", {
      method: "POST",
      body: JSON.stringify({ events }),
      headers: { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) },
    }),
  );

describe("offline sign-off proof", () => {
  it("made on the tablet with the right PIN verifies on the server; a wrong PIN does not", async () => {
    const payload = signRequest();
    const good = await signOffProof(await pinKeyHex("ap-demo-2026", "2468"), payload);
    const bad = await signOffProof(await pinKeyHex("ap-demo-2026", "1111"), payload);
    expect(checkSignOffProof("AS-0142", payload, good)).toMatchObject({ id: "AS-0142" });
    expect(checkSignOffProof("AS-0142", payload, bad)).toBeNull();
    expect(
      checkSignOffProof(
        "AS-0142",
        { ...payload, decision: { acceptsRecommendation: false } },
        good,
      ),
    ).toBeNull();
  });
});

describe("/api/sync", () => {
  it("builds a valid record from a synced sign-off, and accepts a repeat without applying it twice", async () => {
    await seed();
    const request = signRequest();
    const proof = await signOffProof(await pinKeyHex("ap-demo-2026", "2468"), request);
    const events = [
      {
        id: "ev-score-1",
        kind: "score",
        declarationId,
        createdAt: "2026-10-02T03:10:00.000Z",
        payload: { pcId: "CON/N0602.PC1", level: 2 },
      },
      {
        id: "ev-sign-1",
        kind: "sign-off",
        declarationId,
        createdAt: "2026-10-02T03:30:00.000Z",
        payload: { request, proof },
      },
    ];
    const first = (await (await post(events)).json()) as {
      accepted: string[];
      results: Record<string, { recordId: string }>;
    };
    expect(first.accepted).toEqual(["ev-score-1", "ev-sign-1"]);
    const recordId = first.results["ev-sign-1"]!.recordId;
    const record = await memoryStore().get<CertRecord>("certificate", recordId);
    expect(record && (await verifyRecord(record)).valid).toBe(true);
    expect(record?.assessor.signedAt).toBe("2026-10-02T03:30:00.000Z");

    const again = (await (await post(events)).json()) as {
      accepted: string[];
      results: Record<string, { recordId: string }>;
    };
    expect(again.accepted).toEqual(["ev-score-1", "ev-sign-1"]);
    expect(again.results["ev-sign-1"]!.recordId).toBe(recordId);
  });

  it("records a sign-off whose proof does not match, with its error, so the tablet stops retrying", async () => {
    await seed();
    const events = [signEvent("ev-sign-bad", { request: signRequest(), proof: "0".repeat(64) })];
    const out = (await (await post(events)).json()) as SyncReply;
    expect(out.accepted).toEqual(["ev-sign-bad"]);
    expect(out.results["ev-sign-bad"]!.error).toBe("assessor_not_verified");
    const again = (await (await post(events)).json()) as SyncReply;
    expect(again.results["ev-sign-bad"]!.error).toBe("assessor_not_verified");
  });

  it("refuses a signed assessment sent under another candidate's id", async () => {
    await seed();
    const request = signRequest("2026-10-02T03:31:00.000Z");
    const events = [
      signEvent("ev-sign-moved", { request, proof: await goodProof(request) }, "decl-someone-else"),
    ];
    const out = (await (await post(events)).json()) as SyncReply;
    expect(out.results["ev-sign-moved"]!.error).toBe("declaration_mismatch");
  });

  it("seals one record per proof: the same proof under a new event id gets the first record back", async () => {
    await seed();
    const request = signRequest("2026-10-02T03:32:00.000Z");
    const proof = await goodProof(request);
    const first = (await (
      await post([signEvent("ev-sign-a", { request, proof })])
    ).json()) as SyncReply;
    const replay = (await (
      await post([signEvent("ev-sign-b", { request, proof })])
    ).json()) as SyncReply;
    expect(first.results["ev-sign-a"]!.recordId).toBeTruthy();
    expect(replay.results["ev-sign-b"]!.recordId).toBe(first.results["ev-sign-a"]!.recordId);
  });

  it(`locks the assessor after ${MAX_PIN_FAILURES} wrong PINs, even for the right one, and keeps that event for later`, async () => {
    await seed();
    const bad = Array.from({ length: MAX_PIN_FAILURES }, (_, k) =>
      signEvent(`ev-guess-${k}`, {
        request: signRequest(),
        proof: String(k).repeat(64).slice(0, 64),
      }),
    );
    await post(bad);
    const request = signRequest("2026-10-02T03:33:00.000Z");
    const out = (await (
      await post([signEvent("ev-sign-late", { request, proof: await goodProof(request) })])
    ).json()) as SyncReply;
    expect(out.results["ev-sign-late"]!.error).toBe("assessor_locked");
    expect(out.accepted).toEqual([]);
  });

  it("counts wrong PINs per address: a stranger locks only themselves, never the camp's tablet", async () => {
    await seed();
    const bad = Array.from({ length: MAX_PIN_FAILURES }, (_, k) =>
      signEvent(`ev-stranger-${k}`, { request: signRequest(), proof: "f".repeat(63) + String(k) }),
    );
    await post(bad, "203.0.113.9");
    const request = signRequest("2026-10-02T03:35:00.000Z");
    const camp = (await (
      await post(
        [signEvent("ev-camp", { request, proof: await goodProof(request) })],
        "198.51.100.7",
      )
    ).json()) as SyncReply;
    expect(camp.results["ev-camp"]!.recordId).toMatch(/^s[0-9a-f]{13}$/);
  });

  it("refuses an assessment that scores the same PC twice", async () => {
    await seed();
    const request = {
      ...signRequest("2026-10-02T03:34:00.000Z"),
      scores: [
        { pcId: "CON/N0602.PC1", level: 1 },
        { pcId: "CON/N0602.PC1", level: 1 },
      ],
    };
    const out = (await (
      await post([signEvent("ev-sign-dup", { request, proof: await goodProof(request) })])
    ).json()) as SyncReply;
    expect(out.results["ev-sign-dup"]!.error).toBe("duplicate_pc");
  });
});
