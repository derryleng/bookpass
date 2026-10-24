// An accessibility pass over every screen, in the light and the dark theme, with axe-core.
//
//   npm run build && npm run helper:build && node tests/e2e/a11y.ts
//
// It prints each violation with the element that caused it. It fails if any serious or critical one is left.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "puppeteer-core";
import { password, root, sleep, startSession } from "./lib.ts";

const axeSource = readFileSync(
  join(root, "node_modules/axe-core/axe.min.js"),
  "utf8",
);
const {
  extension,
  site,
  browser,
  check,
  openPage,
  hasText,
  click,
  type,
  finish,
} = await startSession("a11y");

interface Violation {
  id: string;
  impact: string;
  help: string;
  nodes: { target: string[]; failureSummary?: string }[];
}

async function audit(page: Page, name: string) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: scheme },
    ]);
    await sleep(250);
    await page.evaluate(axeSource);
    const result = (await page.evaluate(async () =>
      JSON.parse(
        JSON.stringify(
          await (
            globalThis as unknown as {
              axe: {
                run: (
                  c: Document,
                  o: object,
                ) => Promise<{ violations: Violation[] }>;
              };
            }
          ).axe.run(document, {}),
        ),
      ),
    )) as { violations: Violation[] };
    const serious = result.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    check(
      `${name} (${scheme}) has no serious accessibility problems`,
      serious.length === 0,
    );
    for (const v of result.violations) {
      console.log(`    ${v.impact}: ${v.id}: ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) {
        console.log(
          `        ${n.target.join(" ")}  ${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 140)}`,
        );
      }
    }
  }
}

try {
  const manager = await openPage("manager.html");
  await hasText(manager, "Create your vault");
  await audit(manager, "create vault");

  await type(manager, "input[type=password]", password);
  await (await manager.$$("input[type=password]"))[1]!.type(password);
  await click(manager, "button", "Create vault");
  await hasText(manager, "All bookmarks", 15000);

  // Some content to look at.
  await click(manager, "button", "New folder");
  await manager.waitForSelector("dialog[open] input");
  await audit(manager, "folder dialog");
  await manager.type("dialog[open] input", "Reading");
  await manager.evaluate(() =>
    document.querySelector<HTMLButtonElement>("dialog button.primary")?.click(),
  );
  await sleep(800);

  const article = await browser.newPage();
  await article.goto(`${site}/article`);
  await article.bringToFront();
  await extension.triggerAction(article);
  await sleep(2000);
  const popup = (await extension.pages()).find((p) =>
    p.url().endsWith("popup.html"),
  );
  if (popup) {
    await sleep(1500);
    await audit(popup, "popup");
    await click(popup, "button", "Save bookmark");
    await sleep(2500);
  }
  await manager.bringToFront();
  await hasText(manager, "A fine article about Rust");
  await audit(manager, "bookmark list");

  await click(manager, "button", "Add bookmark");
  await manager.waitForSelector("dialog[open] form");
  await audit(manager, "bookmark dialog");
  await manager.keyboard.press("Escape");

  await click(manager, "summary", "Tools");
  await click(manager, ".menu-list button", "Manage tags…");
  await manager.waitForSelector("dialog[open]");
  await audit(manager, "tags dialog");
  await manager.keyboard.press("Escape");

  await click(manager, "button", "Settings");
  await hasText(manager, "Locking");
  await audit(manager, "settings");

  await click(manager, "button", "Lock");
  await hasText(manager, "Unlock BookPass");
  await audit(manager, "unlock");
} catch (e) {
  check("the run finished without an error", false, String(e).slice(0, 300));
}
await finish();
