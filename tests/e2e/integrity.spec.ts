import { deflateSync } from "node:zlib";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Integrity checks end to end (TRD M5): the assessor records the session's place, a photo gets its
// SHA-256 and dHash on the tablet, and the sealed record prints the checks. When the same photo is
// used again for another candidate, that candidate's record carries a reused-photo flag.

test.use({
  geolocation: { latitude: 22.5726, longitude: 88.3639 },
  permissions: ["geolocation", "microphone"],
});

/** A small greyscale PNG of random noise, so no earlier test run holds a similar photo. */
function noisePng(width = 48, height = 36): Buffer {
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = Math.floor(Math.random() * 256);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function preparedCandidate(request: APIRequestContext): Promise<string> {
  const decl = await (
    await request.post("/api/declaration", { data: { lang: "hi", consent: true } })
  ).json();
  await request.post(`/api/declaration/${decl.id}/answer`, {
    data: {
      topic: "wiring",
      q: "q",
      text: "दीवार में पाइप डालकर क्लैंप से कसता हूँ। पाइप में तार खींचता हूँ। मेगर टेस्ट करता हूँ।",
      source: "typed",
      sourceLabel: "Typed (integrity test)",
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
  return decl.id as string;
}

async function assessWithPhoto(page: Page, declarationId: string, photo: Buffer) {
  await page.goto(`/assess/${declarationId}`);
  await page.getByRole("button", { name: "Record place" }).click();
  await expect(page.getByText("Place 22.57, 88.36")).toBeVisible();
  const first = page.locator("article").first();
  await first
    .locator('input[type="file"]')
    .setInputFiles({ name: "board.png", mimeType: "image/png", buffer: photo });
  await expect(first.getByText("22.57, 88.36")).toBeVisible();
  for (let i = 0; i < 3; i++)
    await page.locator("article").nth(i).getByText("1 Meets standard").click();
  await page.getByRole("button", { name: "Continue to profile and sign-off" }).click();
  await page.getByRole("textbox", { name: "PIN", exact: true }).fill("2468");
  await page.getByRole("button", { name: "Sign with my PIN" }).click();
  await page.getByRole("link", { name: "Open the verifiable record" }).click();
  await expect(page.getByText("Record intact")).toBeVisible();
}

test("a reused photo is flagged on the second candidate's record, never on the first", async ({
  page,
  request,
}) => {
  const photo = noisePng();
  await assessWithPhoto(page, await preparedCandidate(request), photo);
  await expect(page.getByText("Automatic integrity checks at sign-off")).toBeVisible();
  await expect(
    page.getByText(
      /^Reused photos: none\. 1 photo compared with \d+ stored for other candidates\.$/,
    ),
  ).toBeVisible();
  await expect(page.getByText(/^Travel: (first session|consistent)/)).toBeVisible();

  await assessWithPhoto(page, await preparedCandidate(request), photo);
  await expect(
    page.getByText(/is the same file as a photo stored for another candidate/),
  ).toBeVisible();
  await expect(
    page.getByText(/^Travel: consistent with the assessor's previous session/),
  ).toBeVisible();
  await page.screenshot({ path: "docs/internal/screens/wip-verify-integrity.png", fullPage: true });
});
