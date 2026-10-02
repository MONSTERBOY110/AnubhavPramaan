// LLM configuration read from the environment. Kept out of the route files because Next.js route
// modules may only export the HTTP handlers and a few reserved names.
//
// One text model (lead decision, 2 Oct 2026 11:10): the Azure AI Foundry deployment named by
// AZURE_OPENAI_DEPLOYMENT (gpt-5-mini) at AZURE_OPENAI_BASE_URL, an OpenAI-compatible v1 endpoint
// that takes the key in an `api-key` header. No second model and no fallback model, so a run is
// pinned to one deployment; when the call fails, callers fall back to rules (extraction) or say
// "unavailable" (hints). Groq serves this project only as the Whisper speech fallback
// (lib/voice/groq-whisper.ts), never for text.
//
// gpt-5-mini is a reasoning model: it takes no temperature, takes `max_completion_tokens` (the
// reasoning shares that budget, hence a floor), and runs with reasoning_effort "low". Structured
// output is a strict json_schema that the service enforces (live probe, 2 Oct 11:14, STATUS.md).

export type Env = Record<string, string | undefined>;

export type StructuredMode = "json_schema" | "json_object" | "prompt";

export type LlmEndpoint = {
  /** `${provider}:${deployment}`, for logs, run files and the AI ledger. */
  id: string;
  provider: "azure";
  baseUrl: string;
  apiKey: string;
  /** The deployment name, sent as `model`. */
  model: string;
  /** How the endpoint is asked for JSON. json_schema falls back to prompt if the model refuses it. */
  structured: StructuredMode;
  /** Request fields merged into the body. */
  extras?: Record<string, unknown>;
  /** Floor for max_completion_tokens: reasoning tokens count against the same budget. */
  minCompletionTokens?: number;
};

/** How long the server waits for one model call. */
export const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 60000);

export const AZURE_EXTRAS: Record<string, unknown> = { reasoning_effort: "low" };
export const AZURE_MIN_COMPLETION_TOKENS = 4096;

export const AZURE_DEPLOYMENT_DEFAULT = "gpt-5-mini";

/** The Azure deployment, when the endpoint and key are set; null otherwise. */
export function azureEndpoint(env: Env = process.env): LlmEndpoint | null {
  const baseUrl = env.AZURE_OPENAI_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = env.AZURE_OPENAI_API_KEY?.trim();
  const model = env.AZURE_OPENAI_DEPLOYMENT?.trim() || AZURE_DEPLOYMENT_DEFAULT;
  if (!baseUrl || !apiKey) return null;
  return {
    id: `azure:${model}`,
    provider: "azure",
    baseUrl,
    apiKey,
    model,
    structured: "json_schema",
    extras: AZURE_EXTRAS,
    minCompletionTokens: AZURE_MIN_COMPLETION_TOKENS,
  };
}

/** What a call is for, so logs and the AI ledger say which step produced a suggestion. */
export type LlmPurpose = "extract" | "link" | "plan" | "hint" | "analyzer" | "questions";

/**
 * The endpoint for a call: the one Azure deployment, or none. Every purpose shares it; the
 * parameter is kept so logs say which call it was.
 */
export function llmEndpoints(purpose: LlmPurpose, env: Env = process.env): LlmEndpoint[] {
  void purpose;
  const ep = azureEndpoint(env);
  return ep ? [ep] : [];
}
