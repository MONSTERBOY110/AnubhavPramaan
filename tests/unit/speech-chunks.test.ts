import { describe, expect, it } from "vitest";
import { speechChunks, TTS_MAX_CHARS } from "@/lib/voice/chunks";

describe("speechChunks", () => {
  it("keeps a short text as one part", () => {
    expect(speechChunks("नमस्ते। यह एक जाँच है।")).toEqual(["नमस्ते। यह एक जाँच है।"]);
  });

  it("splits a long read-back at sentence ends, every part within the route's limit", () => {
    const line = "आप पाइप में तार खींचते हैं और हर बोर्ड तक अर्थ का तार ले जाते हैं। ";
    const text = line.repeat(60);
    const parts = speechChunks(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(TTS_MAX_CHARS);
      expect(p.endsWith("।")).toBe(true);
    }
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(text.trim().replace(/\s+/g, " "));
  });

  it("treats a numbered read-back line break as a sentence end", () => {
    const text = Array.from({ length: 40 }, (_, i) => `${i + 1}. आप सॉकेट लगाते हैं`).join("\n");
    const parts = speechChunks(text, 200);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(200);
  });

  it("cuts one over-long sentence at a space, never inside a word", () => {
    const words = Array.from({ length: 400 }, () => "वायरिंग").join(" ");
    const parts = speechChunks(words, 300);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(300);
      expect(p.startsWith(" ") || p.endsWith(" ")).toBe(false);
    }
    expect(parts.join(" ")).toBe(words);
  });

  it("returns nothing for empty text", () => {
    expect(speechChunks("   ")).toEqual([]);
  });
});
