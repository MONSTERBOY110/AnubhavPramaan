import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AZURE_MIN_COMPLETION_TOKENS, llmEndpoints } from "@/lib/analyzer/config";
import {
  rateLimitWaitMs,
  resetModelCapabilities,
  structuredGatewayCall,
  type GatewayDeps,
  type StructuredRequest,
} from "@/lib/analyzer/gateway";

// The structured call against the one Azure AI Foundry deployment, with a small closed-set schema
// of the kind the mapper uses: the model may only name ids from an enum, and zod rejects anything
// else. Every transport here is mocked; no request leaves the test.

const Reply = z.object({ ids: z.array(z.enum(["PC1", "PC2"])) });
type ReplyT = z.infer<typeof Reply>;

const request: StructuredRequest<ReplyT> = {
  system: "Link the claim to performance criteria. Allowed ids: PC1, PC2.",
  user: "मैं घर की वायरिंग करता हूँ",
  schemaName: "test_links",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    required: ["ids"],
    properties: { ids: { type: "array", items: { type: "string", enum: ["PC1", "PC2"] } } },
  },
  shapeHint: JSON.stringify({ ids: ["PC1"] }),
  parse: Reply,
  maxTokens: 600,
};

const good: ReplyT = { ids: ["PC1"] };

function reply(content: unknown, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-1",
      choices: [
        {
          message: {
            role: "assistant",
            content: typeof content === "string" ? content : JSON.stringify(content),
          },
        },
      ],
      ...extra,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function azureError(status: number, message: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { message, code: String(status) } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const env = {
  AZURE_OPENAI_BASE_URL: "https://example.services.ai.azure.com/openai/v1/",
  AZURE_OPENAI_API_KEY: "test-key",
  AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
};
const azure = llmEndpoints("link", env);

function deps(fetchImpl: typeof fetch, extra: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    endpoints: azure,
    timeoutMs: 2500,
    fetchImpl,
    rateLimitRetries: 0,
    transientRetries: 0,
    ...extra,
  };
}

type Body = {
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  response_format?: { type: string; json_schema?: { strict?: boolean } };
  max_completion_tokens?: number;
  max_tokens?: number;
  temperature?: number;
  reasoning_effort?: string;
};

beforeEach(() => resetModelCapabilities());

describe("structuredGatewayCall on the Azure deployment", () => {
  it("posts a strict json_schema request with the api-key header, as a reasoning model", async () => {
    let url = "";
    let headers: Record<string, string> = {};
    let body = {} as Body;
    const f = vi.fn(async (u: string, init: RequestInit) => {
      url = u;
      headers = init.headers as Record<string, string>;
      body = JSON.parse(init.body as string) as Body;
      return reply(good);
    }) as unknown as typeof fetch;
    const out = await structuredGatewayCall(deps(f), request);
    expect(out).toMatchObject({
      ok: true,
      data: good,
      endpoint: "azure:gpt-5-mini",
      structured: true,
    });
    expect(url).toBe("https://example.services.ai.azure.com/openai/v1/chat/completions");
    expect(headers["api-key"]).toBe("test-key");
    expect(headers.authorization).toBeUndefined();
    expect(body.model).toBe("gpt-5-mini");
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
    expect(body.reasoning_effort).toBe("low");
    expect(body.max_completion_tokens).toBe(AZURE_MIN_COMPLETION_TOKENS);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it("sends photos as image parts after the text", async () => {
    let body = {} as Body;
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string) as Body;
      return reply(good);
    }) as unknown as typeof fetch;
    await structuredGatewayCall(deps(f), {
      ...request,
      images: [{ mime: "image/jpeg", base64: "aGVsbG8=" }],
    });
    expect(body.messages[1]!.content).toEqual([
      { type: "text", text: request.user },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,aGVsbG8=" } },
    ]);
  });

  it("rejects an id outside the closed set: no data comes back", async () => {
    const f = vi.fn(async () => reply({ ids: ["PC9"] })) as unknown as typeof fetch;
    const out = await structuredGatewayCall(deps(f), request);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("azure:gpt-5-mini: schema");
  });

  it("gives up after the timeout and says so", async () => {
    const f = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    ) as unknown as typeof fetch;
    const out = await structuredGatewayCall(deps(f, { timeoutMs: 30 }), request);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("timeout after 30 ms");
  });

  it("gives a long reply the request's longer timeout, and never a shorter one", async () => {
    const slow = (ms: number) =>
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            const t = setTimeout(() => resolve(reply(good)), ms);
            init.signal?.addEventListener("abort", () => {
              clearTimeout(t);
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          }),
      ) as unknown as typeof fetch;
    const raised = await structuredGatewayCall(deps(slow(60), { timeoutMs: 20 }), {
      ...request,
      minTimeoutMs: 400,
    });
    expect(raised.ok).toBe(true);
    const kept = await structuredGatewayCall(deps(slow(60), { timeoutMs: 20 }), {
      ...request,
      minTimeoutMs: 5,
    });
    expect(kept.ok).toBe(false);
    if (!kept.ok) expect(kept.error).toContain("timeout after 20 ms");
  });

  it("asks again in prose, with the shape in the prompt, when the schema is refused", async () => {
    const bodies: Body[] = [];
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Body;
      bodies.push(body);
      if (body.response_format?.type === "json_schema")
        return azureError(400, "response_format json_schema is not supported for this deployment");
      return reply(good);
    }) as unknown as typeof fetch;
    const out = await structuredGatewayCall(deps(f), request);
    expect(out).toMatchObject({ ok: true, mode: "prompt", structured: false });
    expect(bodies[1]!.response_format).toBeUndefined();
    expect(String(bodies[1]!.messages[0]!.content)).toContain(
      "Return one JSON object and nothing else.",
    );
    // Remembered: the next call goes straight to prose.
    await structuredGatewayCall(deps(f), request);
    expect(bodies[2]!.response_format).toBeUndefined();
  });

  it("retries once in prose when a strict generation fails validation", async () => {
    const bodies: Body[] = [];
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Body;
      bodies.push(body);
      if (body.response_format?.type === "json_schema")
        return azureError(400, "Failed to validate JSON");
      return reply(good);
    }) as unknown as typeof fetch;
    const out = await structuredGatewayCall(deps(f), request);
    expect(out).toMatchObject({ ok: true, mode: "prompt" });
    expect(bodies).toHaveLength(2);
  });

  it("reports the error when no endpoint is configured", async () => {
    const out = await structuredGatewayCall({ endpoints: [], timeoutMs: 100 }, request);
    expect(out).toMatchObject({ ok: false, error: "no LLM endpoint configured" });
  });
});

describe("rate limits", () => {
  it("waits out HTTP 429 on the same deployment, as long as Azure asks", async () => {
    const waits: number[] = [];
    let calls = 0;
    const f = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? azureError(
            429,
            "Requests have exceeded token rate limit. Please retry after 6 seconds.",
            {
              "retry-after-ms": "6000",
            },
          )
        : reply(good);
    }) as unknown as typeof fetch;
    const out = await structuredGatewayCall(
      deps(f, { rateLimitRetries: 2, sleep: async (ms) => void waits.push(ms) }),
      request,
    );
    expect(out).toMatchObject({ ok: true, rateLimitWaits: 1 });
    expect(waits).toEqual([6250]);
  });

  it("reads Azure's retry-after-ms first, then retry-after, then a reset header", () => {
    expect(rateLimitWaitMs(new Headers({ "retry-after-ms": "1500", "retry-after": "9" }))).toBe(
      1500,
    );
    expect(rateLimitWaitMs(new Headers({ "retry-after": "7" }))).toBe(7000);
    expect(rateLimitWaitMs(new Headers({ "x-ratelimit-reset-tokens": "1m26.4s" }))).toBe(86400);
    expect(rateLimitWaitMs(new Headers())).toBe(5000);
  });

  it("does not wait out a spent quota: it fails at once with the provider's message", async () => {
    const sleep = vi.fn(async () => {});
    const f = vi.fn(async () =>
      azureError(429, "You exceeded your current quota."),
    ) as unknown as typeof fetch;
    const out = await structuredGatewayCall(deps(f, { rateLimitRetries: 3, sleep }), request);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("exceeded your current quota");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("reports the token usage Azure returns", async () => {
    const f = vi.fn(async () =>
      reply(good, { usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 } }),
    ) as unknown as typeof fetch;
    const out = await structuredGatewayCall(deps(f), request);
    expect(out).toMatchObject({ ok: true, usage: { prompt: 120, completion: 80 } });
  });
});

describe("no call waits for ever", () => {
  it("abandons a request that ignores its abort, at the hard deadline", async () => {
    const f = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const started = Date.now();
    const out = await structuredGatewayCall(deps(f, { timeoutMs: 20, hardGraceMs: 30 }), request);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("hard timeout after 50 ms");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("retries a server error on the same model a bounded number of times, and reports each attempt", async () => {
    const events: string[] = [];
    let calls = 0;
    const f = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? azureError(503, "Service unavailable") : reply(good);
    }) as unknown as typeof fetch;
    const out = await structuredGatewayCall(
      deps(f, {
        transientRetries: 2,
        sleep: async () => {},
        onEvent: (e) => events.push(`${e.kind}:${e.attempt}`),
      }),
      { ...request, label: "link test" },
    );
    expect(out.ok).toBe(true);
    expect(events).toEqual(["start:1", "retry:1", "start:2", "ok:2"]);
  });

  it("stops after the retries it is allowed", async () => {
    const f = vi.fn(async () => azureError(503, "Service unavailable")) as unknown as typeof fetch;
    const out = await structuredGatewayCall(
      deps(f, { transientRetries: 2, sleep: async () => {} }),
      request,
    );
    expect(out.ok).toBe(false);
    // json_schema mode: 1 try + 2 retries; the prose fallback is not tried for a server error.
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("says plainly when a reply was cut off at the token limit", async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "length", message: { content: '{"ids": ["PC' } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    const out = await structuredGatewayCall(deps(f), request);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("truncated: the reply reached max_completion_tokens");
  });
});

describe("content filter", () => {
  it("names the category Azure's filter blocked, and does not retry it", async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "content_filter",
              message:
                "The response was filtered due to the prompt triggering Azure OpenAI's content management policy.",
              innererror: {
                code: "ResponsibleAIPolicyViolation",
                content_filter_result: {
                  hate: { filtered: false, severity: "safe" },
                  sexual: { filtered: true, severity: "medium" },
                },
              },
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    const out = await structuredGatewayCall(
      deps(f, { transientRetries: 2, sleep: async () => {} }),
      request,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain("content filter: sexual (medium) in the prompt");
      expect(out.contentFilter).toBe("sexual (medium) in the prompt");
    }
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("network failure", () => {
  it("says why fetch failed, and retries it as transient", async () => {
    const f = vi.fn(async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
      });
    }) as unknown as typeof fetch;
    const out = await structuredGatewayCall(
      deps(f, { transientRetries: 1, sleep: async () => {} }),
      request,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("fetch failed (UND_ERR_SOCKET: other side closed)");
    expect(f).toHaveBeenCalledTimes(2);
  });
});
