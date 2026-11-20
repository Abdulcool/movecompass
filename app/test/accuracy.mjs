import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const [file, exercise, seconds = "15", name = "camera"] = process.argv.slice(2);
if (!file || !exercise)
  throw new Error(
    "Usage: node test/accuracy.mjs video.y4m exercise seconds name",
  );
const base = process.env.APP_URL || "http://127.0.0.1:18081";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${file}`,
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 1000 },
    permissions: ["camera"],
  });
  await page.addInitScript(() => {
    window.framesSeen = [];
    window.messages = [];
    window.ReactNativeWebView = {
      postMessage: (message) => window.messages.push(JSON.parse(message)),
    };
    window.addEventListener("movecompass:frame", (e) =>
      window.framesSeen.push(e.detail),
    );
  });
  const external = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith(base) &&
      !request.url().startsWith("data:") &&
      !request.url().startsWith("blob:")
    )
      external.push(request.url());
  });
  page.on("pageerror", (error) => console.error("PAGE ERROR", error.message));
  await page.goto(
    `${base}/tracker.html?exercise=${exercise}&target=${process.env.TARGET || 999}`,
  );
  await page.waitForFunction(
    () =>
      window.framesSeen.length > 0 || !document.getElementById("error").hidden,
    { timeout: 90000 },
  );
  const error = await page.locator("#error").textContent();
  if (error) throw new Error(error);
  await page.waitForTimeout(Number(seconds) * 1000);
  await page.screenshot({
    path: `/home/ubuntu/work/shots/${name}-overlay.png`,
  });
  const frames = await page.evaluate(() => window.framesSeen),
    messages = await page.evaluate(() => window.messages);
  const angles = {};
  for (const frame of frames)
    for (const [key, value] of Object.entries(frame.angles)) {
      if (value === null) continue;
      angles[key] ??= [Infinity, -Infinity];
      angles[key][0] = Math.min(angles[key][0], value);
      angles[key][1] = Math.max(angles[key][1], value);
    }
  const result = {
    file,
    exercise,
    frames: frames.length,
    reps: Math.max(0, ...frames.map((f) => f.reps)),
    angles,
    feedback: [...new Set(frames.map((f) => f.feedback))],
    external,
    messages,
  };
  await writeFile(
    `/home/ubuntu/work/accuracy/${name}-frames.json`,
    JSON.stringify(frames),
  );
  await writeFile(
    `/home/ubuntu/work/accuracy/${name}-result.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
