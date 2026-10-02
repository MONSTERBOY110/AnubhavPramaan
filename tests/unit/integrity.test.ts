import { describe, expect, it } from "vitest";
import { buildRecord } from "@/lib/cert/build";
import { verifyRecord, type CertRecord } from "@/lib/cert/record";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { dHashFromGrey, hamming } from "@/lib/evidence/dhash";
import {
  MAX_KMH,
  REUSE_MAX_DISTANCE,
  haversineKm,
  impossibleTravel,
  integrityReport,
  reusedEvidence,
  type EvidenceRef,
} from "@/lib/integrity/checks";
import { getPack } from "@/lib/packs/load";

// Integrity checks at sign-off (TRD M5) on inputs written for this test: grey grids, hashes and
// places. Flags are printed on the record; they never block or change a decision.

/** A 9 x 8 grey grid from a function of the column and row. */
const grid = (f: (x: number, y: number) => number) =>
  Array.from({ length: 72 }, (_, i) => f(i % 9, Math.floor(i / 9)));

describe("difference hash", () => {
  it("sets a bit wherever a pixel is brighter than its right-hand neighbour", () => {
    expect(dHashFromGrey(grid((x) => 200 - x * 10))).toBe("ffffffffffffffff");
    expect(dHashFromGrey(grid((x) => 10 + x * 10))).toBe("0000000000000000");
  });

  it("keeps the same hash when a copy is brighter and has more contrast", () => {
    const photo = grid((x, y) => 128 + 60 * Math.sin(x * 1.3 + y * 0.7));
    const copy = photo.map((v) => v * 1.05 + 4);
    expect(hamming(dHashFromGrey(photo), dHashFromGrey(copy))).toBe(0);
  });

  it("counts differing bits", () => {
    expect(hamming("ffffffffffffffff", "0000000000000000")).toBe(64);
    expect(hamming("0123456789abcdef", "0123456789abcdef")).toBe(0);
    expect(hamming("0000000000000000", "000000000000000f")).toBe(4);
    expect(() => dHashFromGrey([1, 2, 3])).toThrow();
  });
});

describe("reused evidence", () => {
  const mine: EvidenceRef = {
    declarationId: "d-new",
    pcId: "CON/N0604.PC5",
    sha256: "a".repeat(64),
    dhash: "00000000000000ff",
    capturedAt: "2026-10-02T10:00:00.000Z",
  };
  const stored = (over: Partial<EvidenceRef>): EvidenceRef => ({
    declarationId: "d-old",
    pcId: "CON/N0604.PC5",
    sha256: "b".repeat(64),
    capturedAt: "2026-09-30T10:00:00.000Z",
    ...over,
  });

  it("flags the same file stored for another candidate", () => {
    expect(reusedEvidence([mine], [stored({ sha256: mine.sha256 })])).toEqual([
      { kind: "same-file", pcId: mine.pcId, sha256: mine.sha256 },
    ]);
  });

  it(`flags a near copy at ${REUSE_MAX_DISTANCE} bits or fewer, and nothing beyond`, () => {
    expect(reusedEvidence([mine], [stored({ dhash: "000000000000003f" })])).toEqual([
      { kind: "possible-reused-photo", pcId: mine.pcId, otherSha256: "b".repeat(64), distance: 2 },
    ]);
    expect(reusedEvidence([mine], [stored({ dhash: "0000000000000100" })])).toEqual([]);
  });

  it("never compares a candidate with their own earlier photos", () => {
    expect(
      reusedEvidence([mine], [stored({ declarationId: "d-new", sha256: mine.sha256 })]),
    ).toEqual([]);
  });
});

describe("impossible travel", () => {
  it("measures great-circle distance (one degree of longitude on the equator is about 111.19 km)", () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.19, 2);
  });

  const kolkata = { lat: 22.57, lon: 88.36 };
  const delhi = { lat: 28.61, lon: 77.21 };

  it(`flags two sessions that need more than ${MAX_KMH} km/h`, () => {
    const flag = impossibleTravel(
      { ...kolkata, at: "2026-10-02T09:00:00.000Z" },
      { ...delhi, at: "2026-10-02T10:00:00.000Z" },
    );
    expect(flag?.kind).toBe("impossible-travel");
    expect(flag && flag.kind === "impossible-travel" && flag.kmh).toBeGreaterThan(MAX_KMH);
  });

  it("accepts the same trip a day apart, and small moves inside the rounding of a place", () => {
    expect(
      impossibleTravel(
        { ...kolkata, at: "2026-10-01T09:00:00.000Z" },
        { ...delhi, at: "2026-10-02T10:00:00.000Z" },
      ),
    ).toBeNull();
    expect(
      impossibleTravel(
        { ...kolkata, at: "2026-10-02T09:00:00.000Z" },
        { lat: 22.58, lon: 88.37, at: "2026-10-02T09:01:00.000Z" },
      ),
    ).toBeNull();
  });

  const span = (
    declarationId: string,
    place: { lat: number; lon: number },
    from: string,
    to: string,
  ) => ({
    declarationId,
    first: { ...place, at: from },
    last: { ...place, at: to },
  });
  const base = {
    declarationId: "d-new",
    current: [],
    stored: [],
    now: new Date("2026-10-02T10:30:00.000Z"),
  };
  const here = [{ capturedAt: "2026-10-02T10:00:00.000Z", ...delhi }];

  it("says when travel could not be checked, and never compares a candidate with their own sessions", () => {
    expect(
      integrityReport({
        ...base,
        places: [{ capturedAt: "2026-10-02T10:00:00.000Z" }],
        previousSessions: [],
      }).travel,
    ).toBe("no-place");
    expect(integrityReport({ ...base, places: here, previousSessions: [] }).travel).toBe(
      "first-session",
    );
    const own = span("d-new", kolkata, "2026-10-02T09:00:00.000Z", "2026-10-02T09:30:00.000Z");
    expect(integrityReport({ ...base, places: here, previousSessions: [own] }).travel).toBe(
      "first-session",
    );
  });

  it("flags a session of another candidate an impossible distance away, even after a re-sign", () => {
    const other = span("d-old", kolkata, "2026-10-02T09:00:00.000Z", "2026-10-02T09:30:00.000Z");
    const ownEarlier = span("d-new", delhi, "2026-10-02T10:00:00.000Z", "2026-10-02T10:00:00.000Z");
    const report = integrityReport({
      ...base,
      places: here,
      previousSessions: [other, ownEarlier],
    });
    expect(report.travel).toBe("checked");
    expect(report.flags.map((f) => f.kind)).toEqual(["impossible-travel"]);
  });

  it("flags it when the sessions synced out of order (the other one happened later)", () => {
    const later = span("d-later", kolkata, "2026-10-02T10:40:00.000Z", "2026-10-02T11:00:00.000Z");
    const report = integrityReport({ ...base, places: here, previousSessions: [later] });
    expect(report.flags.map((f) => f.kind)).toEqual(["impossible-travel"]);
  });
});

describe("integrity in the record", () => {
  const pack = getPack("CON/Q0602");
  const declaration: SelfDeclaration = {
    id: "decl-2",
    candidateRef: "C-TEST02",
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
  };
  const integrity = {
    checkedAt: "2026-10-02T03:20:00.000Z",
    evidenceCompared: 12,
    travel: "checked" as const,
    flags: [
      {
        kind: "possible-reused-photo" as const,
        pcId: "CON/N0604.PC5",
        otherSha256: "b".repeat(64),
        distance: 3,
      },
    ],
  };

  it("is sealed by the record hash, so a removed flag shows", async () => {
    const rec = await buildRecord({
      id: "rec-000000002",
      pack,
      declaration,
      mappingDecision: {
        qp: "CON/Q0602",
        route: "direct-assessment",
        agreesWithSuggestion: true,
        suggested: { qp: "CON/Q0602", route: "direct-assessment", mode: "llm" },
      },
      request: {
        declarationId: "decl-2",
        scores: [{ pcId: "CON/N0602.PC1", level: 1 }],
        evidence: [
          {
            pcId: "CON/N0604.PC5",
            sha256: "a".repeat(64),
            dhash: "00000000000000ff",
            capturedAt: "2026-10-02T03:10:00.000Z",
            deviceId: "tablet-1",
            lat: 22.57,
            lon: 88.36,
          },
        ],
        decision: { acceptsRecommendation: true },
        assessorId: "AS-0142",
        pin: "2468",
      },
      assessor: { id: "AS-0142", agency: "Demo Assessment Agency (prototype only)", demo: true },
      integrity,
      now: new Date("2026-10-02T03:20:00.000Z"),
    });
    expect(rec.integrity).toEqual(integrity);
    expect(rec.evidence[0]).toMatchObject({ dhash: "00000000000000ff", lat: 22.57, lon: 88.36 });
    expect(await verifyRecord(rec)).toEqual({ valid: true, chainOk: true, hashOk: true });
    const cleaned: CertRecord = { ...rec, integrity: { ...integrity, flags: [] } };
    expect(await verifyRecord(cleaned)).toMatchObject({ valid: false, hashOk: false });
  });
});
