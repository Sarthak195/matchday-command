import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const browser = await chromium.launch();
const context = await browser.newContext();
let total = 0;

function report(label, violations) {
  total += violations.length;
  console.log(`\n=== ${label} — ${violations.length} violation(s) ===`);
  for (const v of violations) {
    console.log(`[${v.impact}] ${v.id}: ${v.help}`);
    for (const n of v.nodes.slice(0, 6)) console.log(`    ${n.target.join(" ")}`);
  }
}

async function audit(page, label) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  report(label, violations);
}

// Static pages
for (const path of ["/", "/staff", "/tournament"]) {
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await audit(page, path);
  await page.close();
}

// Interactive states on the ops page (modals + copilot are where a11y hides)
const page = await context.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1500);

await page.getByRole("button", { name: /copilot/i }).click();
await page.waitForTimeout(400);
await audit(page, "/ (copilot open)");
await page
  .getByRole("button", { name: /close copilot/i })
  .click()
  .catch(() => {});

await page.getByRole("button", { name: /emergency/i }).click();
await page.waitForTimeout(400);
await audit(page, "/ (emergency confirm dialog)");

await browser.close();
console.log(`\nTOTAL violations: ${total}`);
process.exit(total > 0 ? 1 : 0);
