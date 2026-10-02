/** Record the full demo with the app's own voices.
 *
 * Like record_demo.mjs, headless Chromium renders the running app at 1920 x 1080 (pages zoomed
 * 1.5x) and the DevTools screencast hands over every painted frame, so nothing outside the
 * browser can appear. On top of that:
 *
 *  - the worker "speaks": getUserMedia is answered with a recorded clip, so the app's real
 *    recorder, speech recognition and AI extraction run on it (clips: docs/internal/video/
 *    worker-clips, a synthetic role-play voice, labelled on screen);
 *  - every voice the app plays (the question, the read-back) is saved from its /api/voice/tts
 *    reply with the moment it arrived;
 *  - ffmpeg lays all of those sounds under the picture at the right times.
 *
 * The long mapping call happens between two recorded segments, so the video does not show
 * minutes of waiting. Every screen is the real app on data made through its own routes.
 *
 * Usage (app running on localhost:3000):
 *   node tools/record_demo_av.mjs               # synthetic role-play clips
 *   node tools/record_demo_av.mjs --clips <dir> # clip-1.wav ... clip-8.wav from another folder,
 *                                               # for example the lead's own role-play recordings
 *
 * Output (gitignored): docs/internal/video/demo-av.mp4 and demo-av.markers.json (each shot's
 * start time in the final video, for editing and for the voiceover).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "..");
const APP = process.env.AP_APP ?? "http://localhost:3000";
const OUT_DIR = join(ROOT, "docs", "internal", "video");
const WORK = join(OUT_DIR, "av-work");
const FPS = 30;
const clipsArg = process.argv.indexOf("--clips");
const CLIPS = clipsArg > 0 ? resolve(process.argv[clipsArg + 1]) : join(OUT_DIR, "worker-clips");
const SYNTHETIC = clipsArg < 0;
const PHOTO = join(ROOT, "public", "evidence", "conduit-strut-clamps.jpg");
const TOPICS = 8;

/** Seconds of audio in a PCM WAV file, read from its header. */
function wavSeconds(buf) {
  const channels = buf.readUInt16LE(22);
  const rate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") return size / (rate * channels * (bits / 8));
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk in WAV");
}

const ffprobeSeconds = (file) =>
  Number(
    spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
      encoding: "utf8",
    }).stdout,
  );

function ffmpeg(args) {
  const r = spawnSync(process.env.FFMPEG ?? "ffmpeg", ["-y", "-loglevel", "error", ...args], {
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error(`ffmpeg failed with ${r.status}`);
}

// ---------------------------------------------------------------------------------------------
// Segments: screencast frames, sounds and shot markers, all on the frames' own clock.

let segment = null;
const segments = [];

async function startSegment(context, page) {
  const n = segments.length + 1;
  const dir = join(WORK, `seg${n}`);
  mkdirSync(dir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const s = { n, dir, cdp, frames: [], audio: [], markers: [], skew: [] };
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = join(dir, `f${String(s.frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    const wall = Date.now() / 1000;
    const t = metadata.timestamp ?? wall;
    s.frames.push({ file, t });
    s.skew.push(wall - t);
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });
  segment = s;
}

async function endSegment() {
  const s = segment;
  s.end = Date.now() / 1000;
  await s.cdp.send("Page.stopScreencast");
  segments.push(s);
  segment = null;
}

const mark = (name) => segment?.markers.push({ name, wall: Date.now() / 1000 });
const addSound = (file, wall, kind) => segment?.audio.push({ file, wall, kind });

/** Encode one segment: frames held to their next frame, sounds delayed to their moment. */
function encodeSegment(s) {
  if (s.frames.length === 0) throw new Error(`segment ${s.n}: no frames`);
  const sorted = [...s.skew].sort((a, b) => a - b);
  const skew = sorted[Math.floor(sorted.length / 2)]; // wall clock minus frame clock
  const t0 = s.frames[0].t;
  const endT = s.end - skew;
  const lines = [];
  s.frames.forEach((f, i) => {
    const next = s.frames[i + 1]?.t ?? endT;
    lines.push(`file '${f.file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  lines.push(`file '${s.frames.at(-1).file.replace(/\\/g, "/")}'`);
  const list = join(s.dir, "list.txt");
  writeFileSync(list, lines.join("\n") + "\n");
  const duration = endT - t0;

  const inputs = ["-f", "concat", "-safe", "0", "-i", list, "-f", "lavfi", "-t", duration.toFixed(3), "-i", "anullsrc=r=48000:cl=mono"];
  const filters = [];
  const mixIn = ["[1:a]"];
  s.audio.forEach((a, i) => {
    inputs.push("-i", a.file);
    const ms = Math.max(0, Math.round((a.wall - skew - t0) * 1000));
    filters.push(`[${i + 2}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${ms}:all=1[s${i}]`);
    mixIn.push(`[s${i}]`);
  });
  filters.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:normalize=0:duration=first[aout]`);
  const out = join(WORK, `seg${s.n}.mp4`);
  ffmpeg([
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "0:v", "-map", "[aout]",
    "-vf", `fps=${FPS},scale=in_range=full:out_range=tv,format=yuv420p`,
    "-c:v", "libx264", "-crf", "18", "-preset", "medium",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
    "-t", duration.toFixed(3),
    out,
  ]);
  return {
    out,
    duration,
    markers: s.markers.map((m) => ({ name: m.name, t: m.wall - skew - t0 })),
    sounds: s.audio.map((a) => ({ kind: a.kind, t: a.wall - skew - t0, file: a.file })),
  };
}

// ---------------------------------------------------------------------------------------------
// On-screen helpers (same look as record_demo.mjs).

async function caption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById("ap-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "ap-caption";
      el.style.cssText =
        "position:fixed;left:32px;bottom:28px;z-index:99999;pointer-events:none;background:#1b2559;color:#fff;font:600 20px/1.3 'Noto Sans',sans-serif;padding:10px 16px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.18)";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

async function card(page, title, line, ms) {
  await page.setContent(
    `<html><body style="margin:0;height:100vh;display:grid;place-content:center;text-align:center;background:#fff;color:#1b2559;font-family:'Noto Sans',sans-serif">` +
      `<div style="font-size:72px;font-weight:700">${title}</div>` +
      `<div style="margin-top:18px;font-size:30px;color:#5f6b7a">${line}</div>` +
      `<div style="margin:36px auto 0;width:120px;height:6px;background:#e07a1f;border-radius:3px"></div></body></html>`,
  );
  await page.waitForTimeout(ms);
}

// ---------------------------------------------------------------------------------------------

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
for (let k = 1; k <= TOPICS; k++) {
  if (!existsSync(join(CLIPS, `clip-${k}.wav`))) throw new Error(`missing ${join(CLIPS, `clip-${k}.wav`)}`);
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  geolocation: { latitude: 22.5726, longitude: 88.3639 },
  permissions: ["geolocation", "microphone"],
});
await context.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.id = "ap-video-zoom";
    style.textContent = "html { zoom: 1.5; }";
    document.head.appendChild(style);
  });
  // The worker's voice: when a clip is set, the microphone stream is that clip, played once.
  const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (original) {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const url = window.__apClip;
      if (!url) return original(constraints);
      const ctx = new AudioContext();
      await ctx.resume();
      const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.start();
      window.__apClipStartedAt = Date.now();
      return dest.stream;
    };
  }
});
await context.route(`${APP}/__demo/clip-*.wav`, (route) => {
  const name = new URL(route.request().url()).pathname.split("/").pop();
  route.fulfill({ status: 200, contentType: "audio/wav", body: readFileSync(join(CLIPS, name)) });
});

const page = await context.newPage();
let ttsCount = 0;
const ttsWaiters = [];
page.on("response", async (r) => {
  if (!r.url().endsWith("/api/voice/tts") || r.request().method() !== "POST") return;
  const wall = Date.now() / 1000;
  try {
    const j = await r.json();
    if (!j.audio) return;
    const file = join(WORK, `tts-${++ttsCount}.wav`);
    const bytes = Buffer.from(j.audio, "base64");
    writeFileSync(file, bytes);
    addSound(file, wall, "app voice");
    const seconds = wavSeconds(bytes);
    ttsWaiters.shift()?.(seconds);
  } catch (e) {
    console.warn("could not keep a TTS reply:", e.message);
    ttsWaiters.shift()?.(3);
  }
});
/** Click something that makes the app speak, then wait until it has finished speaking. */
async function clickAndListen(locator) {
  const nextReply = (ms) =>
    Promise.race([
      new Promise((res) => ttsWaiters.push(res)),
      new Promise((res) => setTimeout(() => res(null), ms)),
    ]);
  const first = nextReply(60_000);
  await locator.click();
  let seconds = await first;
  if (seconds === null) throw new Error("the app did not speak within 60 s");
  // A long text is spoken in parts: each part is fetched after the previous one has played.
  while (seconds !== null) {
    const more = nextReply(seconds * 1000 + 3_000);
    seconds = await more;
    if (seconds === null) ttsWaiters.length = 0;
  }
  await page.waitForTimeout(600);
}

// ---- Segment 1: the worker ------------------------------------------------------------------
await startSegment(context, page);
mark("title");
await card(page, "AnubhavPramaan", "Speak your experience, get assessed fairly. SIH26242", 3500);

mark("home");
await page.goto(`${APP}/`);
await page.waitForTimeout(3000);
await page.getByRole("link", { name: /Start a declaration/ }).click();

mark("bolo-consent");
await page.getByRole("button", { name: /हाँ, मैं सहमत हूँ/ }).waitFor();
await page.waitForTimeout(3000);
const created = page.waitForResponse(
  (r) => r.url().endsWith("/api/declaration") && r.request().method() === "POST",
);
await page.getByRole("button", { name: /हाँ, मैं सहमत हूँ/ }).click();
const { id } = await (await created).json();

const workerLabel = SYNTHETIC
  ? "Worker: role-play answer, synthetic voice for this demo"
  : "Worker: role-play recording";
for (let k = 0; k < TOPICS; k++) {
  mark(`bolo-q${k + 1}`);
  await page.getByRole("button", { name: /सवाल सुनें/ }).waitFor();
  await caption(page, "The app reads the question aloud");
  await clickAndListen(page.getByRole("button", { name: /सवाल सुनें/ }));

  mark(`bolo-a${k + 1}`);
  await caption(page, workerLabel);
  const clip = join(CLIPS, `clip-${k + 1}.wav`);
  const clipSeconds = wavSeconds(readFileSync(clip));
  await page.evaluate((u) => {
    window.__apClip = u;
    window.__apClipStartedAt = 0;
  }, `${APP}/__demo/clip-${k + 1}.wav`);
  await page.getByRole("button", { name: /बोलें \(Speak\)/ }).click();
  await page.waitForFunction(() => window.__apClipStartedAt > 0, null, { timeout: 15_000 });
  const startedAt = (await page.evaluate(() => window.__apClipStartedAt)) / 1000;
  addSound(clip, startedAt, "worker");
  await page.waitForTimeout(clipSeconds * 1000 + 700);
  await page.getByRole("button", { name: /रुकें \(Stop\)/ }).click();

  mark(`bolo-ai${k + 1}`);
  await caption(page, "Speech to text, then the AI marks what the worker did");
  const done = page
    .getByText(/what the AI heard you do|could not be processed automatically/)
    .first();
  await done.waitFor({ timeout: 180_000 });
  await done.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3500);

  if (k < TOPICS - 1) {
    await page.getByRole("button", { name: /अगला सवाल/ }).click();
  } else {
    const readBack = page.getByRole("button", { name: /read it back/ });
    if (!(await readBack.isVisible())) await page.getByRole("button", { name: /अगला सवाल/ }).click();
    await page.getByRole("button", { name: /read it back/ }).click();
  }
}

mark("bolo-readback");
await caption(page, "Read back to the worker before anything counts");
await page.getByRole("button", { name: /सुनें \(listen\)/ }).waitFor();
await page.waitForTimeout(1500);
await clickAndListen(page.getByRole("button", { name: /सुनें \(listen\)/ }));
await page.getByRole("button", { name: /हाँ, सही है/ }).click();
mark("bolo-done");
await page.getByText("Thank you. Your declaration is with the assessor.").waitFor();
await caption(page, "The worker confirms; the declaration goes to the assessor");
await page.waitForTimeout(3000);
await endSegment();

// ---- Between segments: the mapping (minutes of model calls, not filmed) ----------------------
const mapStart = Date.now();
const mapped = await context.request.post(`${APP}/api/mapping`, {
  data: { declarationId: id, mode: "llm" },
  timeout: 600_000,
});
if (!mapped.ok()) throw new Error(`mapping failed: ${mapped.status()} ${await mapped.text()}`);
const mappingSeconds = Math.round((Date.now() - mapStart) / 1000);

// ---- Segment 2: the assessor ----------------------------------------------------------------
await page.goto(`${APP}/match/${id}`);
await startSegment(context, page);
mark("milao");
await caption(page, "Milao: matched to the Qualification Pack; NCVET's 70% rule");
await page.waitForTimeout(4500);
await page.mouse.wheel(0, 650);
mark("milao-coverage");
await caption(page, "Where the worker's words land, criterion by criterion");
await page.waitForTimeout(4500);
await page.mouse.wheel(0, -650);
await page.waitForTimeout(1200);
mark("milao-decide");
await caption(page, "The assessor confirms or changes the suggestion");
await page.getByPlaceholder("e.g. AS-0142").pressSequentially("AS-0142", { delay: 60 });
await page.getByRole("button", { name: "Confirm QP and route" }).click();
await page.waitForTimeout(2500);

mark("parkho");
await page.goto(`${APP}/assess/${id}`);
await page.getByRole("heading", { name: "Practical assessment" }).waitFor();
await caption(page, "Parkho: anchored criteria, with the worker's own words");
await page.waitForTimeout(3500);
await page.getByRole("button", { name: "Record place" }).click();
await page.waitForTimeout(800);
const first = page.locator("article").first();
await first.getByText("1 Meets standard").click();
await page.waitForTimeout(800);
for (let i = 1; i < 3; i++) {
  await page.locator("article").nth(i).getByText("1 Meets standard").click();
  await page.waitForTimeout(500);
}
// Wiring: the conduit criterion, where the worker's own words and the photo both belong.
mark("parkho-wiring");
await page.getByRole("button", { name: /CON\/N0604/ }).click();
const conduit = page.locator("article", { hasText: "lock conduit pipe" }).first();
await conduit.scrollIntoViewIfNeeded();
await caption(page, "A measured criterion: scored by the rule, from the assessor's reading");
await page.waitForTimeout(3000);
await conduit.getByLabel("Reading").pressSequentially("450", { delay: 120 });
await conduit.getByText("Inside the band: full marks").waitFor();
await page.waitForTimeout(2500);
mark("parkho-photo");
await caption(page, "Photo evidence, hashed on the device");
await conduit.locator('input[type="file"]').setInputFiles(PHOTO);
await page.waitForTimeout(1500);
mark("parkho-hint");
await caption(page, "AI hint: says only what it can see; never gives a score");
await conduit.getByRole("button", { name: "Ask for an evidence hint" }).click();
await conduit.getByText(/AI hint:/).first().waitFor({ timeout: 120_000 });
await conduit.getByText(/AI hint:/).first().scrollIntoViewIfNeeded();
await page.waitForTimeout(4000);
mark("parkho-offline");
await context.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event("offline")));
await caption(page, "No network at the camp: scoring keeps working");
const pull = page.locator("article", { hasText: "pull, push wires through conduits" }).first();
await pull.scrollIntoViewIfNeeded();
await pull.getByText("1 Meets standard").click();
await page.waitForTimeout(3000);
mark("parkho-sync");
await context.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));
await caption(page, "Back online: the saved scores sync");
const synced = page.getByText("0 waiting to sync");
await synced.waitFor({ timeout: 12_000 }).catch(async () => {
  await page.getByRole("button", { name: "Sync now" }).click();
  await synced.waitFor({ timeout: 60_000 });
});
await page.waitForTimeout(2000);

mark("pramaan");
await page.getByRole("button", { name: "Continue to profile and sign-off" }).click();
await page.getByRole("textbox", { name: "PIN", exact: true }).waitFor();
await page.getByText("Assessor register on this tablet: signing works offline.").waitFor();
await caption(page, "Pramaan: only the assessor signs, with a PIN, even offline");
await page.waitForTimeout(3000);
await context.setOffline(true);
await page.getByRole("textbox", { name: "PIN", exact: true }).scrollIntoViewIfNeeded();
await page.getByRole("textbox", { name: "PIN", exact: true }).pressSequentially("2468", { delay: 150 });
await page.getByRole("button", { name: "Sign with my PIN" }).click();
await page.waitForTimeout(2500);
await context.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));
await page.getByRole("link", { name: "Open the verifiable record" }).click({ timeout: 60_000 });
mark("verify");
await caption(page, "A tamper-evident record anyone can verify by QR");
await page.waitForTimeout(3500);
await page.mouse.wheel(0, 700);
await page.waitForTimeout(3500);

mark("samaan");
await page.goto(`${APP}/samaan`);
await caption(page, "Samaan: consistency between assessors (published reference data)");
await page.waitForTimeout(4000);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(3000);

mark("end");
await card(page, "AI suggests. The assessor decides.", "AnubhavPramaan, Team PixelPaws", 3500);
await endSegment();
await browser.close();

// ---- Encode, join, and write the shot list ---------------------------------------------------
const encoded = segments.map(encodeSegment);
const concatList = join(WORK, "segments.txt");
writeFileSync(concatList, encoded.map((e) => `file '${e.out.replace(/\\/g, "/")}'`).join("\n") + "\n");
const out = join(OUT_DIR, "demo-av.mp4");
ffmpeg(["-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", "-movflags", "+faststart", out]);

let offset = 0;
const shots = [];
const sounds = [];
for (const e of encoded) {
  for (const m of e.markers) shots.push({ name: m.name, at: +(offset + m.t).toFixed(2) });
  for (const s of e.sounds) sounds.push({ kind: s.kind, at: +(offset + s.t).toFixed(2) });
  offset += e.duration;
}
const total = ffprobeSeconds(out);
writeFileSync(
  join(OUT_DIR, "demo-av.markers.json"),
  JSON.stringify(
    {
      declarationId: id,
      workerVoice: SYNTHETIC ? "synthetic role-play voice (ElevenLabs)" : `recordings from ${CLIPS}`,
      mappingSeconds,
      note: "The mapping ran between the two segments and is not filmed.",
      seconds: +total.toFixed(2),
      shots,
      sounds,
    },
    null,
    2,
  ) + "\n",
);
console.log(`${out}: ${total.toFixed(1)} s, ${sounds.length} sounds; mapping took ${mappingSeconds} s (not filmed)`);
