import { describe, expect, it } from "vitest";
import { keywordLinks, sentences, wordFullKey, wordKey } from "@/lib/mapping/keyword";
import { getPack } from "@/lib/packs/load";

// The keyword baseline on sentences written for this test (never the frozen eval set).

describe("word keys", () => {
  it("brings verb forms of the same word together", () => {
    expect(wordKey("मोड़ता")).toBe(wordKey("मोड़ना"));
    expect(wordKey("बिछाता")).toBe(wordKey("बिछाते"));
  });

  it("reads spelled-out letters as the acronym", () => {
    expect(wordKey("एमसीबी")).toBe("mcb");
    expect(wordKey("MCB")).toBe("mcb");
    expect(wordKey("डीबी")).toBe(wordKey("db"));
  });

  it("drops stopwords", () => {
    expect(wordKey("का")).toBe("");
    expect(wordKey("hai")).toBe("");
  });
});

describe("keyword links", () => {
  const pack = getPack("CON/Q0602");

  it("finds a PC from its synonyms and quotes the whole sentence", () => {
    const links = keywordLinks(["मैं हर सर्किट में मेगर टेस्ट करता हूँ। बाकी काम सीखा है।"], pack);
    const megger = links.find((l) => l.pcId === "CON/N0604.PC10");
    expect(megger?.quote).toBe("मैं हर सर्किट में मेगर टेस्ट करता हूँ।");
    expect(megger?.answer).toBe(0);
  });

  it("skips a sentence that says the worker does not do it", () => {
    expect(
      keywordLinks(["मेगर टेस्ट मैं नहीं करता।"], pack).find((l) => l.pcId === "CON/N0604.PC10"),
    ).toBeUndefined();
  });

  it("splits answers into sentences on the danda and full stop", () => {
    expect(sentences("पाइप बिछाता हूँ। तार खींचता हूँ. ठीक है")).toEqual([
      "पाइप बिछाता हूँ।",
      "तार खींचता हूँ.",
      "ठीक है",
    ]);
  });

  it("returns nothing for an answer with no activity", () => {
    expect(keywordLinks(["हाँ, किया है।"], pack)).toEqual([]);
  });
});

describe("one-word synonyms match whole words only", () => {
  const mason = getPack("CON/Q0103");

  it("does not read करता (does) as करनी (trowel), तार (wire) as तराई (curing), or पाइप as PPE", () => {
    expect(wordFullKey("करता")).not.toBe(wordFullKey("करनी"));
    expect(wordFullKey("PPE")).toBe("ppe");
    const links = keywordLinks(
      ["पाइप में तार खींचता हूँ। हर सर्किट में मेगर टेस्ट करता हूँ।"],
      mason,
    );
    expect(links.map((l) => l.synonym)).toEqual([]);
  });

  it("never uses a one-word synonym shorter than three consonants on its own", () => {
    expect(keywordLinks(["दीवार की तराई करता हूँ।"], mason).map((l) => l.synonym)).not.toContain(
      "तराई",
    );
  });

  it("finds every one-word synonym of three or more consonants when it is said", () => {
    const singles = mason.nos
      .flatMap((n) =>
        n.pcs.flatMap((pc) => (pc.synonyms ?? []).map((syn) => ({ pcId: pc.id, syn }))),
      )
      .filter(({ syn }) => !/\s/.test(syn.trim()) && wordFullKey(syn).length >= 3)
      .slice(0, 10);
    expect(singles.length).toBeGreaterThan(0);
    for (const { pcId, syn } of singles) {
      const links = keywordLinks([`मैं ${syn} का काम रोज़ करता हूँ।`], mason);
      expect(
        links.some((l) => l.pcId === pcId) || links.some((l) => l.synonym === syn),
        `${syn}`,
      ).toBe(true);
    }
  });
});
