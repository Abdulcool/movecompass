import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
const base = process.env.APP_URL || "http://127.0.0.1:18085";
const file = process.argv[2];
if (!file) throw new Error("Pass the six-repetition squat Y4M file");
const shots = `${homedir()}/work/shots/hires`;
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${file}`] });
const phone = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, permissions: ["camera"] });
const staff = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 3 });
const p = await phone.newPage(), a = await staff.newPage(), names = [], errors = [];
for (const page of [p, a]) {
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
}
async function shot(page, name) {
  await page.screenshot({ path: `${shots}/${name}.png`, scale: "device" });
  names.push(name);
}
async function credentials(page, email) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
try {
  await p.addInitScript(() => { window.__MOVE_BODY_TEST__ = {}; });
  await a.goto(base);
  await a.getByRole("button", { name: "CCCARE staff", exact: true }).click();
  await credentials(a, "staff@cccare.ca");
  await a.getByText("● Live connection online", { exact: true }).waitFor();
  await p.goto(base);
  await p.getByText("Your next safe step.", { exact: true }).waitFor();
  await shot(p, "01-login");
  await credentials(p, "janedoe@gmail.com");
  await p.getByText("Hello, Jane.", { exact: true }).waitFor();
  await shot(p, "02-home");
  await p.getByRole("tab", { name: /Plan/ }).click();
  await p.waitForFunction(() => window.__MOVE_BODY_TEST__?.ready && window.__MOVE_BODY_TEST__?.project);
  const canvas = p.locator("canvas"), box = await canvas.boundingBox();
  await p.mouse.click(box.x + 8, box.y + 8);
  const point = await p.evaluate(() => window.__MOVE_BODY_TEST__.project([.30, 1.56, -.10]));
  await p.mouse.click(point.x, point.y);
  await expect(p.getByRole("button", { name: "Shoulders", exact: true })).toHaveAttribute("aria-pressed", "true");
  await shot(p, "03-plan-3d-body");
  await p.getByRole("button", { name: "Show all exercises", exact: true }).click();
  await p.getByRole("button", { name: "Open Supported sit-to-stand", exact: true }).click();
  await p.getByRole("button", { name: "Mark complete", exact: true }).waitFor();
  await shot(p, "04-exercise-detail");
  await p.getByRole("button", { name: "Start guided tracking", exact: true }).click();
  const start = p.getByRole("button", { name: "Start live pose tracking", exact: true });
  await expect(start).toBeDisabled();
  assert.equal(await p.locator("iframe").count(), 0);
  await start.scrollIntoViewIfNeeded();
  await shot(p, "05-camera-consent");
  const tracker = await phone.newPage();
  tracker.on("pageerror", error => errors.push(error.message));
  await tracker.goto(`${base}/tracker.html?exercise=sit-to-stand&target=6`);
  await tracker.getByRole("heading", { name: "Supported sit-to-stand", exact: true }).waitFor();
  await tracker.waitForFunction(() => Number(document.getElementById("counter").textContent.split("/")[0]) >= 1, null, { timeout: 90000 });
  await shot(tracker, "06-tracker-video-fed");
  await tracker.close();
  await p.getByRole("button", { name: "I understand and consent to the tracking prototype", exact: true }).click();
  const completion = p.waitForResponse(response => response.url().endsWith("/api/completions") && response.request().method() === "POST", { timeout: 120000 });
  await start.click();
  const response = await completion, payload = response.request().postDataJSON();
  assert.equal(response.status(), 201); assert.equal(payload.source, "camera"); assert.equal(payload.reps, 6); assert.ok(payload.angles.rightKnee > 60);
  await p.getByText("Session saved. Your care team has been notified.", { exact: true }).waitFor();
  await a.getByRole("alert").filter({ hasText: "Jane Doe completed Supported sit-to-stand · 6 reps" }).waitFor();
  await shot(a, "08-staff-live");
  await p.goto(`${base}/profile`);
  await p.getByText("Recent activity", { exact: true }).waitFor();
  await p.getByText(/6 reps · Camera guided/).waitFor();
  await shot(p, "07-profile-saved");
  assert.deepEqual(errors, []);
  console.log("PASS DPR-3 presentation: real model selection, consent gate, camera completion with ROM, saved history and live staff toast");
  for (const name of names.sort()) {
    const bytes = await readFile(`${shots}/${name}.png`);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    assert.equal(width, name === "08-staff-live" ? 3840 : 1290);
    assert.equal(height, name === "08-staff-live" ? 2880 : 2796);
    console.log(`${shots}/${name}.png ${width}x${height}`);
  }
} finally { await browser.close(); }
