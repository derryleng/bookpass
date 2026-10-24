// Security checks on the built Chrome extension with the real helper: what is stored where, what leaves the
// browser, who may talk to the helper, and what the manifest asks for.
//
//   npm run build && npm run helper:build && node tests/e2e/security.ts
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { CDPSession, Page } from "puppeteer-core";
import { password, root, sleep, startSession } from "./lib.ts";

const {
  browser,
  extension,
  site,
  work,
  vaultPath,
  check,
  openPage,
  hasText,
  click,
  type,
  finish,
} = await startSession("security");

const SECRET = "SECRET-TITLE-8f3a";
const NOTE = "SECRET-NOTE-51c2";

// Everything the extension itself asks the network for. Pages of the sites being saved are not counted.
const external: string[] = [];
const isLocal = (url: string) =>
  /^(chrome-extension|data|blob|chrome|about):/.test(url);
function watch(page: Page) {
  page.on("request", (request) => {
    if (!isLocal(request.url()))
      external.push(`${page.url().split("/").pop()}: ${request.url()}`);
  });
}
const background = async () => {
  const worker = (await extension.workers())[0];
  return worker;
};

try {
  const manager = await openPage("manager.html");
  watch(manager);
  await hasText(manager, "Create your vault");
  await type(manager, "input[type=password]", password);
  await (await manager.$$("input[type=password]"))[1]!.type(password);
  await click(manager, "button", "Create vault");
  await hasText(manager, "All bookmarks", 15000);

  // A network log for the background too.
  const worker = await background();
  let backgroundSession: CDPSession | undefined;
  const target = browser
    .targets()
    .find(
      (t) => t.type() === "service_worker" && t.url().includes(extension.id),
    );
  if (target) {
    backgroundSession = await target.createCDPSession();
    backgroundSession.on(
      "Network.requestWillBeSent",
      (e: { request: { url: string } }) => {
        if (!isLocal(e.request.url))
          external.push(`background: ${e.request.url}`);
      },
    );
    await backgroundSession.send("Network.enable");
  }

  await click(manager, "button", "Add bookmark");
  await manager.waitForSelector("dialog[open] input[type=url]");
  await manager.type(
    "dialog[open] input[type=url]",
    "https://secret-site.example/path",
  );
  await manager.type("dialog[open] input:not([type])", SECRET);
  await manager.type("dialog[open] textarea", NOTE);
  await click(manager, "dialog button", "Save");
  await hasText(manager, SECRET);

  const article = await browser.newPage();
  await article.goto(`${site}/article`);
  await article.bringToFront();
  await extension.triggerAction(article);
  await sleep(2500);
  const popup = (await extension.pages()).find((p) =>
    p.url().endsWith("popup.html"),
  );
  if (popup) {
    watch(popup);
    await sleep(1500);
    await click(popup, "button", "Save bookmark");
    await sleep(2500);
  }
  await manager.bringToFront();
  await sleep(2500); // let the save finish

  // 1. What the browser keeps on disk and in memory for the extension.
  const stores = await manager.evaluate(async () => {
    const local = await chrome.storage.local.get(null);
    const session = await chrome.storage.session.get(null);
    return {
      local,
      session,
      localStorage: { ...localStorage },
      databases: (await indexedDB.databases()).map((d) => d.name),
      caches: await caches.keys(),
    };
  });
  const everything = JSON.stringify(stores);
  check(
    "no bookmark text is kept in browser storage",
    !everything.includes(SECRET) &&
      !everything.includes(NOTE) &&
      !everything.includes("secret-site") &&
      !everything.includes("A fine article"),
  );
  check(
    "local storage holds nothing but the settings by default",
    Object.keys(stores.local).every((key) => key === "settings"),
    Object.keys(stores.local).join(),
  );
  check(
    "session storage holds only the unlock key and the last activity time",
    Object.keys(stores.session).sort().join() === "lastActivity,unlockKey",
    Object.keys(stores.session).join(),
  );
  check(
    "the unlock key is a hash, not the password",
    typeof stores.session.unlockKey === "string" &&
      !stores.session.unlockKey.includes(password) &&
      stores.session.unlockKey.length === 44,
  );
  check(
    "no database or cache is created",
    stores.databases.length === 0 && stores.caches.length === 0,
  );
  const swStores = await worker?.evaluate(async () => ({
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
  }));
  check(
    "the background keeps no database or cache either",
    swStores?.databases === 0 && swStores?.caches === 0,
  );

  // 2. The vault file reveals nothing without the password.
  const file = readFileSync(vaultPath);
  check(
    "the vault file contains no readable bookmark text",
    !file.includes(SECRET) &&
      !file.includes("secret-site") &&
      !file.includes(NOTE),
  );
  check(
    "the vault file contains no plain page title either",
    !file.includes("A fine article"),
  );
  const leftovers = readdirSync(join(vaultPath, "..")).filter((n) =>
    n.endsWith(".tmp"),
  );
  check(
    "no temporary file is left next to the vault",
    leftovers.length === 0,
    leftovers.join(),
  );
  const configPath = join(work, "config", "config.json");
  const config = existsSync(configPath)
    ? readFileSync(configPath, "utf8")
    : "{}";
  check(
    "the helper config holds no secret",
    !config.includes(password) && !config.includes(SECRET),
  );

  // 3. Nothing leaves the browser.
  await sleep(500);
  check(
    "the extension made no network requests",
    external.length === 0,
    external.slice(0, 3).join(" | "),
  );

  // 4. Another extension cannot use the helper.
  const rogue = join(work, "rogue");
  mkdirSync(rogue, { recursive: true });
  writeFileSync(
    join(rogue, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Rogue",
      version: "1",
      permissions: ["nativeMessaging", "storage"],
      background: { service_worker: "sw.js" },
    }),
  );
  writeFileSync(
    join(rogue, "sw.js"),
    `const port = chrome.runtime.connectNative('com.bookpass.helper');
     port.onDisconnect.addListener(() => chrome.storage.local.set({ result: chrome.runtime.lastError?.message ?? 'closed' }));
     port.onMessage.addListener(() => chrome.storage.local.set({ result: 'ANSWERED' }));
     port.postMessage({ id: 1, op: 'hello' });`,
  );
  await browser.installExtension(rogue);
  await sleep(3000);
  const rogueWorker = [...(await browser.extensions()).values()].find(
    (e) => e.name === "Rogue",
  );
  const result = await (
    await rogueWorker?.workers()
  )?.[0]?.evaluate(
    async () => (await chrome.storage.local.get("result")).result,
  );
  check(
    "a different extension is refused by the helper",
    typeof result === "string" &&
      /forbidden/i.test(result) &&
      result !== "ANSWERED",
    String(result),
  );

  // 5. The manifest.
  const manifest = JSON.parse(
    readFileSync(join(root, ".output/chrome-mv3/manifest.json"), "utf8"),
  ) as {
    permissions: string[];
    optional_permissions: string[];
    optional_host_permissions?: string[];
    host_permissions?: string[];
    content_security_policy: { extension_pages: string };
    content_scripts?: unknown;
  };
  check(
    "no site access is held, and the only one that can be asked for is all sites",
    !manifest.host_permissions &&
      !manifest.content_scripts &&
      (manifest.optional_host_permissions ?? []).join() === "*://*/*" &&
      !manifest.permissions.some(
        (p) => p.includes("://") || p === "<all_urls>",
      ),
  );
  check(
    "the permissions are the expected ones",
    manifest.permissions.slice().sort().join() ===
      [
        "activeTab",
        "alarms",
        "contextMenus",
        "idle",
        "nativeMessaging",
        "scripting",
        "storage",
      ].join(),
    manifest.permissions.join(),
  );
  check(
    "only tabs and bookmarks are optional",
    manifest.optional_permissions.slice().sort().join() === "bookmarks,tabs",
  );
  const csp = manifest.content_security_policy.extension_pages;
  check(
    "the content security policy allows no eval or remote code",
    !/(^|[^-])unsafe-eval|unsafe-inline|https?:/.test(csp) &&
      /wasm-unsafe-eval/.test(csp),
    csp,
  );
} catch (e) {
  check("the run finished without an error", false, String(e).slice(0, 300));
}
await finish();
