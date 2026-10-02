import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as saveAnswer } from "@/app/api/declaration/[id]/answer/route";
import { POST as extractRoute } from "@/app/api/declaration/[id]/extract/route";
import { llmEndpoints } from "@/lib/analyzer/config";
import { resetModelCapabilities, type GatewayDeps } from "@/lib/analyzer/gateway";
import { extractClaims } from "@/lib/declaration/extract";
import { CONTENT_FILTER_LABEL, CONTENT_FILTER_NOTICE } from "@/lib/declaration/notices";
import type { SelfDeclaration } from "@/lib/declaration/schemas";
import { mapDeclaration } from "@/lib/mapping/map";
import { loadPacks } from "@/lib/packs/load";
import { memoryStore } from "@/lib/store/records";

// When the AI provider's content filter refuses an answer (a fixed property of the deployed
// system, lead 2 Oct 13:02): the transcript is kept, the rules find the claims and are labelled
// as such, the worker is asked to check the words or type a short summary, and the event is
// logged. The answer is D02's answer about tools from the frozen eval set, which the deployed
// filter refused as "sexual: medium" in LLM run 2. The filter's reply is mocked: no request leaves
// the test.

type Turn = { topic: string; q: string; answer: string };
const d02 = JSON.parse(readFileSync("eval/mapping/declarations/D02.json", "utf8")) as {
  turns: Turn[];
};
const tools = d02.turns[1]!;

const AZURE = {
  AZURE_OPENAI_BASE_URL: "https://example.services.ai.azure.com/openai/v1",
  AZURE_OPENAI_API_KEY: "test-key",
  AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
};

/** Azure's reply when its input filter refuses a prompt, as the deployment answered on 2 Oct. */
const filtered = () =>
  new Response(
    JSON.stringify({
      error: {
        code: "content_filter",
        status: 400,
        message:
          "The response was filtered due to the prompt triggering Azure OpenAI's content management policy. Please modify your prompt and retry.",
        innererror: {
          code: "ResponsibleAIPolicyViolation",
          content_filter_result: {
            hate: { filtered: false, severity: "safe" },
            jailbreak: { filtered: false, detected: false },
            self_harm: { filtered: false, severity: "safe" },
            sexual: { filtered: true, severity: "medium" },
            violence: { filtered: false, severity: "safe" },
          },
        },
      },
    }),
    { status: 400, headers: { "content-type": "application/json" } },
  );

const reply = (content: unknown) =>
  new Response(
    JSON.stringify({
      id: "r",
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const gateway = (fetchImpl: typeof fetch): GatewayDeps => ({
  endpoints: llmEndpoints("extract", AZURE),
  timeoutMs: 1000,
  fetchImpl,
  sleep: async () => {},
});

beforeEach(() => resetModelCapabilities());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("an answer refused by the provider's content filter", () => {
  it("falls back to the rules, says why, and is not retried", async () => {
    const f = vi.fn(async () => filtered()) as unknown as typeof fetch;
    const out = await extractClaims({ topic: tools.topic, q: tools.q, text: tools.answer }, 1, {
      gateway: gateway(f),
    });
    expect(out.source).toBe("rules");
    expect(out.contentFilter).toBe("sexual (medium) in the prompt");
    expect(out.claims.length).toBeGreaterThan(0);
    for (const c of out.claims) expect(tools.answer).toContain(c.quote);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("is recorded in the mapping ledger as a content-filter block, not another failure", async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as {
        messages: Array<{ content: string }>;
        response_format?: { json_schema?: { name?: string } };
      };
      if (body.messages[1]!.content.includes(tools.answer.trim())) return filtered();
      return body.response_format?.json_schema?.name === "claims"
        ? reply({ claims: [] })
        : reply({ links: [] });
    }) as unknown as typeof fetch;
    const result = await mapDeclaration(
      { answers: d02.turns.slice(0, 2).map((t) => ({ topic: t.topic, q: t.q, text: t.answer })) },
      loadPacks(),
      { mode: "llm", gateway: gateway(f) },
    );
    expect(result.ledger.extractionFallbacks).toBe(1);
    expect(result.ledger.contentFilterBlocked).toEqual([1]);
  });

  it("keeps the transcript, labels the rule-based claims, returns the notice and logs it", async () => {
    vi.stubEnv("AZURE_OPENAI_BASE_URL", AZURE.AZURE_OPENAI_BASE_URL);
    vi.stubEnv("AZURE_OPENAI_API_KEY", AZURE.AZURE_OPENAI_API_KEY);
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", AZURE.AZURE_OPENAI_DEPLOYMENT);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => filtered()),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const id = "cf-route-1";
    await memoryStore().put<SelfDeclaration>("declaration", id, {
      id,
      candidateRef: "AP-TEST",
      lang: "hi",
      consentAt: "2026-10-02T07:30:00.000Z",
      answers: [
        {
          topic: tools.topic,
          q: tools.q,
          text: tools.answer,
          source: "elevenlabs-standin",
          sourceLabel: "ElevenLabs Scribe (development stand-in)",
          edited: false,
        },
      ],
      claims: [],
    });

    const res = await extractRoute(
      new Request(`http://localhost/api/declaration/${id}/extract`, {
        method: "POST",
        body: JSON.stringify({ answer: 0 }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      claims: unknown[];
      source: string;
      label: string;
      blocked?: string;
      notice?: { hi: string; en: string };
    };
    expect(body.blocked).toBe("content_filter");
    expect(body.notice?.en).toBe(
      "This answer could not be processed automatically, please check or type a short summary.",
    );
    expect(body.notice).toEqual(CONTENT_FILTER_NOTICE);
    expect(body.source).toBe("rules");
    expect(body.label).toBe(CONTENT_FILTER_LABEL);
    expect(body.claims.length).toBeGreaterThan(0);

    const stored = (await memoryStore().get<SelfDeclaration>("declaration", id))!;
    expect(stored.answers[0]!.text).toBe(tools.answer);
    expect(stored.answers[0]!.extraction).toMatchObject({
      source: "rules",
      label: CONTENT_FILTER_LABEL,
      contentFilter: true,
    });
    expect(stored.claims.length).toBe(body.claims.length);

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(String(warn.mock.calls[0]![0])) as Record<string, unknown>;
    expect(logged).toMatchObject({
      event: "extraction.content_filter",
      declaration: id,
      answer: 0,
      filter: "sexual (medium) in the prompt",
      fallback: "rules",
    });
  });

  it("keeps the words as heard when a typed summary replaces them", async () => {
    const id = "cf-summary-1";
    await memoryStore().put<SelfDeclaration>("declaration", id, {
      id,
      candidateRef: "AP-TEST",
      lang: "hi",
      consentAt: "2026-10-02T07:30:00.000Z",
      answers: [
        {
          topic: tools.topic,
          q: tools.q,
          text: tools.answer,
          source: "elevenlabs-standin",
          sourceLabel: "ElevenLabs Scribe (development stand-in)",
          edited: false,
          extraction: {
            source: "rules",
            label: CONTENT_FILTER_LABEL,
            contentFilter: true,
            at: "2026-10-02T07:31:00.000Z",
          },
        },
      ],
      claims: [],
    });
    const res = await saveAnswer(
      new Request(`http://localhost/api/declaration/${id}/answer`, {
        method: "POST",
        body: JSON.stringify({
          topic: tools.topic,
          q: tools.q,
          text: "मैं केबल जोड़ता हूँ और मीटर से जाँचता हूँ।",
          source: "typed",
          sourceLabel: "Typed summary",
          edited: false,
          // Server-owned fields sent by a browser are ignored.
          extraction: { source: "llm", label: "forged", at: "x" },
          heard: { text: "forged", sourceLabel: "forged" },
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);
    const saved = (await res.json()) as SelfDeclaration;
    const answer = saved.answers[0]!;
    expect(answer.text).toBe("मैं केबल जोड़ता हूँ और मीटर से जाँचता हूँ।");
    expect(answer.heard).toEqual({
      text: tools.answer,
      sourceLabel: "ElevenLabs Scribe (development stand-in)",
    });
    expect(answer.extraction).toBeUndefined();
  });
});
