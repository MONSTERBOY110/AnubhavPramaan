import { describe, expect, it } from "vitest";
import { POST as decide } from "@/app/api/mapping/[id]/decision/route";
import { memoryStore } from "@/lib/store/records";

// The assessor decides: a suggestion is only ever confirmed or changed by a named assessor, and a
// change needs a reason. Both the suggestion and the decision are kept.

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) =>
  new Request("http://localhost/api/mapping/x/decision", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

async function seed(id: string) {
  await memoryStore().put("mapping", id, {
    declarationId: id,
    createdAt: "2026-10-02T00:00:00Z",
    result: {
      best: "CON/Q0602",
      route: { rule: "flat", pct: 0.4, threshold: 0.7, suggestion: "upskill-first" },
      mode: "llm",
    },
  });
}

describe("assessor decision on a mapping", () => {
  it("records agreement with only an assessor id", async () => {
    await seed("m1");
    const res = await decide(
      post({ qp: "CON/Q0602", route: "upskill-first", assessorId: "AS-0142" }),
      ctx("m1"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      agreesWithSuggestion: true,
      assessorId: "AS-0142",
      suggested: { qp: "CON/Q0602", route: "upskill-first", mode: "llm" },
    });
  });

  it("refuses a change without a reason, and keeps it with one", async () => {
    await seed("m2");
    const bare = await decide(
      post({ qp: "CON/Q0602", route: "direct-assessment", assessorId: "AS-0142" }),
      ctx("m2"),
    );
    expect(bare.status).toBe(400);
    const ok = await decide(
      post({
        qp: "CON/Q0602",
        route: "direct-assessment",
        assessorId: "AS-0142",
        reason: "Showed panel work in person at the camp",
      }),
      ctx("m2"),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      agreesWithSuggestion: false,
      reason: "Showed panel work in person at the camp",
    });
    const stored = await memoryStore().get<{
      decision: { route: string };
      result: { route: { suggestion: string } };
    }>("mapping", "m2");
    expect(stored?.decision.route).toBe("direct-assessment");
    expect(stored?.result.route.suggestion).toBe("upskill-first");
  });

  it("requires an assessor id", async () => {
    await seed("m3");
    const res = await decide(
      post({ qp: "CON/Q0602", route: "upskill-first", assessorId: "" }),
      ctx("m3"),
    );
    expect(res.status).toBe(400);
  });
});
