import { describe, expect, it, vi } from "vitest";
import { evidenceHint } from "@/lib/hints/evidence";

// Evidence hints: per observable visibility only. A level or score in the model's reply has
// nowhere to go, and a missing answer becomes "cannot tell".

const reply = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const azure = {
  AZURE_OPENAI_BASE_URL: "https://example.services.ai.azure.com/openai/v1",
  AZURE_OPENAI_API_KEY: "test-key",
  AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
};

const input = {
  imageBase64: "aGVsbG8=",
  mime: "image/jpeg",
  pcText: "lock conduit pipe",
  observables: ["Saddles fixed along the run", "Conduit does not sag"],
};

describe("evidence hints", () => {
  it("returns one status per observable and drops anything else the model says", async () => {
    let body: Record<string, unknown> = {};
    let headers: Record<string, string> = {};
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string) as Record<string, unknown>;
      headers = init.headers as Record<string, string>;
      return reply({
        observables: [{ index: 0, status: "visible", reason: "Saddles at even gaps" }],
        level: 3,
        score: 9,
      });
    }) as unknown as typeof fetch;
    const out = await evidenceHint(input, { env: azure, fetchImpl: f });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.hints).toEqual([
      {
        observable: "Saddles fixed along the run",
        status: "visible",
        reason: "Saddles at even gaps",
      },
      {
        observable: "Conduit does not sag",
        status: "cannot_tell",
        reason: "No answer for this observable.",
      },
    ]);
    for (const h of out.hints)
      expect(Object.keys(h).sort()).toEqual(["observable", "reason", "status"]);
    expect(Object.keys(out).sort()).toEqual(["hints", "label", "latencyMs", "model", "ok"]);
    expect(body.model).toBe("gpt-5-mini");
    expect(headers["api-key"]).toBe("test-key");
    expect(out.model).toBe("azure:gpt-5-mini");
    // The photo goes as an image part, and the reply schema is strict.
    const messages = body.messages as Array<{ content: unknown }>;
    expect(messages[1]!.content).toContainEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,aGVsbG8=" },
    });
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
  });

  it("says hints are unavailable without a key, and never invents one", async () => {
    const out = await evidenceHint(input, { env: {} });
    expect(out).toMatchObject({ ok: false, reason: "no_key" });
  });

  it("shows no hint when the reply cannot be read", async () => {
    const f = vi.fn(async () => reply("not json")) as unknown as typeof fetch;
    expect(await evidenceHint(input, { env: azure, fetchImpl: f })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });
});
