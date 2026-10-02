// Identifier redaction for certificate quotes (docs/decisions.md, 2026-09-15).
//
// The certificate quotes what was said so a reviewer can check every tick against the words. A
// quote can also carry a phone number, an Aadhaar number, an account or card number or a PAN, spoken
// digit by digit, and none of that is evidence of a disclosure. This module removes identifier-length
// digit runs and PAN-shaped tokens from a quote before it is hashed into the certificate, and leaves
// amounts, years, percentages and short numbers alone: "premium of 50,000 for 10 years" stays,
// "nine eight seven six five four three two one zero" becomes "[number]".
//
// Pure functions. The threshold is eight digits: Indian mobile numbers are ten, Aadhaar twelve,
// bank accounts nine to eighteen, cards thirteen to nineteen, and no disclosure in either pack needs
// a number that long. Amounts up to 99,99,999 (seven digits) survive.

export const REDACTED_NUMBER = "[number]";
export const REDACTED_ID = "[id]";
export const MIN_IDENTIFIER_DIGITS = 8;

/** One spoken digit in English, Roman Hindi or Devanagari, or a run of numerals in either script. */
const DIGIT_TOKEN =
  "(?:\\d+|[०-९]+|zero|oh|one|two|three|four|five|six|seven|eight|nine|shunya|ek|do|teen|chaar|char|paanch|panch|chhe|che|saat|aath|nau|शून्य|एक|दो|तीन|चार|पाँच|पांच|छह|सात|आठ|नौ)";

/** Consecutive digit tokens separated by spaces, commas, dots or hyphens, not glued to other letters. */
const DIGIT_RUN = new RegExp(
  `(?<![\\p{L}\\p{N}])${DIGIT_TOKEN}(?:[\\s,.\\-]+${DIGIT_TOKEN})*(?![\\p{L}\\p{N}])`,
  "giu",
);

/** Indian PAN: five letters, four digits, one letter, optionally spaced when spoken. */
const PAN = /(?<![\p{L}\p{N}])[A-Za-z]{5}\s?\d{4}\s?[A-Za-z](?![\p{L}\p{N}])/gu;

/** How many digits a run carries: numerals count per character, digit words count one each. */
export function digitCount(run: string): number {
  let count = 0;
  for (const token of run.split(/[\s,.\-]+/)) {
    if (!token) continue;
    if (/^[\d०-९]+$/u.test(token)) count += token.length;
    else count += 1;
  }
  return count;
}

/** Replace identifier-length digit runs and PAN-shaped tokens; leave everything else untouched. */
export function redactIdentifiers(text: string): string {
  if (!text) return text;
  const withoutPan = text.replace(PAN, REDACTED_ID);
  return withoutPan.replace(DIGIT_RUN, (run) =>
    digitCount(run) >= MIN_IDENTIFIER_DIGITS ? REDACTED_NUMBER : run,
  );
}

/** True when a quote still carries an identifier-length digit run or a PAN. Used by tests and checks. */
export function carriesIdentifier(text: string): boolean {
  if (PAN.test(text)) {
    PAN.lastIndex = 0;
    return true;
  }
  PAN.lastIndex = 0;
  for (const m of text.matchAll(DIGIT_RUN)) {
    if (digitCount(m[0]) >= MIN_IDENTIFIER_DIGITS) return true;
  }
  return false;
}
