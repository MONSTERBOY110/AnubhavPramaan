import { expect, test } from "@playwright/test";

test("home names the product and the boundary", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AnubhavPramaan");
  await expect(page.getByText("the assessor decides")).toBeVisible();
});

test("Bolo asks for consent before anything is recorded, then shows the first question", async ({
  page,
}) => {
  await page.goto("/declare");
  await expect(page.getByRole("heading", { name: "शुरू करने से पहले" })).toBeVisible();
  await expect(page.getByRole("button", { name: /बोलें|Speak/ })).toHaveCount(0);
  await page.getByRole("button", { name: /हाँ, मैं सहमत हूँ/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("अपने काम के बारे में बताइए");
  await expect(page.getByRole("button", { name: /बोलें|Speak/ })).toBeVisible();
});

test("declining consent records nothing", async ({ page }) => {
  await page.goto("/declare");
  await page.getByRole("button", { name: /नहीं/ }).click();
  await expect(page.getByText("Nothing was recorded")).toBeVisible();
});

test("a worker can type an answer instead of speaking, and a phone number is redacted", async ({
  page,
}) => {
  // Claim extraction is stubbed out here (no LLM tokens in the smoke suite); the answer must still save.
  await page.route("**/api/declaration/*/extract", (route) =>
    route.fulfill({ status: 503, json: { error: "llm_unavailable" } }),
  );
  await page.goto("/declare");
  await page.getByRole("button", { name: /हाँ, मैं सहमत हूँ/ }).click();
  await page.getByRole("button", { name: /or type it/ }).click();
  await page
    .getByLabel(/type your answer/)
    .fill("मैं 8 साल से वायरिंग करता हूँ। मेरा नंबर 9876543210 है।");
  await page.getByRole("button", { name: /सहेजें/ }).click();
  const answer = page.locator("blockquote");
  await expect(answer).toContainText("मैं 8 साल से वायरिंग करता हूँ।");
  await expect(answer).not.toContainText("9876543210");
  await expect(page.getByText("Typed", { exact: true })).toBeVisible();
  await expect(page.getByText("The answer is saved.")).toBeVisible();
});
