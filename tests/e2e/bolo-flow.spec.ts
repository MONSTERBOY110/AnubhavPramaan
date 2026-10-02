import { expect, test } from "@playwright/test";

// The worker's whole path without a microphone: consent, a typed answer, skip the rest, read-back,
// confirm, and the hand-off to the assessor. Claim extraction is stubbed (no LLM tokens).

test("a typed declaration goes from consent to read-back to the assessor's hand-off", async ({
  page,
}) => {
  await page.route("**/api/declaration/*/extract", (route) =>
    route.fulfill({ status: 503, json: { error: "llm_unavailable" } }),
  );
  await page.goto("/declare");
  await page.getByRole("button", { name: /हाँ, मैं सहमत हूँ/ }).click();
  await page.getByRole("button", { name: /or type it/ }).click();
  await page.getByLabel(/type your answer/).fill("मैं सात साल से मकानों में वायरिंग करता हूँ।");
  await page.getByRole("button", { name: /सहेजें/ }).click();
  await expect(page.locator("blockquote")).toContainText("वायरिंग");

  await page.getByRole("button", { name: /अगला सवाल/ }).click();
  for (let k = 2; k < 8; k++) await page.getByRole("button", { name: /छोड़ें/ }).click();
  await page.getByRole("button", { name: /read it back/ }).click();
  await expect(page.getByText("1 answer saved")).toBeVisible();

  await page.getByRole("button", { name: /हाँ, सही है/ }).click();
  await expect(page.getByText("Thank you. Your declaration is with the assessor.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Assessor: open the qualification match" }),
  ).toHaveAttribute("href", /^\/match\/.+/);
});

test("an answer the AI provider refuses keeps its words, asks for a check or a summary, and labels the rule-based claims", async ({
  page,
}) => {
  // The reply the extract route gives when Azure's content filter refuses the answer (see
  // tests/unit/content-filter.test.ts for the route itself).
  const label = "Rule-based extraction (the AI provider's content filter declined this answer)";
  await page.route("**/api/declaration/*/extract", (route) =>
    route.fulfill({
      status: 200,
      json: {
        claims: [
          {
            id: "a0r1",
            answer: 0,
            summary: "क्रिम्पिंग टूल से लग दबाकर केबल एमसीबी में जोड़ता हूँ",
            quote: "क्रिम्पिंग टूल से लग दबाकर केबल एमसीबी में जोड़ता हूँ",
            tasks: [],
            tools: [],
          },
        ],
        rejected: 0,
        source: "rules",
        label,
        extraction: { source: "rules", label, contentFilter: true, at: "2026-10-02T07:40:00.000Z" },
        blocked: "content_filter",
        notice: {
          hi: "यह जवाब अपने-आप प्रोसेस नहीं हो सका। कृपया इसे जाँच लें या एक छोटा सार लिख दें।",
          en: "This answer could not be processed automatically, please check or type a short summary.",
        },
      },
    }),
  );
  await page.goto("/declare");
  await page.getByRole("button", { name: /हाँ, मैं सहमत हूँ/ }).click();
  await page.getByRole("button", { name: /or type it/ }).click();
  await page
    .getByLabel(/type your answer/)
    .fill("क्रिम्पिंग टूल से लग दबाकर केबल एमसीबी में जोड़ता हूँ।");
  await page.getByRole("button", { name: /सहेजें/ }).click();

  await expect(page.locator("blockquote")).toContainText("क्रिम्पिंग टूल");
  await expect(
    page.getByText(
      "This answer could not be processed automatically, please check or type a short summary.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Suggestion found by simple rules, not by the AI. Your assessor checks every line.",
    ),
  ).toBeVisible();
  await expect(page.getByText(label)).toBeVisible();
  await page.screenshot({ path: "screens/wip-bolo-content-filter.png", fullPage: true });

  await page.getByRole("button", { name: /type a short summary/ }).click();
  await expect(page.getByLabel(/type a short summary; the spoken answer is kept/)).toBeFocused();
  await expect(page.locator("blockquote")).toContainText("क्रिम्पिंग टूल");
});
