// Shared set up for the end to end checks: a throwaway Chrome profile with the built extension and the real
// helper, a throwaway vault, and a small web site to save pages from. Windows only for now.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';

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

export async function startSession(name: string, options: { vaultPath?: string } = {}) {
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

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    pipe: true,
    enableExtensions: [join(root, '.output/chrome-mv3')],
    userDataDir: join(work, 'profile'),
    defaultViewport: { width: 1280, height: 800 },
    env: {
      ...process.env,
      BOOKPASS_CONFIG_DIR: join(work, 'config'),
      BOOKPASS_DEFAULT_VAULT: vaultPath,
    },
  });

  let extension: Awaited<ReturnType<typeof browser.extensions>> extends Map<string, infer E>
    ? E | undefined
    : never;
  for (let i = 0; i < 20 && !extension; i++) {
    extension = [...(await browser.extensions()).values()].find((e) => e.name === 'BookPass');
    if (!extension) await sleep(300);
  }
  if (!extension) throw new Error('The BookPass extension did not load');
  const base = `chrome-extension://${extension.id}`;

  async function openPage(path: string, width = 1280, height = 800): Promise<Page> {
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
  const shot = (page: Page, file: string) => page.screenshot({ path: join(shots, `${file}.png`) });

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
