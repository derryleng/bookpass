// The toolbar of a list and what it controls: the tick box that appears over the heading's icon and picks everything
// in the list, the one View menu, and the sections a list can be split into (by subfolder, title, website, dates).
//
//   npm run build && npm run helper:build && node tests/e2e/view.ts
import { join } from "node:path";
import type { Page } from "puppeteer-core";
import { fixtures, password, sleep, startSession } from "./lib.ts";

const { check, openPage, text, hasText, click, type, shot, finish } =
  await startSession("view");

const importPath = join(fixtures, "bookmarks.html");
const heads = (page: Page) =>
  page.$$eval("section header h2", (els) =>
    els.map((e) => (e as HTMLElement).innerText),
  );
const selectedCount = (page: Page) =>
  page.evaluate(
    () => document.querySelectorAll("article:has(input:checked)").length,
  );
const open = (page: Page, label: string) =>
  page.evaluate(
    (label) =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "nav button, nav [role=button]",
        ),
      ]
        .find((e) => e.innerText.trim().startsWith(label))
        ?.click(),
    label,
  );
const menu = (page: Page) =>
  page.evaluate(() =>
    document
      .querySelector<HTMLElement>('summary[aria-label="View options"]')
      ?.click(),
  );
/** Waits for a change to reach the vault, which shows as Saving… in the toolbar. */
const settle = async (page: Page) => {
  await sleep(200);
  await page.waitForFunction(
    () => !document.body.innerText.includes("Saving…"),
    {
      timeout: 10000,
    },
  );
  await sleep(150);
};
const choose = async (page: Page, label: string, value: string) => {
  await page.select(
    `div[role=group][aria-label=View] select[aria-label="${label}"]`,
    value,
  );
  await settle(page);
};
const headTick = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector<HTMLInputElement>(
      "main > header input[type=checkbox]",
    )!;
    return {
      opacity: getComputedStyle(box).opacity,
      checked: box.checked,
      partial: box.indeterminate,
    };
  });

try {
  const manager = await openPage("manager.html");
  await hasText(manager, "Create your vault");
  await type(manager, "input[type=password]", password);
  await (await manager.$$("input[type=password]"))[1]!.type(password);
  await click(manager, "button", "Create vault");
  await hasText(manager, "All bookmarks", 15000);
  await click(manager, "summary", "Tools");
  await click(manager, "[role=menu] button", "Import bookmarks…");
  await manager.waitForSelector("dialog[open] input[type=file]");
  await (await manager.$("dialog[open] input[type=file]"))!.uploadFile(
    importPath,
  );
  await hasText(manager, "bookmarks to import");
  await click(manager, "dialog button", "Import");
  await hasText(manager, "Imported");
  await click(manager, "dialog button", "Done");
  await manager.waitForSelector("article", { timeout: 15000 });

  const root = await manager.$eval(
    "nav [role=button] > span",
    (e) => (e as HTMLElement).innerText,
  );

  // 1. The heading's icon turns into a tick box that picks the whole list.
  await open(manager, "Imported");
  await sleep(500);
  check(
    "a folder shows its own bookmarks first",
    (await manager.$$("article")).length === 1,
  );
  check(
    "the tick box is hidden behind the icon",
    (await headTick(manager)).opacity === "0",
  );
  await manager.hover("main > header label");
  await sleep(250);
  check(
    "hovering the icon reveals the tick box",
    (await headTick(manager)).opacity === "1",
  );
  await shot(manager, "head-tick-hover");
  await manager.click("main > header input[type=checkbox]");
  await sleep(300);
  check(
    "ticking it picks every bookmark in the folder",
    (await selectedCount(manager)) === 1,
  );

  await menu(manager);
  await manager.waitForSelector("div[role=group][aria-label=View]");
  await manager.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "div[role=group][aria-label=View] label",
      ),
    ]
      .find((l) => l.innerText.includes("subfolders"))
      ?.querySelector("input")
      ?.click(),
  );
  await settle(manager);
  check(
    "including subfolders brings in their bookmarks",
    (await manager.$$("article")).length === 3,
  );
  check(
    "and the tick box is then partly ticked",
    (await headTick(manager)).partial,
  );
  await shot(manager, "view-menu");
  const box = await manager.evaluate(() => {
    const r = document
      .querySelector("div[role=group][aria-label=View]")!
      .getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: innerWidth,
      height: innerHeight,
    };
  });
  check(
    "the menu fits in the window",
    box.left >= 0 && box.right <= box.width && box.bottom <= box.height,
    JSON.stringify(box),
  );
  await manager.mouse.click(5, 5);
  await sleep(200);
  check(
    "clicking elsewhere closes the menu",
    !(await manager.$('details[open]:has(summary[aria-label="View options"])')),
  );
  await manager.click("main > header input[type=checkbox]");
  await sleep(300);
  check(
    "ticking again picks everything, subfolders included",
    (await selectedCount(manager)) === 3,
  );
  await manager.click("main > header input[type=checkbox]");
  await sleep(300);
  check(
    "and once more puts everything down",
    (await selectedCount(manager)) === 0,
  );

  // 2. Sections by subfolder, with a tick box for each.
  await menu(manager);
  await choose(manager, "Split into sections by", "folder");
  const byFolder = await heads(manager);
  check(
    "sections follow the subfolders, named from the open folder down",
    byFolder.join("|") === [root, "Recipes", "Recipes / Baking"].join("|"),
    byFolder.join(" | "),
  );
  check(
    "each section has a rule under its subheading",
    await manager.evaluate(
      () =>
        getComputedStyle(document.querySelector("section header")!)
          .borderBottomWidth === "1px",
    ),
  );
  await manager.mouse.click(5, 5);
  await manager.hover("section header");
  await sleep(250);
  await shot(manager, "sections-by-subfolder");
  await manager.click("section:nth-of-type(2) header input");
  await sleep(300);
  check(
    "a section tick box picks only that section",
    (await selectedCount(manager)) === 1,
  );
  await manager.click("section:nth-of-type(2) header input");

  // The choice belongs to the folder, so another place keeps its own view.
  await open(manager, "All bookmarks");
  await sleep(400);
  check(
    "another list has its own sections setting",
    (await heads(manager)).length === 0,
  );
  await open(manager, "Imported");
  await sleep(400);
  check(
    "the folder remembers its sections",
    (await heads(manager)).length === 3,
  );

  // 3. The other ways to split a list.
  await open(manager, "All bookmarks");
  await sleep(400);
  await menu(manager);
  for (const [value, expected] of [
    ["folder", [root, `${root} / Recipes`, `${root} / Recipes / Baking`]],
    ["title", ["D", "P", "S"]],
    ["website", ["bread.test", "news.test", "pasta.test"]],
  ] as const) {
    await choose(manager, "Split into sections by", value);
    const got = await heads(manager);
    check(
      `sections by ${value}`,
      got.join("|") === expected.join("|"),
      got.join(" | "),
    );
  }
  // The imported bookmarks carry the dates they were bookmarked with, so they land in an older month.
  await choose(manager, "Split into sections by", "added");
  const added = await heads(manager);
  check(
    "sections by date added: months, newest first",
    added.length === 2 && added[1] === "November 2023",
    added.join(" | "),
  );
  await choose(manager, "Split into sections by", "edited");
  const edited = await heads(manager);
  check(
    "sections by date edited",
    edited.length >= 1 && edited.every((h) => /\d{4}/.test(h)),
    edited.join(" | "),
  );
  await choose(manager, "Split into sections by", "website");
  await manager.mouse.click(5, 5);
  const summary = await text(manager);
  check(
    "a summary line says how the list is ordered and split",
    summary.includes("sections by website") &&
      /Date added, newest first/.test(summary),
  );
  await shot(manager, "sections-by-website");

  // 4. Every layout draws the sections, and the toolbar holds together at a narrow width.
  for (const layout of ["Grid", "Headlines", "Masonry", "List"]) {
    await manager.click(`button[aria-label="${layout}"]`);
    await sleep(300);
    check(`${layout} draws the sections`, (await heads(manager)).length === 3);
  }
  await manager.setViewport({ width: 700, height: 800 });
  await sleep(300);
  const narrow = await manager.evaluate(() => {
    const bar = document
      .querySelector("[role=toolbar][aria-label=View]")!
      .getBoundingClientRect();
    return { right: bar.right, width: innerWidth };
  });
  check(
    "the toolbar stays inside a narrow window",
    narrow.right <= narrow.width,
    JSON.stringify(narrow),
  );
  await shot(manager, "narrow");
  await manager.setViewport({ width: 1280, height: 800 });
} catch (e) {
  check("the run finished", false, String(e).slice(0, 400));
} finally {
  await finish();
}
