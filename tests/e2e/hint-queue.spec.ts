import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// PRD R14: a hint asked with the network off waits on the tablet and runs when the network is
// back. The hint service is stubbed here (no model call); the queue and the photo store are real.

function greyPng(width = 32, height = 24): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      raw[y * (width + 1) + 1 + x] = (x * 7 + y * 13 + Math.floor(Math.random() * 40)) % 256;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("a hint asked offline waits on the tablet and runs when the network is back", async ({
  page,
  context,
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

  let calls = 0;
  await page.route("**/api/hints/evidence", async (route) => {
    calls += 1;
    const body = route.request().postDataJSON() as { pcId: string };
    expect(body.pcId).toBe("CON/N0602.PC1");
    await route.fulfill({
      json: {
        hints: [
          { observable: "cable", status: "visible", reason: "stub" },
          { observable: "guard", status: "not_visible", reason: "stub" },
          { observable: "bit", status: "cannot_tell", reason: "stub" },
          { observable: "run", status: "cannot_tell", reason: "stub" },
        ],
      },
    });
  });

  await page.goto(`/assess/${decl.id}`);
  await expect(page.getByRole("heading", { name: "Practical assessment" })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText("Offline: saving on this device")).toBeVisible();
  const first = page.locator("article").first();
  await first
    .locator('input[type="file"]')
    .setInputFiles({ name: "drill.png", mimeType: "image/png", buffer: greyPng() });
  await first.getByRole("button", { name: "Ask for a hint when back online" }).click();
  await expect(first.getByText("Hint queued: it runs when the network is back")).toBeVisible();
  expect(calls).toBe(0);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(first.getByText("AI hint: visible")).toBeVisible({ timeout: 10_000 });
  await expect(first.getByText("AI hint: not visible")).toBeVisible();
  await expect(first.getByText("Hint queued: it runs when the network is back")).toHaveCount(0);
  expect(calls).toBe(1);
});
