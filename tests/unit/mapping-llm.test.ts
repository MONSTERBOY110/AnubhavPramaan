import { beforeEach, describe, expect, it, vi } from "vitest";
import { llmEndpoints } from "@/lib/analyzer/config";
import { resetModelCapabilities, type GatewayDeps } from "@/lib/analyzer/gateway";
import { extractClaims, locateQuote, ruleClaims } from "@/lib/declaration/extract";
import type { Claim } from "@/lib/declaration/schemas";
import { linkClaims, packPrompt, shortCode } from "@/lib/mapping/link";
import { mapDeclaration } from "@/lib/mapping/map";
import { getPack, loadPacks } from "@/lib/packs/load";

// Extraction and linking with a mocked model: what the model says is only a proposal, and these
// tests pin down what the code keeps of it. Sentences are written for this test, not taken from
// the frozen eval set.

const reply = (content: unknown) =>
  new Response(
    JSON.stringify({
      id: "r",
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );

function gw(content: unknown): GatewayDeps {
  return {
    endpoints: llmEndpoints("extract", {
      AZURE_OPENAI_BASE_URL: "https://example.services.ai.azure.com/openai/v1",
      AZURE_OPENAI_API_KEY: "test-key",
      AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
    }),
    timeoutMs: 1000,
    fetchImpl: vi.fn(async () => reply(content)) as unknown as typeof fetch,
  };
}

beforeEach(() => resetModelCapabilities());

const answer = {
  topic: "wiring",
  q: "मकान में वायरिंग कैसे करते हैं?",
  text: "दीवार में पाइप डालकर क्लैंप से कसता हूँ। फिर पाइप में तार खींचता हूँ।",
};

describe("claim extraction", () => {
  it("keeps a claim only when its quote is in the answer", async () => {
    const out = await extractClaims(answer, 2, {
      gateway: gw({
        claims: [
          {
            quote: "पाइप में तार खींचता हूँ",
            summary: "Pulls wires through conduit",
            summary_hi: "आप पाइप में तार खींचते हैं",
            tasks: ["pull wires"],
            tools: [],
            years: null,
            setting: null,
          },
          {
            quote: "मैं मेगर टेस्ट करता हूँ",
            summary: "Invented",
            summary_hi: "x",
            tasks: [],
            tools: [],
            years: null,
            setting: null,
          },
        ],
      }),
    });
    expect(out.source).toBe("llm");
    expect(out.rejected).toBe(1);
    expect(out.claims).toEqual([
      expect.objectContaining({
        id: "a2c1",
        answer: 2,
        quote: "पाइप में तार खींचता हूँ",
        summaryHi: "आप पाइप में तार खींचते हैं",
      }),
    ]);
    expect(out.usage).toEqual({ prompt: 10, completion: 5 });
  });

  it("accepts a quote once a trailing danda or quote marks are trimmed", () => {
    expect(locateQuote(answer.text, '"पाइप में तार खींचता हूँ।"')).toBe("पाइप में तार खींचता हूँ");
    expect(locateQuote(answer.text, "पाइप में तार खींचा")).toBeNull();
  });

  it("falls back to first-person sentences, minus negations, when no model answers", async () => {
    const out = await extractClaims(
      { ...answer, text: "पाइप बिछाता हूँ। पैनल का काम नहीं किया हूँ। ठीक है।" },
      0,
      { gateway: { endpoints: [], timeoutMs: 100 } },
    );
    expect(out.source).toBe("rules");
    expect(out.claims.map((c) => c.quote)).toEqual(["पाइप बिछाता हूँ।"]);
    expect(ruleClaims("", 0)).toEqual([]);
  });
});

const claims: Claim[] = [
  {
    id: "a1c1",
    answer: 1,
    summary: "Pulls wires through conduit",
    quote: "पाइप में तार खींचता हूँ",
    tasks: [],
    tools: [],
  },
  {
    id: "a1c2",
    answer: 1,
    summary: "Clamps conduit",
    quote: "क्लैंप से कसता हूँ",
    tasks: [],
    tools: [],
  },
];

describe("PC linking", () => {
  const pack = getPack("CON/Q0602");

  it("asks with short codes and maps them back to full PC ids, dropping low confidence", async () => {
    const out = await linkClaims(claims, pack, {
      gateway: gw({
        links: [
          { claim: "a1c1", pc: "N0604.6", confidence: 0.95 },
          { claim: "a1c2", pc: "N0604.5", confidence: 0.9 },
          { claim: "a1c2", pc: "N0602.7", confidence: 0.4 },
          { claim: "a1c1", pc: "N0604.6", confidence: 0.8 },
        ],
      }),
    });
    expect(out.ok).toBe(true);
    expect(out.links).toEqual([
      { claimId: "a1c1", pcId: "CON/N0604.PC6", confidence: 0.95 },
      { claimId: "a1c2", pcId: "CON/N0604.PC5", confidence: 0.9 },
    ]);
    expect(out.dropped).toBe(1);
  });

  it("refuses a PC code that is not in the pack", async () => {
    const out = await linkClaims(claims, pack, {
      gateway: gw({ links: [{ claim: "a1c1", pc: "N9999.1", confidence: 0.99 }] }),
    });
    expect(out.ok).toBe(false);
    expect(out.links).toEqual([]);
  });

  it("puts every PC of the pack in the prompt under its short code", () => {
    const prompt = packPrompt(pack);
    expect(shortCode("DGT/VSQ/N0101.PC12")).toBe("N0101.12");
    for (const nos of pack.nos)
      for (const pc of nos.pcs) expect(prompt).toContain(`${shortCode(pc.id)}: `);
  });
});

describe("mapping pipeline (keyword mode, no model)", () => {
  it("suggests the electrician pack for wiring talk, with a route and gaps", async () => {
    const out = await mapDeclaration(
      {
        answers: [
          {
            topic: "wiring",
            q: "",
            text: "हर सर्किट में मेगर टेस्ट करता हूँ। पाइप में तार खींचता हूँ।",
          },
        ],
      },
      loadPacks(),
      { mode: "keyword" },
    );
    expect(out.label).toBe("Keyword baseline, no LLM");
    expect(out.best).toBe("CON/Q0602");
    expect(out.route?.suggestion).toBe("upskill-first");
    expect(out.gaps.length).toBeGreaterThan(0);
    expect(out.packs).toHaveLength(2);
  });

  it("suggests nothing when no pack has any supported PC", async () => {
    const out = await mapDeclaration(
      { answers: [{ topic: "intro", q: "", text: "हाँ, किया है।" }] },
      loadPacks(),
      { mode: "keyword" },
    );
    expect(out.best).toBeNull();
    expect(out.route).toBeNull();
  });
});
