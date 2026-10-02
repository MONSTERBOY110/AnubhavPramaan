import type { z } from "zod";
import type { LlmEndpoint, StructuredMode } from "./config";

// One JSON object from the configured endpoint. Adapted from Saakshi (MIT), where it carried the
// advisory analyzer; here it carries claim extraction, PC linking and evidence hints. Every caller
// validates the reply with zod against closed sets, so a model can suggest but never decide.
//
// The endpoint is OpenAI-compatible (the Azure AI Foundry v1 API, lib/analyzer/config.ts): POST
// {baseUrl}/chat/completions with the key in an `api-key` header, content at
// choices[0].message.content. It is asked for a strict json_schema; if it ever refuses one, the
// shape is described in the prompt instead. A request may carry images (evidence hints).
//
// Capabilities are learned once per endpoint and remembered: a model the account cannot use is
// dropped from later attempts, and a model that refuses response_format is asked in prose instead.

export type GatewayDeps = {
  /** Tried in order; the first usable endpoint wins. */
  endpoints: LlmEndpoint[];
  /** Per attempt: the request is aborted after this, and abandoned for good HARD_GRACE_MS later. */
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Test seam for the waits between retries. */
  sleep?: (ms: number) => Promise<void>;
  /** Retries on the SAME model after HTTP 429, waiting as long as the provider asks (default 3). */
  rateLimitRetries?: number;
  /** Retries on the SAME model after a timeout, a network error or HTTP 5xx (default 2). */
  transientRetries?: number;
  /** Called at every attempt, so a caller can print progress and a stall shows at once. */
  onEvent?: (event: GatewayEvent) => void;
  /** Test seam: how long after its abort a pending request is abandoned (default HARD_GRACE_MS). */
  hardGraceMs?: number;
};

export type GatewayEvent = {
  kind: "start" | "ok" | "retry" | "fail";
  /** The request's label, for example "extract answer 3" or "link CON/Q0602". */
  label?: string;
  endpoint: string;
  mode: StructuredMode;
  attempt: number;
  ms?: number;
  usage?: { prompt: number; completion: number };
  error?: string;
  waitMs?: number;
};

/** A request still pending this long after its abort is abandoned, whatever fetch is doing. */
export const HARD_GRACE_MS = 5000;

/** HTTP 429 from the provider, with how long it asked us to wait. */
export class RateLimited extends Error {
  constructor(
    readonly waitMs: number,
    message: string,
  ) {
    super(message);
    this.name = "RateLimited";
  }
}

/**
 * The provider's content filter refused the request. A fixed property of the deployed system
 * (lead, 2 Oct 13:03), never retried: the caller falls back and says so.
 */
export class ContentFiltered extends Error {
  constructor(
    readonly note: string,
    status: number,
  ) {
    super(`HTTP ${status}: content filter: ${note}`);
    this.name = "ContentFiltered";
  }
}

/** Longest single wait for a rate limit; a per-minute token window resets within a minute. */
const MAX_RATE_WAIT_MS = 65_000;

/**
 * How long a 429 asks us to wait: Azure's `retry-after-ms`, else `retry-after` in seconds, else an
 * OpenAI-style `x-ratelimit-reset-tokens` ("7.66s", "1m26.4s"), else 5 seconds.
 */
export function rateLimitWaitMs(headers: Headers): number {
  const retryAfterMs = Number(headers.get("retry-after-ms"));
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return Math.ceil(retryAfterMs);
  const retryAfter = Number(headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter * 1000);
  const reset =
    headers.get("x-ratelimit-reset-tokens") ?? headers.get("x-ratelimit-reset-requests");
  const m = reset ? /^(?:(\d+)m)?(?:([\d.]+)s)?$/.exec(reset.trim()) : null;
  if (m && (m[1] || m[2])) return Math.ceil((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 1000);
  return 5000;
}

export type StructuredRequest<T> = {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  /** Shape description used when the model has no schema enforcement. */
  shapeHint: string;
  parse: z.ZodType<T>;
  maxTokens: number;
  /** Photos sent with the user text (evidence hints), as base64 with their media type. */
  images?: Array<{ mime: string; base64: string }>;
  /** Names the call in progress events. */
  label?: string;
  /** Floor for the per-attempt timeout, for a call whose reply can be long; never lowers it. */
  minTimeoutMs?: number;
};

export type StructuredOutcome<T> =
  | {
      ok: true;
      data: T;
      model: string;
      provider: string;
      endpoint: string;
      latencyMs: number;
      requestId?: string;
      /** True when the server enforced the JSON schema (json_schema mode). */
      structured: boolean;
      mode: StructuredMode;
      /** Tokens billed, when the provider reports them; used for cost per candidate. */
      usage?: { prompt: number; completion: number };
      /** Times this call waited out a rate limit on the same model. */
      rateLimitWaits: number;
    }
  | {
      ok: false;
      error: string;
      latencyMs: number;
      /** Set when the provider's content filter refused the request, e.g. "sexual (medium) in the prompt". */
      contentFilter?: string;
    };

type EndpointState = { noAccess?: boolean; schemaRefused?: boolean };
const endpointState = new Map<string, EndpointState>();
const stateKey = (ep: LlmEndpoint) => `${ep.baseUrl}|${ep.model}`;

/** Test seam: forget what was learned about each endpoint. */
export function resetModelCapabilities(): void {
  endpointState.clear();
}

/** Ask for one JSON object, trying each endpoint until one answers usefully. */
export async function structuredGatewayCall<T>(
  deps: GatewayDeps,
  req: StructuredRequest<T>,
): Promise<StructuredOutcome<T>> {
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const errors: string[] = [];
  let contentFilter: string | undefined;
  const endpoints = deps.endpoints;
  if (endpoints.length === 0) {
    return { ok: false, error: "no LLM endpoint configured", latencyMs: now() - started };
  }

  for (const ep of endpoints) {
    const state = endpointState.get(stateKey(ep)) ?? {};
    if (state.noAccess) continue;
    for (const mode of modesFor(ep, state)) {
      try {
        const { content, requestId, usage, waits } = await callWithRetries(deps, ep, req, mode);
        const parsed = req.parse.safeParse(parseJsonObject(content));
        if (!parsed.success) {
          errors.push(`${ep.id}: schema: ${parsed.error.issues[0]?.message ?? "invalid"}`);
          break; // next endpoint
        }
        return {
          ok: true,
          data: parsed.data,
          model: ep.model,
          provider: ep.provider,
          endpoint: ep.id,
          latencyMs: now() - started,
          requestId,
          structured: mode === "json_schema",
          mode,
          usage,
          rateLimitWaits: waits,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${ep.id}: ${message}`);
        if (err instanceof ContentFiltered) contentFilter = err.note;
        if (mode === "json_schema" && refusesSchema(message)) {
          endpointState.set(stateKey(ep), { ...state, schemaRefused: true });
          continue; // same endpoint, shape described in the prompt, from now on
        }
        if (mode === "json_schema" && failedValidation(message)) {
          continue; // same endpoint, shape described in the prompt, this call only
        }
        if (noAccess(message)) endpointState.set(stateKey(ep), { ...state, noAccess: true });
        break; // next endpoint
      }
    }
  }
  return {
    ok: false,
    error: errors.join(" | "),
    latencyMs: now() - started,
    ...(contentFilter ? { contentFilter } : {}),
  };
}

/** json_schema endpoints fall back to prose once the model has refused a schema. */
function modesFor(ep: LlmEndpoint, state: EndpointState): StructuredMode[] {
  if (ep.structured === "json_schema")
    return state.schemaRefused ? ["prompt"] : ["json_schema", "prompt"];
  return [ep.structured];
}

function refusesSchema(message: string): boolean {
  return /does not support response_format|response_format|json_schema|structured output/i.test(
    message,
  );
}

/** The model produced something that did not match the schema (strict modes report a 400). */
function failedValidation(message: string): boolean {
  return /failed to validate json|failed_generation|does not match (the )?schema/i.test(message);
}

function noAccess(message: string): boolean {
  return /does not have access|model_not_found|does not exist|not found|decommissioned|HTTP 401|HTTP 403/i.test(
    message,
  );
}

/** A timeout, a network failure or a server error: worth one more try on the same model. */
function transient(message: string): boolean {
  return /timeout after|hard timeout|fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|HTTP 5\d\d/i.test(
    message,
  );
}

/** Rejects if the promise has not settled after `ms`, whatever the promise itself is waiting on. */
function withHardDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`hard timeout after ${ms} ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * callOnce with bounded retries on the SAME model, so a run never silently switches models and no
 * call can wait for ever: each attempt has a hard deadline; a 429 is retried at most
 * rateLimitRetries times after the wait the provider asks for (capped); a timeout, network error
 * or 5xx at most transientRetries times, 2 s then 4 s apart. Every attempt is reported to onEvent.
 */
async function callWithRetries<T>(
  deps: GatewayDeps,
  ep: LlmEndpoint,
  req: StructuredRequest<T>,
  mode: StructuredMode,
): Promise<{
  content: string;
  requestId?: string;
  usage?: { prompt: number; completion: number };
  waits: number;
}> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const rateRetries = deps.rateLimitRetries ?? 3;
  const transientRetries = deps.transientRetries ?? 2;
  const base = { label: req.label, endpoint: ep.id, mode };
  const timeoutMs = Math.max(deps.timeoutMs, req.minTimeoutMs ?? 0);
  let waits = 0;
  let transients = 0;
  for (let attempt = 1; ; attempt++) {
    const started = now();
    deps.onEvent?.({ ...base, kind: "start", attempt });
    try {
      const out = await withHardDeadline(
        callOnce({ ...deps, timeoutMs }, ep, req, mode),
        timeoutMs + (deps.hardGraceMs ?? HARD_GRACE_MS),
      );
      deps.onEvent?.({ ...base, kind: "ok", attempt, ms: now() - started, usage: out.usage });
      return { ...out, waits };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const ms = now() - started;
      if (err instanceof RateLimited && waits < rateRetries) {
        waits += 1;
        const waitMs = Math.min(MAX_RATE_WAIT_MS, err.waitMs + 250);
        deps.onEvent?.({ ...base, kind: "retry", attempt, ms, error: message, waitMs });
        await sleep(waitMs);
        continue;
      }
      if (!(err instanceof RateLimited) && transient(message) && transients < transientRetries) {
        transients += 1;
        const waitMs = 2000 * transients;
        deps.onEvent?.({ ...base, kind: "retry", attempt, ms, error: message, waitMs });
        await sleep(waitMs);
        continue;
      }
      deps.onEvent?.({ ...base, kind: "fail", attempt, ms, error: message });
      throw err;
    }
  }
}

async function callOnce<T>(
  deps: GatewayDeps,
  ep: LlmEndpoint,
  req: StructuredRequest<T>,
  mode: StructuredMode,
): Promise<{
  content: string;
  requestId?: string;
  usage?: { prompt: number; completion: number };
}> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  const system =
    mode === "json_schema" ? req.system : `${req.system}\n\n${shapeInstruction(req.shapeHint)}`;
  const user = req.images?.length
    ? [
        { type: "text", text: req.user },
        ...req.images.map((i) => ({
          type: "image_url",
          image_url: { url: `data:${i.mime};base64,${i.base64}` },
        })),
      ]
    : req.user;
  // A reasoning model: no temperature, and max_completion_tokens covers reasoning and answer.
  const body: Record<string, unknown> = {
    model: ep.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_completion_tokens: Math.max(req.maxTokens, ep.minCompletionTokens ?? 0),
    ...(ep.extras ?? {}),
  };
  if (mode === "json_schema") {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
    };
  } else if (mode === "json_object") {
    body.response_format = { type: "json_object" };
  }
  try {
    const res = await fetchImpl(`${ep.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "api-key": ep.apiKey,
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as {
      id?: string;
      request_id?: string;
      message?: string;
      error?:
        { message?: string; code?: string; type?: string; failed_generation?: string } | string;
      metadata?: { errors?: string[] };
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | null;
    if (res.status === 429) {
      const said =
        typeof json?.error === "string" ? json.error : (json?.error?.message ?? "rate limited");
      // A spent quota does not come back in a minute: fail at once, with the provider's words.
      if (/per day|TPD|RPD|insufficient_quota|exceeded your current quota/i.test(said))
        throw new Error(`HTTP 429: ${said}`);
      throw new RateLimited(rateLimitWaitMs(res.headers), `HTTP 429: ${said}`);
    }
    if (!res.ok) {
      // Azure's content filter answers 400 with the category it blocked; name it, since the cause
      // is a setting on the deployment, not the request (and a retry gets the same answer).
      const filter = contentFilterNote(json?.error);
      if (filter) throw new ContentFiltered(filter, res.status);
      const providerError =
        typeof json?.error === "string" ? json.error : (json?.error?.message ?? undefined);
      // Some hosts return the text that failed their schema check; the first line says why.
      const failed =
        typeof json?.error === "object" && json.error?.failed_generation
          ? ` (generation: ${json.error.failed_generation.replace(/\s+/g, " ").slice(0, 160)})`
          : "";
      const detail =
        json?.metadata?.errors?.join("; ") ?? `${providerError ?? json?.message ?? ""}${failed}`;
      throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    const choice = (json?.choices?.[0] ?? {}) as { finish_reason?: string };
    if (choice.finish_reason === "length")
      throw new Error("truncated: the reply reached max_completion_tokens before it was complete");
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content) throw new Error("empty content");
    const usage =
      typeof json?.usage?.prompt_tokens === "number" &&
      typeof json?.usage?.completion_tokens === "number"
        ? { prompt: json.usage.prompt_tokens, completion: json.usage.completion_tokens }
        : undefined;
    return { content, requestId: json?.request_id ?? json?.id, usage };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`timeout after ${deps.timeoutMs} ms`);
    }
    // Node reports every network failure as "fetch failed"; the cause says which one.
    const cause = err instanceof Error ? (err.cause as { code?: string; message?: string }) : null;
    if (
      err instanceof Error &&
      err.message === "fetch failed" &&
      cause &&
      typeof cause === "object"
    ) {
      const detail = [cause.code, cause.message].filter(Boolean).join(": ");
      if (detail) throw new Error(`fetch failed (${detail})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** "sexual (medium)" for an Azure content-filter error; null for any other error. */
export function contentFilterNote(error: unknown): string | null {
  const e = error as {
    code?: string;
    innererror?: {
      content_filter_result?: Record<string, { filtered?: boolean; severity?: string }>;
    };
  } | null;
  if (!e || typeof e !== "object" || e.code !== "content_filter") return null;
  const hits = Object.entries(e.innererror?.content_filter_result ?? {})
    .filter(([, r]) => r?.filtered)
    .map(([category, r]) => `${category}${r.severity ? ` (${r.severity})` : ""}`);
  return hits.length ? `${hits.join(", ")} in the prompt` : "the prompt was filtered";
}

/** For models without schema enforcement: describe the shape and demand bare JSON. */
function shapeInstruction(shape: string): string {
  return [
    "Return one JSON object and nothing else. No prose, no code fences.",
    "Shape:",
    shape,
    "Every key must be present; use an empty array when there is nothing to report.",
  ].join("\n");
}

/** Tolerate a code fence or stray prose around the object (prompt-only mode). */
function parseJsonObject(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("response was not JSON");
  }
}
