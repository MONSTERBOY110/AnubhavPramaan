import { expect, test } from "@playwright/test";

// The stand-alone profile page reads the checklist saved on this device (no live state passed in)
// and shows the same profile and sign-off panel as the checklist page.

test("the profile page shows the scores saved on this device", async ({ page, request }) => {
  const decl = await (
    await request.post("/api/declaration", { data: { lang: "hi", consent: true } })
  ).json();
  await request.post(`/api/declaration/${decl.id}/answer`, {
    data: {
      topic: "tools",
      q: "q",
      text: "ड्रिल चलाने से पहले तार और प्लग देखता हूँ।",
      source: "typed",
      sourceLabel: "Typed",
      edited: false,
    },
  });
  const mapping = await (
    await request.post("/api/mapping", { data: { declarationId: decl.id, mode: "keyword" } })
  ).json();
  await request.post(`/api/mapping/${decl.id}/decision`, {
    data: {
      qp: "CON/Q0602",
      route: mapping.result.route?.suggestion ?? "upskill-first",
      assessorId: "AS-0142",
    },
  });
  await page.goto(`/assess/${decl.id}`);
  await page.locator("article").first().getByText("1 Meets standard").click();
  await page.goto(`/profile/${decl.id}`);
  await expect(page.getByRole("row").filter({ hasText: "CON/N0602" })).toContainText("1/11 scored");
  await expect(page.getByRole("button", { name: "Sign with my PIN" })).toBeVisible();
});
