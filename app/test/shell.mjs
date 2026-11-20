import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
const base = process.env.APP_URL || "http://127.0.0.1:8080";
const shots = process.env.SHOTS_DIR || `${homedir()}/work/shots`;
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
async function login(page, email, role) {
  await page.goto(base);
  if (role === "staff")
    await page
      .getByRole("button", { name: "CCCARE staff", exact: true })
      .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
async function visible(locator) {
  await locator.waitFor({ state: "visible" });
}
try {
  const patient = await browser.newContext({
      viewport: { width: 430, height: 932 },
    }),
    staff = await browser.newContext({
      viewport: { width: 1280, height: 960 },
    });
  const p = await patient.newPage(),
    a = await staff.newPage();
  for (const page of [p, a])
    page.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base);
  await visible(p.getByText("Your next safe step.", { exact: true }));
  await p.screenshot({ path: `${shots}/01-login.png`, fullPage: true });
  await p.getByRole("button", { name: "Continue", exact: true }).click();
  await visible(p.getByRole("alert"));
  console.log("PASS login validation displays an error");
  await login(a, "staff@cccare.ca", "staff");
  await visible(a.getByText("Waiting for your first care update."));
  await visible(a.getByText("● Live connection online"));
  console.log("PASS staff authenticates with an empty live inbox");
  await login(p, "janedoe@gmail.com", "patient");
  await visible(p.getByText("Hello, Jane."));
  await p.getByRole("tab", { name: /Plan/ }).click();
  await visible(p.getByText("Your plan", { exact: true }));
  await p.getByRole("button", { name: "Hips", exact: true }).click();
  await p.getByRole("button", { name: "Pain relief", exact: true }).click();
  await visible(
    p.getByText(
      "Try another care goal or ask your CCCARE instructor for an adjusted dosage.",
    ),
  );
  await p
    .getByRole("button", { name: "Show all exercises", exact: true })
    .click();
  await p.screenshot({ path: `${shots}/02-plan.png`, fullPage: true });
  console.log("PASS patient plan, region and goal filters, and empty state");
  await p
    .getByRole("button", { name: "Open Supported sit-to-stand", exact: true })
    .click();
  await visible(p.getByRole("button", { name: "Mark complete", exact: true }));
  await p.screenshot({ path: `${shots}/03-exercise.png`, fullPage: true });
  await p.getByRole("button", { name: "Mark complete", exact: true }).click();
  await visible(
    p.getByText("Activity saved. Your care team has been notified."),
  );
  await visible(
    a
      .getByRole("alert")
      .filter({
        hasText: "Jane Doe completed Supported sit-to-stand · 6 reps",
      }),
  );
  await a.screenshot({ path: `${shots}/04-staff-live.png`, fullPage: true });
  console.log(
    "PASS patient manual completion reaches staff toast live in a separate browser context",
  );
  await p.getByRole("alert").click();
  await p
    .getByRole("button", { name: "Start guided tracking", exact: true })
    .click();
  assert.equal(
    await p
      .getByRole("button", { name: "Start live pose tracking", exact: true })
      .isDisabled(),
    true,
  );
  await p
    .getByRole("button", {
      name: "I understand and consent to the tracking prototype",
      exact: true,
    })
    .click();
  await p
    .getByRole("button", { name: "Start live pose tracking", exact: true })
    .click();
  await visible(
    p.getByText(
      "Camera tracking is coming in the next step. No camera is active and no repetitions are being detected.",
    ),
  );
  console.log("PASS consent gates the inert PoseTracker placeholder");
  await p.reload();
  await visible(p.getByText("Before camera tracking"));
  console.log("PASS auth persists after reload");
  await a.getByRole("alert").click();
  await a.getByLabel("Device name", { exact: true }).fill("Jane demo board");
  await a.getByRole("button", { name: "Register device", exact: true }).click();
  await visible(a.getByText("Firmware configuration", { exact: true }));
  await visible(
    a.getByRole("button", { name: "Hide device secret", exact: true }),
  );
  await a
    .getByRole("button", { name: "Hide device secret", exact: true })
    .click();
  console.log(
    "PASS device registration shows a one-time key and firmware config",
  );
  assert.deepEqual(errors, []);
  console.log("PASS no browser runtime errors");
  console.log(
    `Screenshots: ${shots}/01-login.png, 02-plan.png, 03-exercise.png, 04-staff-live.png`,
  );
} finally {
  await browser.close();
}
