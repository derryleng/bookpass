// A second end to end check, for the features beyond saving a page: key files, import, tags, drag and drop,
// changes made outside BookPass, sync conflict copies, history, backups and changing the password.
//
//   npm run build && npm run helper:build && node tests/e2e/features.ts
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ElementHandle, Page } from "puppeteer-core";
import {
  fixtures,
  keepassxcCli,
  password,
  sleep,
  startSession,
} from "./lib.ts";

const {
  browser,
  vaultPath,
  check,
  openPage,
  text,
  hasText,
  click,
  type,
  shot,
  finish,
} = await startSession("features");

const xc = keepassxcCli;
const keyFilePath = join(fixtures, "my.keyx");
const importPath = join(fixtures, "bookmarks.html");

const upload = async (page: Page, selector: string, file: string) => {
  const input = (await page.$(selector)) as ElementHandle<HTMLInputElement>;
  await input.uploadFile(file);
  await sleep(700); // the page reads the file asynchronously
};
/** Opens a place in the sidebar. The row also shows a count, so it is found by its start. */
const nav = (page: Page, label: string) =>
  page.evaluate(
    (label) =>
      [...document.querySelectorAll<HTMLElement>("nav button")]
        .find((e) => e.innerText.trim().startsWith(label))
        ?.click(),
    label,
  );
const mustHave = async (
  page: Page,
  needle: string,
  name: string,
  timeout = 15000,
) => check(name, await hasText(page, needle, timeout));

try {
  // 1. A vault with a key file.
  const manager = await openPage("manager.html");
  await hasText(manager, "Create your vault");
  await type(manager, "input[type=password]", password);
  await (await manager.$$("input[type=password]"))[1]!.type(password);
  await manager.waitForSelector("input[type=file]");
  await upload(manager, "input[type=file]", keyFilePath);
  await shot(manager, "01-create-with-key-file");
  await click(manager, "button", "Create vault");
  await mustHave(
    manager,
    "All bookmarks",
    "a vault can be created with a key file",
  );

  await click(manager, "button", "Lock");
  await hasText(manager, "Unlock BookPass");
  await type(manager, "input[type=password]", password);
  await click(manager, "button", "Unlock");
  await mustHave(
    manager,
    "Wrong master password or key file",
    "the password alone is not enough",
  );
  await type(manager, "input[type=password]", password);
  await manager.waitForSelector("input[type=file]");
  await upload(manager, "input[type=file]", keyFilePath);
  await click(manager, "button", "Unlock");
  await mustHave(
    manager,
    "All bookmarks",
    "the password and the key file unlock it",
  );
  try {
    const out = execFileSync(xc, ["ls", "-q", "-k", keyFilePath, vaultPath], {
      input: password + "\n",
      encoding: "utf8",
    });
    check("KeePassXC opens it with the same key file", typeof out === "string");
  } catch (e) {
    check(
      "KeePassXC opens it with the same key file",
      false,
      String(e).slice(0, 150),
    );
  }

  // 2. Import a bookmarks file.
  await click(manager, "summary", "Tools");
  await click(manager, "[role=menu] button", "Import bookmarks…");
  await manager.waitForSelector("dialog[open] input[type=file]");
  await upload(manager, "dialog[open] input[type=file]", importPath);
  await mustHave(
    manager,
    "3 bookmarks to import",
    "the import preview counts the bookmarks",
  );
  await shot(manager, "02-import");
  await click(manager, "dialog button", "Import");
  await mustHave(manager, "Imported 3 bookmarks", "the import runs");
  await click(manager, "dialog button", "Done");
  await sleep(500);
  const names = await text(manager);
  check(
    "the imported folders and tags appear",
    names.includes("Imported 20") &&
      names.includes("food") &&
      names.includes("quick"),
  );
  await shot(manager, "03-after-import");

  // 3. Tags.
  await click(manager, "button", "Manage tags");
  await manager.waitForSelector("dialog[open] ul");
  await click(manager, "dialog button", "Rename food");
  await manager.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>(
      'dialog[open] input[aria-label^="New name"]',
    )!;
    input.select();
  });
  await manager.keyboard.type("cooking");
  await manager.keyboard.press("Enter");
  await sleep(700);
  check("a tag can be renamed", (await text(manager)).includes("cooking"));
  await shot(manager, "04-tags");
  await manager.keyboard.press("Escape");

  // 4. History: edit a bookmark twice, then see the earlier version.
  await manager.evaluate(() =>
    (
      document.querySelector("nav [role=button]") as HTMLElement | null
    )?.click(),
  );
  await sleep(500);
  await manager
    .click("article button[aria-label=Edit]", { delay: 50 })
    .catch(async () => {
      await manager.evaluate(() =>
        document
          .querySelector<HTMLButtonElement>("article button[aria-label=Edit]")
          ?.click(),
      );
    });
  await manager.waitForSelector("dialog[open] input:not([type])");
  await manager.evaluate(() => {
    const title = document.querySelectorAll<HTMLInputElement>(
      "dialog[open] input:not([type])",
    )[0]!;
    title.focus();
    title.select();
  });
  await manager.keyboard.type("Pasta, edited");
  await click(manager, "dialog button", "Save");
  await sleep(1200);
  await manager.evaluate(() =>
    document
      .querySelector<HTMLButtonElement>("article button[aria-label=Edit]")
      ?.click(),
  );
  await manager.waitForSelector("dialog[open] details");
  await manager.evaluate(() =>
    document
      .querySelector<HTMLElement>("dialog[open] details summary")
      ?.click(),
  );
  await mustHave(
    manager,
    "Restore",
    "an edited bookmark keeps its earlier version",
  );
  await shot(manager, "05-history");
  await manager.keyboard.press("Escape");

  // 5. Drag a bookmark onto Unsorted, which takes it out of its folder.
  await nav(manager, "All bookmarks");
  await sleep(500);
  const dragged = await manager.evaluate(async () => {
    const item = [...document.querySelectorAll<HTMLElement>("article")].find(
      (b) => b.innerText.includes("Pasta, edited"),
    );
    const target = [
      ...document.querySelectorAll<HTMLElement>("nav button"),
    ].find((r) => r.innerText.trim().startsWith("Unsorted"));
    if (!item || !target) return false;
    const data = new DataTransfer();
    const fire = (el: HTMLElement, type: string) =>
      el.dispatchEvent(
        new DragEvent(type, {
          dataTransfer: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    fire(item, "dragstart");
    fire(target, "dragover");
    fire(target, "drop");
    await new Promise((r) => setTimeout(r, 800));
    return true;
  });
  await nav(manager, "Unsorted");
  await sleep(600);
  check(
    "dragging a bookmark onto Unsorted moves it there",
    dragged && (await text(manager)).includes("Pasta, edited"),
    `dropped: ${dragged}, page: ${(await text(manager)).replace(/\s+/g, " ").slice(0, 160)}`,
  );

  // 6. The file is changed outside BookPass (as KeePassXC or a sync tool would).
  await sleep(2500); // let BookPass finish saving
  execFileSync(
    xc,
    [
      "add",
      "-q",
      "-k",
      keyFilePath,
      vaultPath,
      "--url",
      "https://outside.test/",
      "Added by KeePassXC",
    ],
    {
      input: password + "\n",
    },
  );
  await nav(manager, "All bookmarks");
  await manager.evaluate(() => dispatchEvent(new Event("focus")));
  await mustHave(
    manager,
    "Added by KeePassXC",
    "a change made outside BookPass appears by itself",
    20000,
  );

  // 7. A sync tool leaves a conflict copy.
  const copy = join(
    dirname(vaultPath),
    "bookmarks.sync-conflict-20260101-120000-ABCDEFG.kdbx",
  );
  copyFileSync(vaultPath, copy);
  execFileSync(
    xc,
    [
      "add",
      "-q",
      "-k",
      keyFilePath,
      copy,
      "--url",
      "https://other-computer.test/",
      "Saved on the other computer",
    ],
    {
      input: password + "\n",
    },
  );
  await manager.evaluate(() => dispatchEvent(new Event("focus")));
  await manager.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: "checkFile", payload: undefined });
  });
  await mustHave(
    manager,
    "Conflicting vault copy",
    "a sync conflict copy is noticed",
  );
  await shot(manager, "06-conflict-copy");
  await click(manager, "button", "Merge");
  await mustHave(
    manager,
    "Saved on the other computer",
    "merging brings in the other computer's bookmark",
    20000,
  );
  check(
    "the merged copy is moved out of the way",
    !readdirSync(dirname(vaultPath)).includes(copy.split(/[\\/]/).pop()!),
  );

  // 8. Backups and changing the password.
  await click(manager, "button", "Settings");
  await mustHave(manager, "Backups", "the settings list backups");
  const backupRows = await manager.$$eval(
    "section:has(h2) ul li",
    (els) => els.length,
  );
  check("the helper has kept backups", backupRows > 0, `${backupRows} backups`);
  await shot(manager, "07-settings-more");

  const inputs = await manager.$$("form input[type=password]");
  await inputs[0]!.type(password);
  await inputs[1]!.type("a brand new password");
  await inputs[2]!.type("a brand new password");
  await click(manager, "button", "Change password");
  await mustHave(
    manager,
    "Master password changed",
    "the master password can be changed",
  );
  await sleep(2500);
  await click(manager, "button", "Lock");
  await hasText(manager, "Unlock BookPass");
  await type(manager, "input[type=password]", password);
  await manager.waitForSelector("input[type=file]");
  await upload(manager, "input[type=file]", keyFilePath);
  await click(manager, "button", "Unlock");
  await mustHave(
    manager,
    "Wrong master password",
    "the old password no longer works",
  );
  await manager.evaluate(() =>
    document.querySelector<HTMLInputElement>("input[type=password]")!.select(),
  );
  await manager.keyboard.type("a brand new password");
  await click(manager, "button", "Unlock");
  await mustHave(manager, "All bookmarks", "the new password works");
} catch (e) {
  check("the run finished without an error", false, String(e).slice(0, 400));
  const pages = await browser.pages();
  const last = pages[pages.length - 1];
  if (last) await shot(last, "99-failure").catch(() => {});
}

if (existsSync(vaultPath)) {
  try {
    const out = execFileSync(
      xc,
      ["ls", "-q", "-R", "-k", keyFilePath, vaultPath],
      {
        input: "a brand new password\n",
        encoding: "utf8",
      },
    );
    check(
      "KeePassXC opens the final vault with the new password",
      out.includes("Pasta, edited"),
      out.replace(/\s+/g, " ").slice(0, 200),
    );
  } catch (e) {
    check(
      "KeePassXC opens the final vault with the new password",
      false,
      String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 300),
    );
  }
}
await finish();
