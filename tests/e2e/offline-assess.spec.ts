import { expect, test } from "@playwright/test";

// The thin offline path (TRD M8, gate G3): the assessor scores and signs with the network off,
// everything waits in the device outbox, and when the network returns it syncs with no event lost
// and the sealed record verifies.

test("score and sign offline, then sync and verify", async ({ page, context, request }) => {
  const decl = await (
    await request.post("/api/declaration", { data: { lang: "hi", consent: true } })
  ).json();
  await request.post(`/api/declaration/${decl.id}/answer`, {
    data: {
      topic: "wiring",
      q: "q",
      text: "दीवार में पाइप डालकर क्लैंप से कसता हूँ। पाइप में तार खींचता हूँ। मेगर टेस्ट करता हूँ।",
      source: "typed",
      sourceLabel: "Typed (offline test)",
      edited: false,
    },
  });
  const mapping = await (
    await request.post("/api/mapping", { data: { declarationId: decl.id, mode: "keyword" } })
  ).json();
  await request.post(`/api/mapping/${decl.id}/decision`, {
    data: {
      qp: mapping.result.best,
      route: mapping.result.route.suggestion,
      assessorId: "AS-0142",
    },
  });

  await page.goto(`/assess/${decl.id}`);
  await expect(page.getByRole("heading", { name: "Practical assessment" })).toBeVisible();
  // Load the assessor register while online (the tablet does this before going to the camp).
  await page.getByRole("button", { name: "Continue to profile and sign-off" }).click();
  await expect(
    page.getByText("Assessor register on this tablet: signing works offline."),
  ).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText("Offline: saving on this device")).toBeVisible();
  const cards = page.locator("article");
  for (let i = 0; i < 3; i++) await cards.nth(i).getByText("2 Exceeds in places").click();
  await page.getByRole("textbox", { name: "PIN", exact: true }).fill("2468");
  await page.getByRole("button", { name: "Sign with my PIN" }).click();
  await expect(page.getByText("Signed on this device")).toBeVisible();
  const queued = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("anubhavpramaan", 1);
        req.onsuccess = () => {
          const all = req.result.transaction("outbox").objectStore("outbox").getAll();
          all.onsuccess = () =>
            resolve((all.result as Array<{ syncedAt?: string }>).filter((e) => !e.syncedAt).length);
        };
      }),
  );
  expect(queued).toBeGreaterThanOrEqual(4); // 3 scores and 1 sign-off

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("link", { name: "Open the verifiable record" })).toBeVisible({
    timeout: 15000,
  });
  const left = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("anubhavpramaan", 1);
        req.onsuccess = () => {
          const all = req.result.transaction("outbox").objectStore("outbox").getAll();
          all.onsuccess = () =>
            resolve((all.result as Array<{ syncedAt?: string }>).filter((e) => !e.syncedAt).length);
        };
      }),
  );
  expect(left).toBe(0);

  await page.getByRole("link", { name: "Open the verifiable record" }).click();
  await expect(page.getByText("Record intact")).toBeVisible();
  await expect(page.getByText("Signed by the prototype's demo assessor")).toBeVisible();
});
