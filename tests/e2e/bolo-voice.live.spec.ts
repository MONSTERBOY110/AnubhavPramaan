import { expect, test } from "@playwright/test";

// Live: the worker's real path from microphone to transcript to claims. Chromium's fake microphone
// plays AP_FAKE_WAV (a 16 kHz Hindi clip); the page records it with MediaRecorder, converts it to
// 16 kHz WAV, and the server transcribes it with the configured recogniser and extracts claims.
// Spends speech and LLM credits, so it runs only with AP_LIVE_E2E=1.

test.skip(
  process.env.AP_LIVE_E2E !== "1" || !process.env.AP_FAKE_WAV,
  "live test: set AP_LIVE_E2E=1 and AP_FAKE_WAV",
);

test("speak an answer, see the words and the claims", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/declare");
  await page.getByRole("button", { name: /हाँ, मैं सहमत हूँ/ }).click();
  await page.getByRole("button", { name: /बोलें|Speak/ }).click();
  await page.waitForTimeout(6500);
  await page.getByRole("button", { name: /रुकें|Stop/ }).click();
  const answer = page.locator("blockquote");
  await expect(answer).toContainText("बिजली", { timeout: 60_000 });
  await expect(page.getByText(/Stand-in ASR|Bhashini ASR|Fallback ASR/)).toBeVisible();
  await expect(page.getByText("Suggestion: what the AI heard you do")).toBeVisible({
    timeout: 60_000,
  });
  await page.screenshot({ path: "docs/internal/screens/live-bolo-answer.png", fullPage: true });
});
