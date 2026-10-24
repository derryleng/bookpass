// End to end check of the Firefox build with the real helper.
//
//   node tests/e2e/firefox.ts
//
// A script cannot press Firefox's toolbar button or navigate to an extension page, so this uses a build made just
// for it (WXT_E2E=1, in tests/output/build): that build opens its manager when installed, can read any tab, and
// its popup can be opened in a tab with ?tab=<id>. Everything else is the real extension.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  keepassxcCli,
  password,
  root,
  sleep,
  startFirefoxSession,
} from "./lib.ts";

execFileSync(
  process.execPath,
  [join(root, "node_modules/wxt/bin/wxt.mjs"), "build", "-b", "firefox"],
  {
    env: { ...process.env, WXT_E2E: "1" },
    stdio: "ignore",
  },
);

const {
  browser,
  site,
  vaultPath,
  check,
  openPage,
  text,
  hasText,
  click,
  type,
  shot,
  finish,
} = await startFirefoxSession("firefox");

try {
  const manager = await openPage("manager.html");
  check(
    "first run asks to create a vault",
    await hasText(manager, "Create your vault", 15000),
  );
  await shot(manager, "01-create");
  await type(manager, "input[type=password]", password);
  await (await manager.$$("input[type=password]"))[1]!.type(password);
  await click(manager, "button", "Create vault");
  check(
    "vault is created and the manager opens",
    await hasText(manager, "All bookmarks", 30000),
  );

  // A bookmark added by hand.
  await click(manager, "button", "Add bookmark");
  await manager.waitForSelector("dialog[open] input[type=url]");
  await manager.type(
    "dialog[open] input[type=url]",
    "https://example.org/firefox",
  );
  await manager.type("dialog[open] input:not([type])", "Added in Firefox");
  await click(manager, "dialog button", "Save");
  check("a bookmark can be added", await hasText(manager, "Added in Firefox"));
  await hasText(manager, "Saved", 15000);

  // The popup, on a page in another window, so that the screenshot fallback has something to look at.
  async function saveFromPopup(path: string, title: string) {
    const tabId = await manager.evaluate(async (url) => {
      const win = await chrome.windows.create({ url, focused: false });
      return win!.tabs![0]!.id!;
    }, `${site}${path}`);
    await sleep(2000);
    const popup = await openPage(`popup.html?tab=${tabId}`);
    const read = await popup
      .waitForFunction(
        (title) =>
          (document.querySelector("input.input") as HTMLInputElement | null)
            ?.value === title,
        { timeout: 20000 },
        title,
      )
      .then(
        () => true,
        () => false,
      );
    await sleep(800);
    await shot(popup, `02-popup${path.replace(/\W/g, "-")}`);
    await click(popup, "button", "Save bookmark");
    await sleep(2500);
    await popup.close().catch(() => {});
    return read;
  }
  check(
    "the popup reads a page with a declared cover",
    await saveFromPopup("/article", "A fine article about Rust"),
  );
  check(
    "the popup reads a plain page",
    await saveFromPopup("/plain", "Plain page"),
  );

  await sleep(1000);
  check(
    "saved pages appear in the manager",
    (await text(manager)).includes("A fine article about Rust") &&
      (await text(manager)).includes("Plain page"),
  );
  const covers = await manager.$$eval(
    ".bm-cover",
    (els) =>
      els.filter((e) =>
        (e as HTMLElement).style.backgroundImage.startsWith("url("),
      ).length,
  );
  check(
    "both saved pages have a cover picture",
    covers === 2,
    `${covers} covers`,
  );
  check(
    "the declared site icon was saved and shown",
    (await manager.$$eval("img.favicon", (els) => els.length)) >= 1,
  );
  await shot(manager, "03-list");

  // Locking.
  await click(manager, "button", "Lock");
  check(
    "lock shows the unlock screen",
    await hasText(manager, "Unlock BookPass"),
  );
  await type(manager, "input[type=password]", "not the password");
  await click(manager, "button", "Unlock");
  check(
    "a wrong password is refused",
    await hasText(manager, "Wrong master password"),
  );
  await manager.evaluate(() =>
    document.querySelector<HTMLInputElement>("input[type=password]")!.select(),
  );
  await type(manager, "input[type=password]", password);
  await click(manager, "button", "Unlock");
  check(
    "the right password unlocks",
    await hasText(manager, "Added in Firefox", 30000),
  );

  // Settings and where the key is kept.
  await click(manager, "button", "Settings");
  await hasText(manager, "Locking");
  const keyIn = (area: "session" | "local") =>
    manager.evaluate(
      async (area) => !!(await chrome.storage[area].get("unlockKey")).unlockKey,
      area,
    );
  check(
    "the unlock key is in memory only by default",
    (await keyIn("session")) && !(await keyIn("local")),
  );
  const pick = async (label: string) => {
    await manager.evaluate(
      (label) =>
        [...document.querySelectorAll<HTMLElement>(".radio-card")]
          .find((e) => e.innerText.includes(label))
          ?.click(),
      label,
    );
    await sleep(700);
  };
  await pick("Never");
  check('"never" keeps the key on disk too', await keyIn("local"));
  await pick("When the browser closes");
  check('leaving "never" removes it again', !(await keyIn("local")));
  await shot(manager, "04-settings");

  // The vault the browser wrote opens in KeePassXC.
  await sleep(2500);
  // A Snap Firefox starts the helper through a portal with a clean environment, so the vault lands in the default
  // place instead of the throwaway one.
  const defaultVault = join(homedir(), ".bookpass", "bookmarks.kdbx");
  const written = existsSync(vaultPath) ? vaultPath : defaultVault;
  try {
    const listing = execFileSync(keepassxcCli, ["ls", "-q", "-R", written], {
      input: password + "\n",
      encoding: "utf8",
    });
    check(
      "KeePassXC opens the vault written from Firefox",
      listing.includes("Added in Firefox") && listing.includes("Plain page"),
    );
  } catch (e) {
    check(
      "KeePassXC opens the vault written from Firefox",
      false,
      String(e).slice(0, 200),
    );
  }
  void browser;
} catch (e) {
  check("the run finished without an error", false, String(e).slice(0, 400));
}
await finish();
