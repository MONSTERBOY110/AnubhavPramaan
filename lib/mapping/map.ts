import "server-only";
import type { GatewayDeps } from "@/lib/analyzer/gateway";
import { extractClaims } from "@/lib/declaration/extract";
import type { Claim } from "@/lib/declaration/schemas";
import type { QualificationPack } from "@/lib/packs/schema";
import { coverage, type Coverage } from "./coverage";
import { keywordLinks, KEYWORD_LABEL } from "./keyword";
import { linkClaims, LINK_PROMPT_VERSION } from "./link";
import {
  gapPlan,
  suggestRoute,
  type GapGroup,
  type RouteRule,
  type RouteSuggestion,
} from "./route";

// The mapper (TRD M2): every candidate pack is scored and the best is suggested. A suggestion
// only: the assessor confirms or changes the QP and the route on the match screen.
//
// Two modes. "llm": claims (extracted per answer with verbatim quotes) are linked to PCs by the
// model, constrained to the pack's PC codes. "keyword": the keyword baseline, no model, for when no
// LLM is reachable. The mode travels with the result and is shown on screen.

export type MappingMode = "llm" | "keyword";

export type EvidenceLink = {
  pcId: string;
  quote: string;
  /** The claim the link rests on (LLM mode) or the synonym that matched (keyword mode). */
  claimId?: string;
  synonym?: string;
  confidence: number;
  answer: number;
};

export type PackMapping = {
  pack: { id: string; version: string; title: string; status: "active" | "deactivated" };
  coverage: Coverage;
  links: EvidenceLink[];
  linkError?: string;
};

export type MappingResult = {
  mode: MappingMode;
  label: string;
  /** Pack with the highest weighted coverage, or null when no pack has any supported PC. */
  best: string | null;
  packs: PackMapping[];
  route: RouteSuggestion | null;
  routeBothRules: Record<RouteRule, RouteSuggestion> | null;
  gaps: GapGroup[];
  claims: Claim[];
  ledger: {
    promptVersion: string;
    models: string[];
    claimsRejected: number;
    linksDropped: number;
    tokens: { prompt: number; completion: number };
    rateLimitWaits: number;
    /** Answers whose claims came from the rule-based fallback instead of the model. */
    extractionFallbacks: number;
    /**
     * Indexes of the answers the provider's content filter refused (also counted as fallbacks):
     * a fixed property of the deployed system, handled by the rules as in the live app.
     */
    contentFilterBlocked: number[];
  };
};

export type MapInput = {
  answers: Array<{ topic: string; q: string; text: string }>;
  claims?: Claim[];
};

export async function mapDeclaration(
  input: MapInput,
  packs: QualificationPack[],
  opts: { mode: MappingMode; gateway?: GatewayDeps; env?: Record<string, string | undefined> },
): Promise<MappingResult> {
  const ledger: MappingResult["ledger"] = {
    promptVersion: opts.mode === "llm" ? LINK_PROMPT_VERSION : "keyword-v1",
    models: [],
    claimsRejected: 0,
    linksDropped: 0,
    tokens: { prompt: 0, completion: 0 },
    rateLimitWaits: 0,
    extractionFallbacks: 0,
    contentFilterBlocked: [],
  };
  const addUsage = (u?: { prompt: number; completion: number }) => {
    if (!u) return;
    ledger.tokens.prompt += u.prompt;
    ledger.tokens.completion += u.completion;
  };
  const addModel = (m?: string) => {
    if (m && !ledger.models.includes(m)) ledger.models.push(m);
  };

  let claims: Claim[] = input.claims ?? [];
  const results: PackMapping[] = [];

  if (opts.mode === "llm") {
    if (!input.claims) {
      claims = [];
      for (const [i, a] of input.answers.entries()) {
        const out = await extractClaims(a, i, { gateway: opts.gateway, env: opts.env });
        claims.push(...out.claims);
        ledger.claimsRejected += out.rejected;
        // An empty answer has nothing to extract, so it is not a fallback.
        if (out.source === "rules" && a.text.trim()) ledger.extractionFallbacks += 1;
        if (out.contentFilter) ledger.contentFilterBlocked.push(i);
        addUsage(out.usage);
        addModel(out.model);
      }
    }
    const byId = new Map(claims.map((c) => [c.id, c]));
    for (const pack of packs) {
      const out = await linkClaims(claims, pack, {
        gateway: opts.gateway,
        env: opts.env,
        topics: input.answers.map((a) => a.topic),
      });
      addUsage(out.usage);
      addModel(out.model);
      ledger.linksDropped += out.dropped;
      ledger.rateLimitWaits += out.rateLimitWaits ?? 0;
      const links = out.links.map((l) => {
        const c = byId.get(l.claimId)!;
        return {
          pcId: l.pcId,
          quote: c.quote,
          claimId: c.id,
          confidence: l.confidence,
          answer: c.answer,
        };
      });
      results.push(packMapping(pack, links, out.ok ? undefined : out.error));
    }
  } else {
    const texts = input.answers.map((a) => a.text);
    for (const pack of packs) {
      const links = keywordLinks(texts, pack).map((l) => ({
        pcId: l.pcId,
        quote: l.quote,
        synonym: l.synonym,
        confidence: 1,
        answer: l.answer,
      }));
      results.push(packMapping(pack, links));
    }
  }

  const ranked = [...results].sort(
    (a, b) =>
      b.coverage.weighted - a.coverage.weighted ||
      Number(a.pack.status === "deactivated") - Number(b.pack.status === "deactivated"),
  );
  const top = ranked[0];
  const best = top && top.coverage.covered.length > 0 ? top : null;
  const bestPack = best ? packs.find((p) => p.id === best.pack.id)! : null;
  return {
    mode: opts.mode,
    label:
      opts.mode === "llm"
        ? `Suggested by ${ledger.models.join(", ") || "LLM"} (claims linked to PCs)`
        : KEYWORD_LABEL,
    best: best?.pack.id ?? null,
    packs: results,
    route: best ? suggestRoute(best.coverage) : null,
    routeBothRules: best
      ? {
          flat: suggestRoute(best.coverage, "flat"),
          weighted: suggestRoute(best.coverage, "weighted"),
        }
      : null,
    gaps: best && bestPack ? gapPlan(bestPack, best.coverage) : [],
    claims,
    ledger,
  };
}

function packMapping(
  pack: QualificationPack,
  links: EvidenceLink[],
  linkError?: string,
): PackMapping {
  return {
    pack: { id: pack.id, version: pack.version, title: pack.title, status: pack.status },
    coverage: coverage(
      pack,
      links.map((l) => l.pcId),
    ),
    links,
    linkError,
  };
}
