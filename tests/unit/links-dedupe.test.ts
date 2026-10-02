import { describe, expect, it } from "vitest";
import { uniqueByQuote } from "@/lib/mapping/dedupe";

describe("uniqueByQuote", () => {
  it("shows a quote once, keeping its most confident link, in first-seen order", () => {
    const links = [
      { quote: "ड्रिल का तार देखता हूँ", confidence: 0.7, topic: "tools" },
      { quote: "पाइप में तार खींचता हूँ", confidence: 0.8, topic: "wiring" },
      { quote: "ड्रिल का तार देखता हूँ", confidence: 0.9, topic: "tools" },
      { quote: "ड्रिल का तार देखता हूँ", confidence: null, topic: "tools" },
    ];
    expect(uniqueByQuote(links)).toEqual([
      { quote: "ड्रिल का तार देखता हूँ", confidence: 0.9, topic: "tools" },
      { quote: "पाइप में तार खींचता हूँ", confidence: 0.8, topic: "wiring" },
    ]);
  });

  it("prefers a scored link over a keyword match with no confidence", () => {
    const out = uniqueByQuote([
      { quote: "a", confidence: null },
      { quote: "a", confidence: 0.6 },
    ]);
    expect(out).toEqual([{ quote: "a", confidence: 0.6 }]);
  });

  it("returns an empty list unchanged", () => {
    expect(uniqueByQuote([])).toEqual([]);
  });
});
