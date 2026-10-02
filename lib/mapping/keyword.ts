import type { QualificationPack } from "@/lib/packs/schema";
import { devanagariToRoman, loosen } from "@/lib/text/devanagari";

// Keyword baseline: links answers to PCs with no model and no network, from the synonyms in each
// pack's reviewed overlay. It is the offline fallback when no LLM is reachable, and the yardstick
// the LLM mapper is compared with. Results are always labelled "keyword baseline, no LLM".
//
// Matching works on a rough phonetic key so Devanagari and Roman Hindi meet: spelled-out letters
// become acronyms (एमसीबी -> mcb), Devanagari is romanised, vowels are dropped, w becomes v, and a
// verb ending is stripped (मोड़ता and मोड़ना both become md). A synonym matches a sentence when
// every content word of the synonym matches a word of the sentence. Sentences with a negation are
// skipped. Deliberately simple: it is a baseline, not the product's mapper.

export const KEYWORD_LABEL = "Keyword baseline, no LLM";

const ACRONYMS: Record<string, string> = {
  एमसीबी: "mcb",
  आरसीसीबी: "rccb",
  ईएलसीबी: "elcb",
  डीबी: "db",
  एलईडी: "led",
  पीवीसी: "pvc",
  जीआई: "gi",
  एसएलडी: "sld",
  डीजी: "dg",
  आरसीसी: "rcc",
  पीपीई: "ppe",
  एसी: "ac",
  यूपीआई: "upi",
  ओटीपी: "otp",
};

const STOPWORDS = new Set(
  [
    "का",
    "की",
    "के",
    "में",
    "से",
    "को",
    "और",
    "पर",
    "भी",
    "है",
    "हैं",
    "हूँ",
    "हूं",
    "था",
    "थे",
    "थी",
    "तो",
    "ही",
    "एक",
    "यह",
    "वह",
    "ka",
    "ki",
    "ke",
    "me",
    "mein",
    "se",
    "ko",
    "aur",
    "par",
    "bhi",
    "hai",
    "hain",
    "hoon",
    "hun",
    "tha",
    "the",
    "to",
    "hi",
    "the",
    "a",
    "an",
    "of",
    "and",
    "or",
    "in",
    "on",
    "with",
    "for",
  ].map((w) => w.normalize("NFC")),
);

const NEGATIONS = new Set(
  ["नहीं", "नही", "मत", "nahi", "nahin", "nai", "never", "not"].map((w) => w.normalize("NFC")),
);

function words(text: string): string[] {
  // Case is kept here so an upper-case acronym (MCB, PPE, UPI) can be recognised; wordKey lowers it.
  return text
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/** A one-word synonym needs a full key at least this long to match on its own. */
const MIN_SINGLE = 3;

/** Consonant skeleton of one word, without stripping any ending. Empty for stopwords. */
export function wordFullKey(word: string): string {
  const original = word.normalize("NFC");
  const w = original.toLowerCase();
  if (STOPWORDS.has(w)) return "";
  const acronym = ACRONYMS[w];
  if (acronym) return acronym;
  // A Latin acronym: upper case as written (MCB, PPE, UPI), or lower case with no vowel (mcb, db).
  if (/^[A-Z]{2,5}$/.test(original) || (/^[a-z]{2,5}$/.test(w) && !/[aeiou]/.test(w))) return w;
  const k = loosen(devanagariToRoman(w))
    .replace(/w/g, "v")
    .replace(/ph/g, "f")
    .replace(/[^a-z]/g, "");
  return k.replace(/[aeiou]/g, "").replace(/(.)\1+/g, "$1");
}

/** Rough phonetic key of one word (see the header): the full key with a verb ending stripped. */
export function wordKey(word: string): string {
  const full = wordFullKey(word);
  const original = word.normalize("NFC");
  if (ACRONYMS[original.toLowerCase()] || /^[A-Z]{2,5}$/.test(original)) return full;
  // Verb and plural endings: t (ta/te/ti), n (na/ne/ni), kr (kar), y (ya/ye).
  return full.length > 2 ? full.replace(/(kr|t|n|y)$/, "") : full;
}

function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  // One edit apart, for loanwords spelled two ways (vayaring / viring).
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Split answers into sentences; a quote is always one whole sentence. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[।.!?;])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type KeywordLink = { pcId: string; quote: string; synonym: string; answer: number };

/** Every PC whose synonym matches a sentence of an answer, with that sentence as the quote. */
export function keywordLinks(answers: string[], pack: QualificationPack): KeywordLink[] {
  // A one-word synonym must match a word's full key exactly (करनी, a trowel, must not match
  // करता, does); words of a longer synonym may match on their stems, since the other words of the
  // phrase give the context (पाइप मोड़ना matches पाइप मोड़ता).
  const synonyms = pack.nos.flatMap((n) =>
    n.pcs.flatMap((pc) =>
      (pc.synonyms ?? [])
        .map((syn) => {
          const ws = words(syn).filter((w) => wordFullKey(w));
          return {
            pcId: pc.id,
            syn,
            single: ws.length === 1,
            keys: ws.length === 1 ? ws.map(wordFullKey) : ws.map(wordKey),
          };
        })
        .filter((s) => s.keys.length > 0 && (!s.single || s.keys[0]!.length >= MIN_SINGLE)),
    ),
  );
  const links: KeywordLink[] = [];
  const seen = new Set<string>();
  answers.forEach((answer, a) => {
    for (const sentence of sentences(answer)) {
      const ws = words(sentence);
      if (ws.some((w) => NEGATIONS.has(w))) continue;
      const keys = ws.map(wordKey).filter(Boolean);
      const fullKeys = new Set(ws.map(wordFullKey).filter(Boolean));
      for (const s of synonyms) {
        if (seen.has(s.pcId)) continue;
        const hit = s.single
          ? fullKeys.has(s.keys[0]!)
          : s.keys.every((k) => keys.some((x) => close(k, x)));
        if (hit) {
          seen.add(s.pcId);
          links.push({ pcId: s.pcId, quote: sentence, synonym: s.syn, answer: a });
        }
      }
    }
  });
  return links;
}
