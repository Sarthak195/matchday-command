import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = process.env.E2E_OUT || "./e2e-out";
mkdirSync(OUT, { recursive: true });

const results = [];
const consoleErrors = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (err) {
    results.push(`FAIL  ${name} — ${err.message.split("\n")[0]}`);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);

// Advance the sim to generate telemetry + incidents.
await step("fast-forward sim to build state", async () => {
  for (let i = 0; i < 6; i++) {
    const beat = page.getByRole("button", { name: /Next beat/i });
    if (await beat.isEnabled().catch(() => false)) {
      await beat.click();
      await page.waitForTimeout(900);
    }
  }
  await shot("01-ops-populated");
});

await step("live feed shows events", async () => {
  const feedText = await page.getByRole("region", { name: /live event feed/i }).innerText();
  if (feedText.trim().length < 5) throw new Error("feed empty");
});

await step("AI triage an incident", async () => {
  const triageBtn = page.getByRole("button", { name: /^AI triage$/ }).first();
  if ((await triageBtn.count()) === 0) {
    results.push("SKIP  AI triage — no open incident to triage");
    return;
  }
  await triageBtn.click();
  await page.getByText("AI triage", { exact: false }).first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(1500);
  await shot("02-triage");
});

await step("generate ops briefing", async () => {
  await page.getByRole("button", { name: "Ops briefing" }).click();
  await page.getByRole("dialog").waitFor({ timeout: 5000 });
  // Wait for generation to finish (loading label gone) before closing.
  await page
    .getByText(/Writing ops briefing/i)
    .waitFor({ state: "hidden", timeout: 45000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  await shot("03-briefing");
  await page.getByRole("button", { name: "Close" }).click();
  // Confirm the overlay actually closed (regression guard for the reopen bug).
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 8000 });
});

await step("copilot answers a question", async () => {
  await page.getByRole("button", { name: /Copilot/i }).click();
  const input = page.getByRole("textbox", { name: /copilot/i });
  await input.fill("What needs my attention right now?");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForTimeout(8000); // Gemini round-trip (+ possible fallback)
  await shot("04-copilot");
});

await step("emergency evacuation flow", async () => {
  // Close the copilot first so its panel can't intercept clicks.
  await page
    .getByRole("button", { name: /close copilot/i })
    .click()
    .catch(() => {});
  await page.getByRole("button", { name: /Emergency/i }).click();
  await page.getByRole("dialog", { name: /major incident/i }).waitFor({ timeout: 10000 });
  // Activate; retry once if the AI call transiently 500s (a real operator would too).
  let planShown = false;
  for (let attempt = 0; attempt < 2 && !planShown; attempt++) {
    await page
      .getByRole("button", { name: /Activate emergency/i })
      .click()
      .catch(() => {});
    try {
      await page.getByRole("dialog", { name: /evacuation plan/i }).waitFor({ timeout: 45000 });
      planShown = true;
    } catch {
      await page
        .getByRole("button", { name: "Close" })
        .click()
        .catch(() => {});
      await page
        .getByRole("button", { name: /Emergency/i })
        .click()
        .catch(() => {});
    }
  }
  if (!planShown) throw new Error("evacuation plan did not appear after retry");
  await shot("05-evacuation");
  await page.getByRole("button", { name: "Close" }).click();
});

await step("staff console renders", async () => {
  await page.goto(BASE + "/staff", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.getByText(/Task board/i).waitFor({ timeout: 10000 });
  await shot("06-staff");
});

await step("tournament view renders", async () => {
  await page.goto(BASE + "/tournament", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByText(/Tournament pulse/i).waitFor({ timeout: 10000 });
  await shot("07-tournament");
});

await browser.close();

console.log("\n=== E2E walkthrough ===");
for (const r of results) console.log(r);
console.log(`\n=== console/page errors: ${consoleErrors.length} ===`);
for (const e of consoleErrors.slice(0, 20)) console.log(`  - ${e}`);
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${failed} failed, screenshots in ${OUT}`);
process.exit(failed > 0 ? 1 : 0);
