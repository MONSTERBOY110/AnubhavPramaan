import { expect, test } from "@playwright/test";

// Calibration mode (PRD R12) with ONE test rater: the screen demands a level on every criterion,
// the score is saved under a code, and the set page waits for a second rater before computing any
// agreement. The test rater then withdraws, so no test score stays in the demo set.

const SET = "demo-electrician-1";
const RATER = `E2E-${Date.now().toString(36)}`;

test.afterEach(async ({ request }) => {
  await request.delete(`/api/calibration/${SET}/ratings`, {
    data: { rater: RATER, condition: "unaided" },
  });
});

test("one rater scores the demo set unaided; nothing is computed until a second rater", async ({
  page,
  request,
}) => {
  await page.goto(`/calibrate/${SET}?condition=unaided`);
  await expect(page.getByText("Unaided: the criterion and the 0 to 3 scale only.")).toBeVisible();
  await page.getByLabel(/Your rater code/).fill(RATER);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start" }).click();

  for (let photo = 1; photo <= 7; photo++) {
    await expect(page.getByText(`Photo ${photo} of 7`)).toBeVisible();
    // Unaided raters see the generic WorldSkills labels, never the criterion's own anchors.
    await expect(page.getByText("Meets standard:")).toHaveCount(0);
    const next = page.getByRole("button", { name: photo < 7 ? "Next photo" : "Save my scores" });
    await expect(next).toBeDisabled();
    const groups = page.locator("fieldset");
    const count = await groups.count();
    for (let g = 0; g < count; g++) await groups.nth(g).getByRole("radio").nth(1).check();
    await next.click();
  }
  await expect(page.getByText("Saved. Thank you.")).toBeVisible();
  await expect(page.getByText(`Your 14 scores are saved under code ${RATER}.`)).toBeVisible();

  await page.goto("/calibrate");
  const unaided = page.getByRole("row").filter({ hasText: "Unaided" });
  await expect(unaided).toContainText("waiting for raters");
  const again = await request.post(`/api/calibration/${SET}/ratings`, {
    data: {
      rater: RATER,
      background: "volunteer",
      condition: "unaided",
      consent: true,
      ratings: [{ itemId: "I01", pcId: "CON/N0604.PC8", level: 1, seconds: 3 }],
    },
  });
  expect(again.status()).toBe(400); // incomplete: every criterion needs a level
});

test("the assisted page shows each criterion's own anchors and what to check", async ({ page }) => {
  await page.goto(`/calibrate/${SET}?condition=assisted`);
  await page.getByLabel(/Your rater code/).fill(`${RATER}-A`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText(/Meets standard:/).first()).toBeVisible();
});
