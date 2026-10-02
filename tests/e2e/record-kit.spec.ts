import { existsSync, rmSync } from "node:fs";
import { expect, test } from "@playwright/test";

// The role-play recording kit with Chromium's fake microphone (a synthetic tone). Needs the dev
// server started with AP_DEV_RECORDINGS=1; skipped otherwise.

test("records an answer as 16 kHz WAV and saves it under docs/internal/recordings", async ({
  page,
  request,
}) => {
  const probe = await request.post("/api/dev/recordings", { data: {} });
  test.skip(probe.status() === 404, "dev recording route is disabled");
  const saved = "docs/internal/recordings/R01/q1-intro.wav";
  test.skip(existsSync(saved), "a real R01 recording exists; not overwriting it");

  await page.goto("/record");
  await page
    .getByRole("button", { name: /^Record$/ })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText(saved)).toBeVisible({ timeout: 15000 });
  expect(existsSync(saved)).toBe(true);
  rmSync(saved, { force: true });
});
