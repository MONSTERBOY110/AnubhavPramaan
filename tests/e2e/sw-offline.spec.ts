import { expect, test } from "@playwright/test";

// The installed app keeps working with the network off (TRD M8): after one online visit, the
// service worker serves the page again offline. Production builds only (the worker is not
// registered in development), so this skips against the dev server.

test("a page opened once reloads with the network off", async ({ page, context }) => {
  await page.goto("/samaan");
  const hasWorker = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(() => r(null), 5000)),
    ]);
    return Boolean(reg);
  });
  test.skip(!hasWorker, "service worker not registered (development server)");
  // A second online load goes through the worker, which keeps a copy.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Samaan/ })).toBeVisible();
  await page.goto("/declare");
  await expect(page.getByRole("heading", { name: "शुरू करने से पहले" })).toBeVisible();

  await context.setOffline(true);
  await page.goto("/samaan");
  await expect(page.getByRole("heading", { name: /Samaan/ })).toBeVisible();
  await expect(page.getByText("0.430").first()).toBeVisible();
  await page.goto("/declare");
  await expect(page.getByRole("heading", { name: "शुरू करने से पहले" })).toBeVisible();
});
