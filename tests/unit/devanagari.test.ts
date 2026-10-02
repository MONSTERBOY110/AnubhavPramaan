import { describe, expect, it } from "vitest";
import { devanagariToRoman, hasDevanagari, loosen } from "@/lib/text/devanagari";

describe("hasDevanagari", () => {
  it("spots Devanagari and leaves plain Roman alone", () => {
    expect(hasDevanagari("माय नेम इस मिसेज शर्मा")).toBe(true);
    expect(hasDevanagari("Paanch saal, five years")).toBe(false);
    expect(hasDevanagari("पांच साल, five years")).toBe(true);
  });
});

describe("devanagariToRoman", () => {
  it("reads a name closely enough to recognise it", () => {
    expect(loosen(devanagariToRoman("शर्मा"))).toContain("sharma");
    expect(loosen(devanagariToRoman("राहुल"))).toContain("rahul");
  });

  it("keeps Latin text as it is, so Hinglish stays readable", () => {
    expect(devanagariToRoman("पांच साल, five years")).toContain("five years");
  });

  it("drops the inherent vowel after a virama", () => {
    // क् is a bare k, not "ka".
    expect(devanagariToRoman("क्या")).toBe("kyaa");
  });

  it("writes the nasal marks as n", () => {
    // A final consonant keeps its inherent vowel here; no schwa deletion is attempted, because
    // loosen() is what makes the comparison forgiving.
    expect(devanagariToRoman("पांच")).toBe("paancha");
    expect(loosen(devanagariToRoman("पांच"))).toBe("pancha");
  });
});

describe("loosen", () => {
  it("makes doubled vowels and punctuation stop mattering", () => {
    expect(loosen("Shaarmaa")).toBe("sharma");
    expect(loosen("Mrs. Sharma")).toBe("mrs sharma");
  });
});
