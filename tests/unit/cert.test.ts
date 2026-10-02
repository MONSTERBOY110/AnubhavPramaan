import { describe, expect, it } from "vitest";
import { checkAssessor } from "@/lib/cert/assessors";
import { SignOffError, buildRecord, type SignRequest } from "@/lib/cert/build";
import { verifyRecord, type CertRecord } from "@/lib/cert/record";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { getPack } from "@/lib/packs/load";

// The tamper-evident record: rebuilt from raw inputs on the server, verifiable from the stored
// record alone, and refused without a recognised assessor.

const pack = getPack("CON/Q0602");
const declaration: SelfDeclaration = {
  id: "decl-1",
  candidateRef: "C-TEST01",
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
const mappingDecision = {
  qp: "CON/Q0602",
  route: "direct-assessment",
  agreesWithSuggestion: true,
  suggested: { qp: "CON/Q0602", route: "direct-assessment", mode: "llm" },
};
const assessor = { id: "AS-0142", agency: "Demo Assessment Agency (prototype only)", demo: true };

function request(overrides: Partial<SignRequest> = {}): SignRequest {
  return {
    declarationId: "decl-1",
    scores: pack.nos.flatMap((n) =>
      n.pcs.map((pc) =>
        pc.type === "measurement"
          ? { pcId: pc.id, reading: pc.tolerance!.kind === "min" ? 50 : 450 }
          : { pcId: pc.id, level: 3 },
      ),
    ),
    evidence: [
      {
        pcId: "CON/N0604.PC5",
        sha256: "a".repeat(64),
        capturedAt: "2026-10-02T03:10:00.000Z",
        deviceId: "tablet-1",
      },
    ],
    decision: { acceptsRecommendation: true },
    assessorId: "AS-0142",
    pin: "2468",
    ...overrides,
  };
}

const build = (req = request()) =>
  buildRecord({
    id: "rec-000000001",
    pack,
    declaration,
    mappingDecision,
    request: req,
    assessor,
    now: new Date("2026-10-02T03:20:00.000Z"),
  });

describe("certification record", () => {
  it("is valid as built, with marks and profile recomputed on the server", async () => {
    const rec = await build();
    expect(await verifyRecord(rec)).toEqual({ valid: true, chainOk: true, hashOk: true });
    expect(rec.profile.recommendation).toBe("certify");
    expect(rec.profile.band).toBe("A");
    expect(rec.events.at(-1)?.kind).toBe("sign-off");
    expect(rec.boundary).toContain("The assessor observed the work");
  });

  it("shows tampering with a score or an event", async () => {
    const rec = await build();
    const edited: CertRecord = {
      ...rec,
      scores: rec.scores.map((s, i) => (i === 0 ? { ...s, marks: s.marks + 1 } : s)),
    };
    expect(await verifyRecord(edited)).toMatchObject({ valid: false, hashOk: false });
    const reordered: CertRecord = { ...rec, events: [...rec.events].reverse() };
    expect(await verifyRecord(reordered)).toMatchObject({ valid: false, chainOk: false });
  });

  it("refuses a level that contradicts the evidence hint without a reason", async () => {
    const req = request();
    req.scores[0] = { pcId: req.scores[0]!.pcId, level: 3, hint: ["not_visible"] };
    await expect(build(req)).rejects.toBeInstanceOf(SignOffError);
    req.scores[0] = { ...req.scores[0], reason: "Saw the tool checks in person" };
    await expect(build(req)).resolves.toBeTruthy();
  });

  it("checks a reason's length as written, and seals it with identifiers redacted", async () => {
    const req = request();
    const pcId = req.scores[0]!.pcId;
    // 12 characters as written; redaction would shorten it, which must not refuse the sign-off.
    req.scores[0] = { pcId, level: 3, hint: ["not_visible"], reason: "Power 2000 W" };
    const rec = await build(req);
    expect(rec.scores.find((x) => x.pcId === pcId)?.reason).not.toContain("2000");
    req.scores[0] = { pcId, level: 3, hint: ["not_visible"], reason: "call me on 9876543210" };
    const withPhone = await build(req);
    expect(withPhone.scores.find((x) => x.pcId === pcId)?.reason).toBe("call me on [number]");
  });

  it("needs a reason and the assessor's own recommendation to reject the tool's", async () => {
    await expect(
      build(request({ decision: { acceptsRecommendation: false, final: "partial" } })),
    ).rejects.toBeInstanceOf(SignOffError);
    const rec = await build(
      request({
        decision: {
          acceptsRecommendation: false,
          final: "partial",
          reason: "Panel work not seen at this camp",
        },
      }),
    );
    expect(rec.decision.final).toBe("partial");
    expect(rec.aiLedger.find((l) => l.step === "recommendation")).toMatchObject({
      suggested: "certify",
      decided: "partial",
    });
  });
});

describe("assessor sign-off", () => {
  it("accepts only the right PIN for a known assessor", () => {
    expect(checkAssessor("AS-0142", "2468")).toMatchObject({ id: "AS-0142", demo: true });
    expect(checkAssessor("AS-0142", "1234")).toBeNull();
    expect(checkAssessor("AS-9999", "2468")).toBeNull();
    expect(checkAssessor("AS-0142", "24")).toBeNull();
  });
});
