import "server-only";
import { z } from "zod";
import { LLM_TIMEOUT_MS, llmEndpoints } from "@/lib/analyzer/config";
import { structuredGatewayCall, type GatewayDeps } from "@/lib/analyzer/gateway";
import { sentences } from "@/lib/mapping/keyword";
import type { Claim } from "./schemas";

// Claim extraction (TRD M1): one answer in, the concrete work activities the worker says they do
// out, each with a verbatim quote. The model only proposes claims; this module keeps a claim only
// if its quote occurs in the answer, so every claim the assessor sees rests on words the worker
// actually said. When no model is reachable, a rule-based fallback keeps first-person sentences.

export const EXTRACT_PROMPT_VERSION = "extract-v1";

export const EXTRACT_SYSTEM = `You read one answer from a voice interview in which an Indian informal worker describes their own work experience, in Hindi, Hinglish or English, as transcribed by speech recognition. List the concrete work activities the worker says they themselves do or have done.

Rules:
- Only first-person activities the worker performs or has performed. Skip general claims ("सब आता है", "I can do everything"), knowing about something without doing it, negations ("panel ka kaam nahi kiya"), other people's work ("my senior does the earthing"), and plans for the future.
- quote: copy the exact words of the answer that state the activity, character for character, in the original script and spelling. Use the shortest span that states the activity, usually one clause. Never translate, correct or paraphrase a quote.
- One claim per distinct activity. If one sentence names several distinct activities, make several claims; their quotes may overlap.
- summary: one short English sentence describing the activity.
- summary_hi: the same in simple Hindi in Devanagari, addressed to the worker in the second person (for example "आप पाइप में तार खींचते हैं").
- tasks and tools: short English keywords.
- years: years of experience if this answer states them, else null. setting: where the work happens (house, construction site, factory, shop) if stated, else null.
Return {"claims": []} when the answer names no concrete activity.`;

const ClaimOut = z.object({
  quote: z.string(),
  summary: z.string(),
  summary_hi: z.string(),
  tasks: z.array(z.string()),
  tools: z.array(z.string()),
  years: z.number().nullable(),
  setting: z.string().nullable(),
});
const ExtractOut = z.object({ claims: z.array(ClaimOut) });

const str = { type: "string" };
export const EXTRACT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quote", "summary", "summary_hi", "tasks", "tools", "years", "setting"],
        properties: {
          quote: str,
          summary: str,
          summary_hi: str,
          tasks: { type: "array", items: str },
          tools: { type: "array", items: str },
          years: { type: ["number", "null"] },
          setting: { type: ["string", "null"] },
        },
      },
    },
  },
};

const SHAPE_HINT = JSON.stringify({
  claims: [
    {
      quote: "exact words",
      summary: "string",
      summary_hi: "string",
      tasks: ["string"],
      tools: ["string"],
      years: null,
      setting: null,
    },
  ],
});

/**
 * Find the quote in the answer. Exact first; then with surrounding quote marks and trailing
 * punctuation trimmed. Returns the span as it appears in the answer, or null to reject the claim.
 */
export function locateQuote(answer: string, quote: string): string | null {
  const q = quote.normalize("NFC").trim();
  const a = answer.normalize("NFC");
  if (q.length >= 2 && a.includes(q)) return q;
  const trimmed = q
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[\s।.,;:!?]+$/u, "")
    .trim();
  if (trimmed.length >= 2 && a.includes(trimmed)) return trimmed;
  return null;
}

export type ExtractResult = {
  claims: Claim[];
  /** Model claims dropped because their quote is not in the answer. */
  rejected: number;
  source: "llm" | "rules";
  model?: string;
  usage?: { prompt: number; completion: number };
  latencyMs: number;
  /**
   * Set when the provider's content filter refused the answer (its note, e.g. "sexual (medium) in
   * the prompt"). The claims then come from the rules, as for any failed call, and the caller tells
   * the worker the answer could not be processed automatically.
   */
  contentFilter?: string;
};

export type ExtractDeps = { gateway?: GatewayDeps; env?: Record<string, string | undefined> };

/** Extract claims from one answer. `answerIndex` ties each claim to the answer it came from. */
export async function extractClaims(
  answer: { text: string; q: string; topic: string },
  answerIndex: number,
  deps: ExtractDeps = {},
): Promise<ExtractResult> {
  const started = Date.now();
  const text = answer.text.trim();
  if (!text) return { claims: [], rejected: 0, source: "rules", latencyMs: 0 };
  const gateway = deps.gateway ?? {
    endpoints: llmEndpoints("extract", deps.env),
    timeoutMs: LLM_TIMEOUT_MS,
  };
  const out = await structuredGatewayCall(gateway, {
    system: EXTRACT_SYSTEM,
    user: `Question (${answer.topic}): ${answer.q}\nAnswer: ${text}`,
    schemaName: "claims",
    jsonSchema: EXTRACT_JSON_SCHEMA,
    shapeHint: SHAPE_HINT,
    parse: ExtractOut,
    maxTokens: 1800,
    label: `extract answer ${answerIndex}`,
  });
  if (!out.ok) {
    return {
      claims: ruleClaims(text, answerIndex),
      rejected: 0,
      source: "rules",
      latencyMs: Date.now() - started,
      ...(out.contentFilter ? { contentFilter: out.contentFilter } : {}),
    };
  }
  const claims: Claim[] = [];
  let rejected = 0;
  for (const c of out.data.claims) {
    const quote = locateQuote(text, c.quote);
    if (!quote) {
      rejected += 1;
      continue;
    }
    claims.push({
      id: `a${answerIndex}c${claims.length + 1}`,
      answer: answerIndex,
      summary: c.summary.trim() || quote,
      summaryHi: c.summary_hi.trim() || undefined,
      quote,
      tasks: c.tasks,
      tools: c.tools,
      years: c.years ?? undefined,
      setting: c.setting ?? undefined,
    });
  }
  return {
    claims,
    rejected,
    source: "llm",
    model: out.model,
    usage: out.usage,
    latencyMs: Date.now() - started,
  };
}

const FIRST_PERSON =
  /(हूँ|हूं|करता|करते|करती|किया|लगाता|लगाते|बदलता|बदलते|देखता|देखते|\bhoon\b|\bhun\b|\bkarta\b|\bkarte\b|\bkiya\b)/iu;
const NEGATION = /(नहीं|नही|\bnahi\b|\bnahin\b|\bnever\b)/iu;

/** Fallback when no model answers: every first-person, non-negated sentence is one claim. */
export function ruleClaims(text: string, answerIndex: number): Claim[] {
  return sentences(text)
    .filter((s) => FIRST_PERSON.test(s) && !NEGATION.test(s))
    .map((s, k) => ({
      id: `a${answerIndex}r${k + 1}`,
      answer: answerIndex,
      summary: s,
      summaryHi: s,
      quote: s,
      tasks: [],
      tools: [],
    }));
}
