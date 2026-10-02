import { expect, test } from "@playwright/test";

// Parkho shows the worker's own sentence under each PC the match screen linked it to, with a
// follow-up question to ask, so the practical assessment starts from the declared experience.

test("a PC linked on the match screen shows the worker's words and a question to ask", async ({
  page,
  request,
}) => {
  const decl = await (
    await request.post("/api/declaration", { data: { lang: "hi", consent: true } })
  ).json();
  await request.post(`/api/declaration/${decl.id}/answer`, {
    data: {
      topic: "wiring",
      q: "q",
      text: "दीवार में पाइप डालकर क्लैंप से कसता हूँ। पाइप में तार खींचता हूँ।",
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
      qp: mapping.result.best,
      route: mapping.result.route.suggestion,
      assessorId: "AS-0142",
    },
  });

  await page.goto(`/assess/${decl.id}`);
  await page.getByRole("button", { name: /CON\/N0604/ }).click();
  const card = page.locator("article", { hasText: "From the worker's declaration" }).first();
  await expect(card).toContainText("दीवार में पाइप डालकर क्लैंप से कसता हूँ।");
  await expect(card).toContainText("Keyword baseline, no LLM");
  await expect(card.getByText("Ask:")).toBeVisible();
});
