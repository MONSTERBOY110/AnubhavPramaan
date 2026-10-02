import { describe, expect, it } from "vitest";
import { AZURE_MIN_COMPLETION_TOKENS, azureEndpoint, llmEndpoints } from "@/lib/analyzer/config";

// The text model is one Azure AI Foundry deployment (lead decision, 2 Oct 2026 11:10): no second
// model, no fallback model, and no endpoint at all unless every setting is present.

const env = {
  AZURE_OPENAI_BASE_URL: "https://example.services.ai.azure.com/openai/v1/",
  AZURE_OPENAI_API_KEY: " key ",
  AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
};

describe("LLM endpoints", () => {
  it("is the one Azure deployment, pinned, as a reasoning model with a strict schema", () => {
    const eps = llmEndpoints("link", env);
    expect(eps).toHaveLength(1);
    expect(eps[0]).toMatchObject({
      id: "azure:gpt-5-mini",
      provider: "azure",
      baseUrl: "https://example.services.ai.azure.com/openai/v1",
      apiKey: "key",
      model: "gpt-5-mini",
      structured: "json_schema",
      extras: { reasoning_effort: "low" },
      minCompletionTokens: AZURE_MIN_COMPLETION_TOKENS,
    });
  });

  it("serves every purpose with the same deployment", () => {
    expect(llmEndpoints("extract", env)).toEqual(llmEndpoints("hint", env));
  });

  it("is empty without the endpoint or the key, and never falls back to another provider", () => {
    for (const missing of ["AZURE_OPENAI_BASE_URL", "AZURE_OPENAI_API_KEY"]) {
      const partial = { ...env, [missing]: " " };
      expect(azureEndpoint(partial)).toBeNull();
      expect(llmEndpoints("link", partial)).toEqual([]);
    }
    expect(llmEndpoints("link", { GROQ_API_KEY: "gsk_test" })).toEqual([]);
  });

  it("uses the gpt-5-mini deployment when none is named", () => {
    expect(azureEndpoint({ ...env, AZURE_OPENAI_DEPLOYMENT: "" })?.id).toBe("azure:gpt-5-mini");
  });
});
