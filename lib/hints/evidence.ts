import "server-only";
import { z } from "zod";
import { LLM_TIMEOUT_MS, llmEndpoints, type Env } from "@/lib/analyzer/config";
import { structuredGatewayCall } from "@/lib/analyzer/gateway";

// Evidence hints (TRD M4; provider decision updated 2 Oct 2026 11:10: the Azure AI Foundry
// deployment, image input). For one photo and one PC's observables, the model says per observable
// whether it is visible, not visible, or cannot be told, with a one-line reason. It is never asked
// for, and can never return, a level or a mark: the reply schema has no such field, and anything
// else in a reply is discarded.

export const ObservableStatusSchema = z.enum(["visible", "not_visible", "cannot_tell"]);

const Reply = z.object({
  observables: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      status: ObservableStatusSchema,
      reason: z.string(),
    }),
  ),
});

const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    observables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          status: { type: "string", enum: ["visible", "not_visible", "cannot_tell"] },
          reason: { type: "string" },
        },
        required: ["index", "status", "reason"],
      },
    },
  },
  required: ["observables"],
};

export type Hint = {
  observable: string;
  status: z.infer<typeof ObservableStatusSchema>;
  reason: string;
};
export type HintResult =
  | { ok: true; hints: Hint[]; model: string; label: string; latencyMs: number }
  | { ok: false; reason: "no_key" | "upstream" | "invalid"; message: string };

const SYSTEM = `You help a skills assessor look at a photo of electrical or construction work. For each numbered observable, say only whether it is visible in this photo.
- "visible": you can clearly see it.
- "not_visible": the photo shows the relevant area and it is absent or wrong.
- "cannot_tell": the photo does not show enough (angle, distance, blur, cropped).
Give a one-line reason that points at what you see. Do not judge the worker, do not give a score, level, grade or mark, and do not guess beyond the photo.
Return one entry per observable, by its number.`;

const SHAPE = `{"observables": [{"index": 0, "status": "visible" | "not_visible" | "cannot_tell", "reason": "..."}]}`;

export const hintLabel = (model: string) =>
  `AI hint (${model}, image input): what is visible, never a score`;

export async function evidenceHint(
  input: { imageBase64: string; mime: string; pcText: string; observables: string[] },
  deps: { env?: Env; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number } = {},
): Promise<HintResult> {
  const endpoints = llmEndpoints("hint", deps.env ?? process.env);
  if (endpoints.length === 0)
    return {
      ok: false,
      reason: "no_key",
      message: "Evidence hints are unavailable: no vision model is configured.",
    };
  const list = input.observables.map((o, i) => `${i}. ${o}`).join("\n");
  const out = await structuredGatewayCall(
    {
      endpoints,
      timeoutMs: deps.timeoutMs ?? LLM_TIMEOUT_MS,
      fetchImpl: deps.fetchImpl,
      now: deps.now,
      rateLimitRetries: 1,
    },
    {
      system: SYSTEM,
      user: `Performance criterion: ${input.pcText}\nObservables:\n${list}`,
      schemaName: "evidence_hint",
      jsonSchema: REPLY_SCHEMA,
      shapeHint: SHAPE,
      parse: Reply,
      maxTokens: 1500,
      images: [{ mime: input.mime, base64: input.imageBase64 }],
      label: "evidence hint",
    },
  );
  if (!out.ok) {
    const unreadable = /schema|not JSON|empty content/i.test(out.error);
    return unreadable
      ? { ok: false, reason: "invalid", message: "The hint could not be read; no hint is shown." }
      : {
          ok: false,
          reason: "upstream",
          message: "The hint service did not answer; no hint is shown.",
        };
  }
  const byIndex = new Map(out.data.observables.map((o) => [o.index, o]));
  const hints: Hint[] = input.observables.map((observable, i) => {
    const o = byIndex.get(i);
    return o
      ? { observable, status: o.status, reason: o.reason.slice(0, 200) }
      : { observable, status: "cannot_tell", reason: "No answer for this observable." };
  });
  return {
    ok: true,
    hints,
    model: out.endpoint,
    label: hintLabel(out.endpoint),
    latencyMs: out.latencyMs,
  };
}
