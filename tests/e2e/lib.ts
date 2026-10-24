// Shared set up for the end to end checks: a throwaway Chrome profile with the built extension and the real
// helper, a throwaway vault, and a small web site to save pages from. Windows only for now.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import ids from '../../helper/ids.json' with { type: 'json' };

export const root = resolve(import.meta.dirname, '../..');
/** Everything a test run writes goes here, and it is ignored by git. */
export const outputDir = join(root, 'tests/output');
/** Files the tests read. */
export const fixtures = join(root, 'tests/fixtures');
export const password = 'correct horse battery staple';
/** Where the browsers and tools are. Set BOOKPASS_CHROME to use another Chrome or Chromium. */
export const chromePath =
  process.env.BOOKPASS_CHROME ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome');
export const firefoxPath =
  process.env.BOOKPASS_FIREFOX ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Mozilla Firefox\\firefox.exe'
    : process.platform === 'darwin'
      ? '/Applications/Firefox.app/Contents/MacOS/firefox'
      : '/usr/bin/firefox');
export const keepassxcCli =
  process.platform === 'win32' ? 'C:/Program Files/KeePassXC/keepassxc-cli.exe' : 'keepassxc-cli';

/** Stops any helper a browser left running, so a run starts and ends clean. */
export function killHelpers() {
  try {
    if (process.platform === 'win32')
      execFileSync('taskkill', ['/F', '/IM', 'bookpass-helper.exe'], { stdio: 'ignore' });
    else execFileSync('pkill', ['-f', 'bookpass-helper'], { stdio: 'ignore' });
  } catch {
    /* none running */
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A small site to save pages from: one page with a declared cover and icon, one without.
const art = (a: string, b: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="600" cy="315" r="170" fill="rgba(255,255,255,.35)"/></svg>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="#e5484d"/><text x="32" y="44" font-size="34" text-anchor="middle" fill="#fff" font-family="sans-serif">R</text></svg>`;

/** A Chrome session: the built extension in a throwaway Chrome profile, with the real helper. */
export async function startSession(name: string, options: { vaultPath?: string } = {}) {
  const session = await createSession(name, 'chrome', options);
  return { ...session, extension: session.extension! };
}

/** A Firefox session, using the end to end build (see tests/e2e/firefox.ts for why it is separate). */
export function startFirefoxSession(name: string) {
  return createSession(name, 'firefox', {});
}

async function createSession(
  name: string,
  kind: 'chrome' | 'firefox',
  options: { vaultPath?: string },
) {
  const shots = join(outputDir, name);
  rmSync(shots, { recursive: true, force: true });
  mkdirSync(shots, { recursive: true });

  mkdirSync(join(outputDir, 'work'), { recursive: true });
  const work = mkdtempSync(join(outputDir, 'work', 'run-'));
  const vaultPath = options.vaultPath ?? join(work, 'vault', 'bookmarks.kdbx');

  let failures = 0;
  const check = (what: string, ok: boolean, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
  };

  const server = createServer((req, res) => {
    const send = (type: string, body: string) => (
      res.writeHead(200, { 'content-type': type }),
      res.end(body)
    );
    if (req.url === '/cover.svg') return send('image/svg+xml', art('#3d5afe', '#12a594'));
    if (req.url === '/icon.svg') return send('image/svg+xml', icon);
    if (req.url === '/article') {
      return send(
        'text/html',
        `<!doctype html><html><head><title>A fine article about Rust</title>
         <meta name="description" content="Everything you wanted to know about ownership and borrowing.">
         <meta property="og:type" content="article"><meta property="og:image" content="/cover.svg">
         <link rel="icon" href="/icon.svg"></head><body style="font:20px sans-serif;padding:40px"><h1>Rust ownership</h1><p>Hello.</p></body></html>`,
      );
    }
    return send(
      'text/html',
      `<!doctype html><title>Plain page</title><body style="background:#fde68a;font:24px sans-serif;padding:40px"><h1>No cover image declared</h1>`,
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const site = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  // The same step an end user takes: the helper installs itself and registers with the browsers.
  execFileSync('node', [join(root, 'scripts/register-helper.ts')], { stdio: 'ignore' });

  // Windows finds the helper through the registry. On Linux and macOS Chrome looks in NativeMessagingHosts inside
  // the profile folder it was given, so a throwaway profile needs its own copy of the manifest.
  if (process.platform !== 'win32') {
    const installed =
      process.platform === 'darwin'
        ? join(homedir(), 'Library/Application Support/BookPass/bookpass-helper')
        : join(
            process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share'),
            'bookpass/bookpass-helper',
          );
    const hosts = join(work, 'profile', 'NativeMessagingHosts');
    mkdirSync(hosts, { recursive: true });
    writeFileSync(
      join(hosts, `${ids.hostName}.json`),
      JSON.stringify({
        name: ids.hostName,
        description: 'BookPass native helper',
        path: installed,
        type: 'stdio',
        allowed_origins: ids.chromeIds.map((id) => `chrome-extension://${id}/`),
      }),
    );
  }

  const env = {
    ...process.env,
    BOOKPASS_CONFIG_DIR: join(work, 'config'),
    BOOKPASS_DEFAULT_VAULT: vaultPath,
  };
  const browser =
    kind === 'chrome'
      ? await puppeteer.launch({
          executablePath: chromePath,
          headless: true,
          pipe: true,
          enableExtensions: [
            process.env.BOOKPASS_EXTENSION_DIR ?? join(root, '.output/chrome-mv3'),
          ],
          userDataDir: join(work, 'profile'),
          defaultViewport: { width: 1280, height: 800 },
          env,
        })
      : await puppeteer.launch({
          browser: 'firefox',
          executablePath: firefoxPath,
          headless: true,
          protocol: 'webDriverBiDi',
          // Without this Firefox will not let a script look inside an extension page.
          args: ['-remote-allow-system-access'],
          userDataDir: join(work, 'profile'),
          defaultViewport: { width: 1280, height: 800 },
          env,
        });

  // Firefox reports an extension page as about:blank, so its real address has to be asked of the page itself.
  const realUrl = (page: Page) => page.evaluate(() => location.href).catch(() => '');
  async function findPage(test: (url: string) => boolean): Promise<Page | undefined> {
    for (const page of await browser.pages()) if (test(await realUrl(page))) return page;
  }

  let extension: Awaited<ReturnType<typeof browser.extensions>> extends Map<string, infer E>
    ? E | undefined
    : never;
  let base = '';
  if (kind === 'chrome') {
    for (let i = 0; i < 20 && !extension; i++) {
      extension = [...(await browser.extensions()).values()].find((e) => e.name === 'BookPass');
      if (!extension) await sleep(300);
    }
    if (!extension) throw new Error('The BookPass extension did not load');
    base = `chrome-extension://${extension.id}`;
  } else {
    // Firefox cannot be sent to an extension page, so the end to end build opens its manager when it is installed.
    await browser.installExtension(join(outputDir, 'build/firefox-mv3'));
    for (let i = 0; i < 40 && !base; i++) {
      const found = await findPage((url) => url.includes('/manager.html'));
      if (found) {
        const href = await realUrl(found); // new URL() has no origin for this kind of address
        base = href.slice(0, href.indexOf('/', 'moz-extension://'.length));
      } else await sleep(300);
    }
    if (!base) throw new Error('The BookPass add-on did not open its manager');
  }

  async function openPage(path: string, width = 1280, height = 800): Promise<Page> {
    if (kind === 'firefox') {
      // Navigating to an extension page is refused, so reuse the one the add-on opened, or ask it to open one.
      const open = await findPage((url) => url === `${base}/${path}`);
      if (open) return open;
      const opener = (await findPage((url) => url.startsWith(base)))!;
      await opener.evaluate((url) => chrome.tabs.create({ url }), `${base}/${path}`);
      for (let i = 0; i < 30; i++) {
        const found = await findPage((url) => url === `${base}/${path}`);
        if (found) return found;
        await sleep(200);
      }
      throw new Error(`Firefox did not open ${path}`);
    }
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    page.on('pageerror', (e) => console.log('  page error:', (e as Error).message));
    await page.goto(`${base}/${path}`);
    return page;
  }
  const text = (page: Page) => page.evaluate(() => document.body.innerText);
  async function until(
    page: Page,
    what: string,
    test: () => boolean | Promise<boolean> | string,
    timeout = 8000,
  ) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await page.evaluate(test as () => boolean)) return true;
      await sleep(150);
    }
    console.log(`  timed out waiting for ${what}`);
    return false;
  }
  const hasText = (page: Page, needle: string, timeout?: number) =>
    until(
      page,
      needle,
      `document.body.innerText.includes(${JSON.stringify(needle)})` as never,
      timeout,
    );
  async function click(page: Page, selector: string, label: string) {
    await page.evaluate(
      (selector, label) => {
        const el = [...document.querySelectorAll<HTMLElement>(selector)].find(
          (e) =>
            e.innerText.trim() === label ||
            e.getAttribute('aria-label') === label ||
            e.title === label,
        );
        if (!el) throw new Error(`No ${selector} labelled ${label}`);
        el.click();
      },
      selector,
      label,
    );
  }
  async function type(page: Page, selector: string, value: string) {
    await page.click(selector);
    await page.keyboard.type(value);
  }
  // Firefox will not take a screenshot of an extension page, so there are none from there.
  const shot = async (page: Page, file: string) => {
    if (kind === 'firefox') return;
    await page.screenshot({ path: join(shots, `${file}.png`) });
  };

  /** Closes everything and exits with a summary. */
  async function finish(): Promise<never> {
    await browser.close().catch(() => {});
    server.close();
    killHelpers();
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    console.log(
      failures
        ? `\n${failures} check(s) failed. Screenshots are in tests/output/${name}/`
        : `\nAll checks passed. Screenshots are in tests/output/${name}/`,
    );
    process.exit(failures ? 1 : 0);
  }

  return {
    browser,
    extension,
    base,
    site,
    work,
    vaultPath,
    check,
    openPage,
    text,
    until,
    hasText,
    click,
    type,
    shot,
    finish,
  };
}
