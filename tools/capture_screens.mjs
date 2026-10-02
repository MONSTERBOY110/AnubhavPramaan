/** Capture every screen of one real candidate journey, at desktop and phone size.
 *
 * Drives the running app through its own routes: consent, three typed Hindi answers (real
 * claim extraction), read-back, the LLM mapping, the assessor's decision, a few scored criteria
 * with a licensed photo, the profile, a PIN sign-off and the verifiable record. Nothing is staged.
 *
 * Usage (app running on localhost:3000):
 *   node tools/capture_screens.mjs                  # LLM mapping (Azure), the default
 *   node tools/capture_screens.mjs --keyword        # keyword baseline, no model calls
 *
 * Output: docs/internal/screens/polish/<screen>-<desktop|phone>.png (gitignored).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "..");
const APP = process.env.AP_APP ?? "http://localhost:3000";
const OUT = join(ROOT, "docs", "internal", "screens", "polish");
const PHOTO = join(ROOT, "public", "evidence", "conduit-strut-clamps.jpg");
const MODE = process.argv.includes("--keyword") ? "keyword" : "llm";

const ANSWERS = [
  "मैं आठ साल से बिल्डिंग साइट पर बिजली का काम कर रहा हूँ। पहले एक ठेकेदार के साथ हेल्पर था, अब खुद वायरिंग करता हूँ।",
  "मैं प्लायर, स्क्रूड्राइवर, टेस्टर और मल्टीमीटर चलाता हूँ। ड्रिल चलाने से पहले उसका तार और प्लग देखता हूँ।",
  "दीवार में पाइप डालकर क्लैंप से कसता हूँ, फिर पाइप में तार खींचता हूँ। स्विच बोर्ड और सॉकेट लगाता हूँ और अर्थ का तार हर बोर्ड तक ले जाता हूँ।",
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  geolocation: { latitude: 22.5726, longitude: 88.3639 },
  permissions: ["geolocation"],
});
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await desktop.newPage();
const mob = await phone.newPage();
const shots = [];

async function shot(p, name, { full = false } = {}) {
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(400);
  const file = join(OUT, `${name}.png`);
  await p.screenshot({ path: file, fullPage: full });
  shots.push(file);
}

async function both(url, name, opts) {
  await page.goto(`${APP}${url}`);
  await shot(page, `${name}-desktop`, opts);
  await mob.goto(`${APP}${url}`);
  await shot(mob, `${name}-phone`, opts);
}

// Home and the consent screen.
await both("/", "00-home");
await mob.goto(`${APP}/declare`);
await shot(mob, "01-bolo-consent-phone");
await page.goto(`${APP}/declare`);
await shot(page, "01-bolo-consent-desktop");

// Bolo: consent, three typed answers with real extraction, the rest skipped, read-back.
const created = page.waitForResponse(
  (r) => r.url().endsWith("/api/declaration") && r.request().method() === "POST",
);
await page.getByRole("button", { name: /हाँ, मैं सहमत हूँ/ }).click();
const { id } = await (await created).json();
await shot(page, "02-bolo-question-desktop");
for (let k = 0; k < ANSWERS.length; k++) {
  await page.getByRole("button", { name: /or type it/ }).click();
  await page.getByLabel(/type your answer/).fill(ANSWERS[k]);
  await page.getByRole("button", { name: /सहेजें/ }).click();
  await page.locator("blockquote").first().waitFor({ timeout: 120_000 });
  await page
    .getByText(/what the AI heard you do/)
    .first()
    .waitFor({ timeout: 120_000 })
    .catch(() => {});
  if (k === 2) await shot(page, "03-bolo-answer-desktop", { full: true });
  await page.getByRole("button", { name: /अगला सवाल/ }).click();
}
while (!(await page.getByRole("button", { name: /read it back/ }).isVisible())) {
  await page.getByRole("button", { name: /छोड़ें/ }).click();
}
await page.getByRole("button", { name: /read it back/ }).click();
await shot(page, "04-bolo-readback-desktop", { full: true });
await page.getByRole("button", { name: /हाँ, सही है/ }).click();
await page.getByText("Thank you. Your declaration is with the assessor.").waitFor();

// Milao: the mapping through the app's own route, then the assessor's decision.
const mapped = await desktop.request.post(`${APP}/api/mapping`, {
  data: { declarationId: id, mode: MODE },
  timeout: 300_000,
});
if (!mapped.ok()) throw new Error(`mapping failed: ${mapped.status()} ${await mapped.text()}`);
await both(`/match/${id}`, "05-milao", { full: true });
await page.goto(`${APP}/match/${id}`);
await page.getByPlaceholder("e.g. AS-0142").fill("AS-0142");
await page.getByRole("button", { name: "Confirm QP and route" }).click();
await page.waitForTimeout(1500);
await shot(page, "06-milao-decided-desktop");

// Parkho: a few criteria scored, one with a licensed photo.
await page.goto(`${APP}/assess/${id}`);
await page.getByRole("heading", { name: "Practical assessment" }).waitFor();
await shot(page, "07-parkho-desktop");
await mob.goto(`${APP}/assess/${id}`);
await shot(mob, "07-parkho-phone");
for (let i = 0; i < 3; i++) {
  await page.locator("article").nth(i).getByText("1 Meets standard").click();
}
await page.locator("article").first().locator('input[type="file"]').setInputFiles(PHOTO);
await page.waitForTimeout(1500);
await page.locator("article").first().scrollIntoViewIfNeeded();
await shot(page, "08-parkho-scored-desktop");

// Pramaan: profile, PIN sign-off, the verifiable record.
await page.getByRole("button", { name: "Continue to profile and sign-off" }).click();
await page.getByRole("textbox", { name: "PIN", exact: true }).waitFor();
await shot(page, "09-pramaan-desktop", { full: true });
await page.getByRole("textbox", { name: "PIN", exact: true }).fill("2468");
await page.getByRole("button", { name: "Sign with my PIN" }).click();
const link = page.getByRole("link", { name: "Open the verifiable record" });
await link.waitFor({ timeout: 60_000 });
const href = await link.getAttribute("href");
await both(href, "10-verify", { full: true });

// Samaan and calibration.
await both("/samaan", "11-samaan", { full: true });
await both("/calibrate", "12-calibrate");

await browser.close();
writeFileSync(join(OUT, "INDEX.txt"), `declaration ${id}, mode ${MODE}\n${shots.join("\n")}\n`);
console.log(`declaration ${id} (${MODE}); ${shots.length} screenshots in ${OUT}`);
