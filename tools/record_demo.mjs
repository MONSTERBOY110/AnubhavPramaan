/** Record the demo video without a screen grab.
 *
 * Headless Chromium renders the running app at 1920 x 1080 with every page zoomed 1.5x; the DevTools screencast hands over
 * every painted frame with its timestamp; ffmpeg turns the frames into a constant 30 fps H.264
 * file. Nothing outside the browser can ever appear in the video (no desktop, no taskbar, no
 * scaling artefacts), and the machine stays usable while it records.
 *
 * The shots follow docs/internal/VIDEO-SCRIPT.md. Every screen is the real app on demo data made
 * through the app's own routes just before recording; nothing is staged.
 *
 * Usage (app running on localhost:3000):
 *   node tools/record_demo.mjs --dry                 # 10-second pipeline check
 *   node tools/record_demo.mjs --rehearse            # the whole storyboard on typed text, keyword
 *                                                    # mapping and a stubbed extraction: no tokens
 *   node tools/record_demo.mjs --wav <role-play.wav> # the real take: the lead's recording goes
 *                                                    # through the real speech, LLM and hint calls
 *
 * Output: docs/internal/video/<name>.mp4 (gitignored with the rest of docs/internal).
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "..");
const APP = process.env.AP_APP ?? "http://localhost:3000";
const OUT_DIR = join(ROOT, "docs", "internal", "video");
const FRAMES = join(OUT_DIR, "frames");
const FPS = 30;
const dry = process.argv.includes("--dry");
const rehearse = process.argv.includes("--rehearse");
const wavArg = process.argv.indexOf("--wav");
const WAV = wavArg > 0 ? resolve(process.argv[wavArg + 1] ?? "") : null;
const PHOTO = join(ROOT, "public", "evidence", "conduit-strut-clamps.jpg");

/** Start recording a page; returns stop(), which resolves to the frames with their times. */
async function screencast(context, page) {
  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = join(FRAMES, `f${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });
  return async () => {
    const end = Date.now() / 1000;
    await cdp.send("Page.stopScreencast");
    return { frames, end };
  };
}

/** Frames with uneven gaps (the screencast only sends a frame when something repaints) become a
 * constant-rate H.264 file: each frame is held until the next one arrived. */
function encode({ frames, end }, out) {
  if (frames.length === 0) throw new Error("no frames were captured");
  const lines = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.t ?? end;
    lines.push(
      `file '${f.file.replace(/\\/g, "/")}'`,
      `duration ${Math.max(0.001, next - f.t).toFixed(4)}`,
    );
  });
  lines.push(`file '${frames.at(-1).file.replace(/\\/g, "/")}'`); // the concat demuxer needs the last file twice
  const list = join(FRAMES, "list.txt");
  writeFileSync(list, lines.join("\n") + "\n");
  const ff = spawnSync(
    process.env.FFMPEG ?? "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-vf",
      `fps=${FPS},scale=in_range=full:out_range=tv,format=yuv420p`,
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-preset",
      "medium",
      "-movflags",
      "+faststart",
      out,
    ],
    { stdio: "inherit" },
  );
  if (ff.status !== 0) throw new Error(`ffmpeg failed with ${ff.status}`);
}

async function dryRun(page) {
  await page.goto(`${APP}/`);
  await page.waitForTimeout(2500);
  await page.goto(`${APP}/samaan`);
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(2000);
  await page.goto(`${APP}/calibrate`);
  await page.waitForTimeout(2500);
}

/** A small label in the corner of the real screen, so viewers know what they are looking at. */
async function caption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById("ap-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "ap-caption";
      el.style.cssText =
        "position:fixed;left:32px;bottom:28px;z-index:99999;background:#1b2559;color:#fff;font:600 20px/1.3 'Noto Sans',sans-serif;padding:10px 16px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.18)";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

/** A plain title or end card, drawn in the same browser so it is captured the same way. */
async function card(page, title, line, ms) {
  await page.setContent(
    `<html><body style="margin:0;height:100vh;display:grid;place-content:center;text-align:center;background:#fff;color:#1b2559;font-family:'Noto Sans',sans-serif">` +
      `<div style="font-size:72px;font-weight:700">${title}</div>` +
      `<div style="margin-top:18px;font-size:30px;color:#5f6b7a">${line}</div>` +
      `<div style="margin:36px auto 0;width:120px;height:6px;background:#e07a1f;border-radius:3px"></div></body></html>`,
  );
  await page.waitForTimeout(ms);
}

async function storyboard(page, context) {
  // 1. Title.
  await card(page, "AnubhavPramaan", "Speak your experience, get assessed fairly. SIH26242", 3500);

  // 2. Bolo: the worker speaks (or, in a rehearsal, types) and sees their own words.
  if (rehearse) {
    await page.route("**/api/declaration/*/extract", (route) =>
      route.fulfill({ status: 503, json: { error: "rehearsal" } }),
    );
  }
  const label = WAV ? "Worker: role-play recording, Hindi" : "Rehearsal: typed answer";
  await page.goto(`${APP}/declare`);
  await caption(page, label);
  await page.waitForTimeout(1200);
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/api/declaration") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /हाँ, मैं सहमत हूँ/ }).click();
  const { id } = await (await created).json();
  await caption(page, label);
  await page.waitForTimeout(1500);
  if (WAV) {
    await page.locator('input[type="file"][accept="audio/*"]').setInputFiles(WAV);
    await page.locator("blockquote").waitFor({ timeout: 90_000 });
    await page
      .getByText("Suggestion: what the AI heard you do")
      .waitFor({ timeout: 90_000 })
      .catch(() => {});
  } else {
    await page.getByRole("button", { name: /or type it/ }).click();
    await page
      .getByLabel(/type your answer/)
      .pressSequentially("दीवार में पाइप डालकर क्लैंप से कसता हूँ। पाइप में तार खींचता हूँ।", {
        delay: 25,
      });
    await page.getByRole("button", { name: /सहेजें/ }).click();
    await page.locator("blockquote").waitFor();
  }
  await page.waitForTimeout(3000);

  // 3. Milao: the mapping (LLM in the real take, keyword baseline in a rehearsal) and the decision.
  await context.request.post(`${APP}/api/mapping`, {
    data: { declarationId: id, mode: rehearse ? "keyword" : "llm" },
    timeout: 180_000,
  });
  await page.goto(`${APP}/match/${id}`);
  await caption(page, "NCVET's 70% rule; the assessor decides");
  await page.waitForTimeout(2500);
  await page.getByPlaceholder("e.g. AS-0142").pressSequentially("AS-0142", { delay: 40 });
  await page.getByRole("button", { name: "Confirm QP and route" }).click();
  await page.waitForTimeout(2500);

  // 4. Parkho: anchors, the worker's own words, a photo, the network drops.
  await page.goto(`${APP}/assess/${id}`);
  await caption(page, "Works offline; the AI never gives a level");
  await page.getByRole("button", { name: "Record place" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /CON\/N0604/ }).click();
  const card4 = page.locator("article", { hasText: "lay conduit" }).first();
  await card4.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  await card4.getByText("1 Meets standard").click();
  await card4.locator('input[type="file"]').setInputFiles(PHOTO);
  await page.waitForTimeout(1500);

  // 5. Pramaan: the profile (the tablet keeps the assessor register while online), the network
  //    drops, a PIN sign-off offline, then back online and verified.
  await page.getByRole("button", { name: "Continue to profile and sign-off" }).click();
  await page.getByText("Assessor register on this tablet: signing works offline.").waitFor();
  await page.getByRole("textbox", { name: "PIN", exact: true }).scrollIntoViewIfNeeded();
  await context.setOffline(true);
  await page.waitForTimeout(2000);
  await page
    .getByRole("textbox", { name: "PIN", exact: true })
    .pressSequentially("2468", { delay: 120 });
  await page.getByRole("button", { name: "Sign with my PIN" }).click();
  await page.waitForTimeout(2000);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByRole("link", { name: "Open the verifiable record" }).click({ timeout: 30_000 });
  await caption(page, "Tamper-evident; anyone can verify it");
  await page.waitForTimeout(2500);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(2500);

  // 6. Samaan: agreement statistics on published reference data.
  await page.goto(`${APP}/samaan`);
  await caption(page, "Consistency, measured (published reference data)");
  await page.waitForTimeout(3000);

  // 7. End card.
  await card(page, "AI suggests. The assessor decides.", "AnubhavPramaan, Team PixelPaws", 3000);
}

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const browser = await chromium.launch();
// The pages are designed for a phone and a tablet, not a 1920-pixel canvas: every page is zoomed
// 1.5x, so the layout is the 1280-pixel one and the text is large enough to read in a video, while
// the screencast still delivers sharp 1920 x 1080 frames.
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  geolocation: { latitude: 22.5726, longitude: 88.3639 },
  permissions: ["geolocation"],
});
// A <style> element, not a style attribute on <html>: React compares the attributes of <html> when
// it hydrates and would report a mismatch, while an extra element in <head> is tolerated.
await context.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.id = "ap-video-zoom";
    style.textContent = "html { zoom: 1.5; }";
    document.head.appendChild(style);
  });
});
const page = await context.newPage();
const stop = await screencast(context, page);
if (dry) await dryRun(page);
else if (rehearse || WAV) await storyboard(page, context);
else throw new Error("Choose --dry, --rehearse or --wav <file>.");
const captured = await stop();
await browser.close();
const out = join(OUT_DIR, dry ? "dry-run.mp4" : rehearse ? "rehearsal.mp4" : "demo.mp4");
encode(captured, out);
console.log(`${captured.frames.length} frames -> ${out}`);
