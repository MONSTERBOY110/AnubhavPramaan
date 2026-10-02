import { expect, test } from "@playwright/test";

// The sign-off panel works on the checklist's live scores: a level changed after the panel opened
// (1 to 0 keeps the saved text the same length) must reach the profile and the sealed record.

test("a level changed after the sign-off panel opened is the one that is sealed", async ({
  page,
  request,
}) => {
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
  await page.getByRole("button", { name: "Continue to profile and sign-off" }).click();
  await expect(
    page.getByText("Assessor register on this tablet: signing works offline."),
  ).toBeVisible();
  const first = page.locator("article").first();
  const n0602 = page.getByRole("row").filter({ hasText: "CON/N0602" });
  await first.getByText("1 Meets standard").click();
  await expect(n0602).toContainText("9%");
  await first.getByText("0 Below standard").click();
  await expect(n0602).toContainText("0%");

  await page.getByRole("textbox", { name: "PIN", exact: true }).fill("2468");
  await page.getByRole("button", { name: "Sign with my PIN" }).click();
  await page.getByRole("link", { name: "Open the verifiable record" }).click();
  await expect(page.getByText("Record intact")).toBeVisible();
  const sealed = await (
    await request.get(`/api/certificate/${page.url().split("/verify/")[1]}`)
  ).json();
  const pc1 = (sealed.record ?? sealed).scores.find(
    (s: { pcId: string }) => s.pcId === "CON/N0602.PC1",
  );
  expect(pc1.level).toBe(0);
});
