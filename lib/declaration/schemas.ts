import { z } from "zod";

// The self-declaration (TRD section 3). A declaration is the worker's own words, answer by answer,
// plus the claims extracted from them. Every claim keeps a verbatim quote that must occur in the
// answer it came from, so the assessor can always see what the worker actually said.

export const AnswerSchema = z.object({
  topic: z.string(),
  q: z.string(),
  /** Redacted transcript of the answer, as the worker confirmed or corrected it. */
  text: z.string(),
  /** Who turned speech into text: Bhashini, a labelled development stand-in, or typed by hand. */
  source: z.enum(["bhashini", "elevenlabs-standin", "groq-whisper-fallback", "typed"]),
  sourceLabel: z.string(),
  seconds: z.number().nonnegative().optional(),
  edited: z.boolean().default(false),
  /**
   * Set by the server when claims are extracted: who found them, under what label, and whether the
   * AI provider's content filter refused the answer (the claims then come from the rules).
   */
  extraction: z
    .object({
      source: z.enum(["llm", "rules"]),
      label: z.string(),
      contentFilter: z.boolean().optional(),
      at: z.string(),
    })
    .optional(),
  /** The transcript as first heard, kept by the server when a correction or a typed summary replaces it. */
  heard: z.object({ text: z.string(), sourceLabel: z.string() }).optional(),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  /** Index of the answer the claim came from. */
  answer: z.number().int().nonnegative(),
  /** One-line English summary of what the worker says they do. */
  summary: z.string().min(3),
  /** The same in simple Hindi, for the read-back the worker hears. */
  summaryHi: z.string().optional(),
  /** Verbatim span of the answer; validated as a substring before the claim is kept. */
  quote: z.string().min(2),
  tasks: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  years: z.number().nonnegative().optional(),
  setting: z.string().optional(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const SelfDeclarationSchema = z.object({
  id: z.string(),
  candidateRef: z.string(),
  lang: z.string(),
  consentAt: z.string(),
  answers: z.array(AnswerSchema),
  claims: z.array(ClaimSchema),
  /** Set when the worker heard the read-back and said it is right. */
  confirmedAt: z.string().optional(),
  readBack: z.string().optional(),
});
export type SelfDeclaration = z.infer<typeof SelfDeclarationSchema>;
