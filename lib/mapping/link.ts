import "server-only";
import { z } from "zod";
import { LLM_TIMEOUT_MS, llmEndpoints } from "@/lib/analyzer/config";
import { structuredGatewayCall, type GatewayDeps } from "@/lib/analyzer/gateway";
import type { Claim } from "@/lib/declaration/schemas";
import type { QualificationPack } from "@/lib/packs/schema";

// Claim to PC linking (TRD M2, step 1): the model proposes which performance criteria each claim
// supports. Its answer is constrained twice: the JSON schema's enum holds only this pack's PC
// codes, so it cannot name a PC that does not exist, and zod checks the reply again. Links below
// the confidence floor are dropped. The model writes no rationale: the evidence shown for a link
// is the claim's own verbatim quote, so the assessor always reads the worker's words.

export const LINK_PROMPT_VERSION = "link-v4";
export const MIN_CONFIDENCE = 0.6;

// link-v3 (2 Oct 11:30, tuned on the dev set only, for gpt-5-mini): link-v2 asked the earlier model
// to link every PC a claim might support, because it under-linked; gpt-5-mini over-links (dev set:
// precision 42%, recall 92%), so v3 asks for the PCs the quote itself shows, makes the site-scope
// check a step before any link, and keeps general habits off procedure PCs. link-v4 (11:33) also
// marks a NOS whose title limits it to temporary work at construction sites as such in the PC list,
// where the model reads each PC, since the scope rule alone did not stop shop or house work being
// linked there.
export const LINK_RULES = `A performance criterion (PC) is supported by a claim when the claim's own words show the worker doing the activity the PC describes, or a concrete activity that is plainly an instance of it.
- Link a claim only to the PCs whose activity its quote shows. Usually that is one PC, sometimes two or three when the quote names each activity. Using a tool supports the PC about using that tool, not every PC in which the tool could be used.
- Several claims may support the same PC. A PC no claim shows stays unlinked: leave it out rather than guess.
- Do not link general claims ("I can do all electrical work"), knowledge without doing, or anything the worker says someone else does.
- Scope comes first. Each claim says which interview answer it came from and, when known, where the work happens. Before linking to a NOS whose title is about temporary lighting or temporary distribution boards at construction sites, check that the claim places the work on a construction site. Work in a house, flat, shop, office or factory never supports such a NOS; link it to the general PC instead (handling breakers and meters, or wiring in permanent structures), or not at all.
- A general safety habit (switching off the main supply, wearing gloves) supports the PC that names that habit or that protective equipment, not PCs about site safety procedures, emergencies, waste or reporting.
- Splicing or joining wires is not terminating a cable, and checking a supply with a meter is not an insulation test.
- A neon line tester is a tool, not a measuring instrument: it can support finding faults or testing a circuit, not PCs that name meters such as a multimeter, tong tester or megger.
- confidence: how sure you are that the quote shows this activity, from 0 to 1.`;

/** "CON/N0602.PC4" to "N0602.4": short codes keep the prompt within the provider's token budget. */
export function shortCode(pcId: string): string {
  const m = /\/(N\d{4})\.PC(\d+)$/.exec(pcId);
  return m ? `${m[1]}.${m[2]}` : pcId;
}

export function packPrompt(pack: QualificationPack, maxWords = 16, maxSynonyms = 2): string {
  const lines = [
    `Qualification Pack ${pack.id} v${pack.version}: ${pack.title} (NSQF ${pack.nsqfLevel}).`,
  ];
  for (const nos of pack.nos) {
    const siteOnly = /temporary/i.test(nos.title) && /construction site/i.test(nos.title);
    lines.push(`${nos.id} ${nos.title}${siteOnly ? " [construction sites only]" : ""}`);
    for (const pc of nos.pcs) {
      const words = pc.text.split(/\s+/);
      const text = words.length > maxWords ? `${words.slice(0, maxWords).join(" ")} ...` : pc.text;
      const syn = (pc.synonyms ?? []).slice(0, maxSynonyms);
      lines.push(`${shortCode(pc.id)}: ${text}${syn.length ? ` [${syn.join(", ")}]` : ""}`);
    }
  }
  return lines.join("\n");
}

export type PcLink = { claimId: string; pcId: string; confidence: number };

export type LinkResult = {
  links: PcLink[];
  /** Links the model proposed below the confidence floor, kept for the AI ledger. */
  dropped: number;
  ok: boolean;
  error?: string;
  model?: string;
  usage?: { prompt: number; completion: number };
  rateLimitWaits?: number;
  latencyMs: number;
};

export async function linkClaims(
  claims: Claim[],
  pack: QualificationPack,
  deps: { gateway?: GatewayDeps; env?: Record<string, string | undefined>; topics?: string[] } = {},
): Promise<LinkResult> {
  const started = Date.now();
  if (claims.length === 0) return { links: [], dropped: 0, ok: true, latencyMs: 0 };
  const codes = pack.nos.flatMap((n) => n.pcs.map((pc) => shortCode(pc.id)));
  const byCode = new Map(
    pack.nos.flatMap((n) => n.pcs.map((pc) => [shortCode(pc.id), pc.id] as const)),
  );
  const claimIds = claims.map((c) => c.id);
  const Out = z.object({
    links: z.array(
      z.object({
        claim: z.enum(claimIds as [string, ...string[]]),
        pc: z.enum(codes as [string, ...string[]]),
        confidence: z.number().min(0).max(1),
      }),
    ),
  });
  const jsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["links"],
    properties: {
      links: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["claim", "pc", "confidence"],
          properties: {
            claim: { type: "string", enum: claimIds },
            pc: { type: "string", enum: codes },
            confidence: { type: "number" },
          },
        },
      },
    },
  };
  const user = [
    "Claims made by the worker (id [where], quote, summary):",
    ...claims.map((c) => {
      const where = [
        deps.topics?.[c.answer] ? `answer about ${deps.topics[c.answer]}` : "",
        c.setting ? `setting: ${c.setting}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      return `${c.id}${where ? ` [${where}]` : ""}: "${c.quote}" | ${c.summary}`;
    }),
    "",
    "Return every supported (claim, PC) link.",
  ].join("\n");
  const gateway = deps.gateway ?? {
    endpoints: llmEndpoints("link", deps.env),
    timeoutMs: LLM_TIMEOUT_MS,
  };
  const out = await structuredGatewayCall(gateway, {
    system: `You link a worker's claimed work activities to the performance criteria of one NSQF Qualification Pack.\n\n${LINK_RULES}\n\nPCs (code: text [words workers use]):\n${packPrompt(pack)}`,
    user,
    schemaName: "pc_links",
    jsonSchema,
    shapeHint: JSON.stringify({ links: [{ claim: claimIds[0], pc: codes[0], confidence: 0.9 }] }),
    parse: Out,
    // Output budget, not prompt: a long declaration has many claims and the reply lists every link
    // (reasoning tokens share this budget). Raised from 3,000 (floored to 4,096) on 2 Oct 12:05.
    maxTokens: 16000,
    // A reply that uses the whole budget took 119 s in a probe on 2 Oct (about 135 tokens a
    // second), longer than the default timeout, so each attempt gets three minutes.
    minTimeoutMs: 180_000,
    label: `link ${pack.id}`,
  });
  if (!out.ok)
    return { links: [], dropped: 0, ok: false, error: out.error, latencyMs: Date.now() - started };
  const seen = new Set<string>();
  const links: PcLink[] = [];
  let dropped = 0;
  for (const l of out.data.links) {
    if (l.confidence < MIN_CONFIDENCE) {
      dropped += 1;
      continue;
    }
    const key = `${l.claim}|${l.pc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ claimId: l.claim, pcId: byCode.get(l.pc)!, confidence: l.confidence });
  }
  return {
    links,
    dropped,
    ok: true,
    model: out.model,
    usage: out.usage,
    rateLimitWaits: out.rateLimitWaits,
    latencyMs: Date.now() - started,
  };
}
