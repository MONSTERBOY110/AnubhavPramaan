import { describe, expect, it } from "vitest";
import {
  carriesIdentifier,
  digitCount,
  MIN_IDENTIFIER_DIGITS,
  REDACTED_ID,
  REDACTED_NUMBER,
  redactIdentifiers,
} from "@/lib/cert/redact";

// Certificate quotes must keep the numbers that are evidence (premiums, terms, percentages) and drop
// the numbers that are identifiers (phones, Aadhaar, accounts, cards, PAN), in English, Roman Hindi
// and Devanagari, spoken as words or as numerals.

describe("redactIdentifiers keeps disclosure numbers", () => {
  it.each([
    "You pay a premium of ₹50,000 every year for 10 years, and the policy term is 15 years.",
    "There is a 5-year lock-in.",
    "The benefit illustration shows values at 4% and 8%.",
    "You have a thirty day free look period; tees din ke andar wapas kar sakte hain.",
    "Paanch saal, five years, uske baad nikal sakti hoon.",
    "The loan is 7,50,000 rupees at 12.5 percent for 48 months.",
    "पाँच साल का लॉक इन है, प्रीमियम पचास हज़ार।",
    "Anytime, madam, and the returns are guaranteed, 12%.",
  ])("leaves %s untouched", (quote) => {
    expect(redactIdentifiers(quote)).toBe(quote);
    expect(carriesIdentifier(quote)).toBe(false);
  });
});

describe("redactIdentifiers removes identifiers", () => {
  it("redacts a ten digit mobile number in numerals, spaced or not", () => {
    expect(redactIdentifiers("My number is 9876543210, call me.")).toBe(
      `My number is ${REDACTED_NUMBER}, call me.`,
    );
    expect(redactIdentifiers("Mera number 98765 43210 hai.")).toBe(
      `Mera number ${REDACTED_NUMBER} hai.`,
    );
  });

  it("redacts digits spoken one at a time in English", () => {
    const quote = "It is nine eight seven six five four three two one zero.";
    expect(redactIdentifiers(quote)).toBe(`It is ${REDACTED_NUMBER}.`);
  });

  it("redacts digits spoken one at a time in Roman Hindi", () => {
    const quote = "Account nau aath saat chhe paanch chaar teen do ek shunya hai.";
    expect(redactIdentifiers(quote)).toBe(`Account ${REDACTED_NUMBER} hai.`);
  });

  it("redacts Devanagari numerals and digit words", () => {
    expect(redactIdentifiers("आधार १२३४ ५६७८ ९०१२ है")).toBe(`आधार ${REDACTED_NUMBER} है`);
    expect(redactIdentifiers("नंबर नौ आठ सात छह पाँच चार तीन दो एक शून्य")).toBe(
      `नंबर ${REDACTED_NUMBER}`,
    );
  });

  it("redacts a sixteen digit card number in groups and a twelve digit Aadhaar", () => {
    expect(redactIdentifiers("Card 4242 4242 4242 4242 expires next year")).toBe(
      `Card ${REDACTED_NUMBER} expires next year`,
    );
    expect(redactIdentifiers("Aadhaar 2345 6789 0123")).toBe(`Aadhaar ${REDACTED_NUMBER}`);
  });

  it("redacts a PAN whether written together or spoken with spaces", () => {
    expect(redactIdentifiers("PAN is ABCDE1234F.")).toBe(`PAN is ${REDACTED_ID}.`);
    expect(redactIdentifiers("pan abcde 1234 f")).toBe(`pan ${REDACTED_ID}`);
  });

  it("leaves a run one digit short of the threshold, and redacts at the threshold", () => {
    expect(MIN_IDENTIFIER_DIGITS).toBe(8);
    expect(redactIdentifiers("Code 1234567.")).toBe("Code 1234567.");
    expect(redactIdentifiers("Code 12345678.")).toBe(`Code ${REDACTED_NUMBER}.`);
  });

  it("does not treat English words that double as Hindi digits as identifiers", () => {
    const quote = "What do you want to do? One or two teen ke saath.";
    expect(redactIdentifiers(quote)).toBe(quote);
  });

  it("counts numerals per character and digit words as one", () => {
    expect(digitCount("98765 43210")).toBe(10);
    expect(digitCount("nine eight seven")).toBe(3);
    expect(digitCount("१२३४")).toBe(4);
  });

  it("handles empty and whitespace input", () => {
    expect(redactIdentifiers("")).toBe("");
    expect(redactIdentifiers("   ")).toBe("   ");
  });
});
