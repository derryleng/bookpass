// End to end check of the built Chrome extension with the real helper, on Windows.
//
//   npm run build && (cd helper && go build -o bin/bookpass-helper.exe .) && node scripts/e2e.ts
//
// It uses a throwaway browser profile and a throwaway vault, and writes screenshots to e2e-out/.
// The helper is registered for the current user first (the same step as scripts/register-helper.ts).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';

const root = resolve(import.meta.dirname, '..');
const shots = join(root, 'e2e-out');
rmSync(shots, { recursive: true, force: true });
mkdirSync(shots, { recursive: true });

const work = mkdtempSync(join(tmpdir(), 'bookpass-e2e-'));
const vaultPath = join(work, 'vault', 'bookmarks.kdbx');
const password = 'correct horse battery staple';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

// A small site to save pages from: one page with a declared cover and icon, one without.
const art = (a: string, b: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="600" cy="315" r="170" fill="rgba(255,255,255,.35)"/></svg>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="#e5484d"/><text x="32" y="44" font-size="34" text-anchor="middle" fill="#fff" font-family="sans-serif">R</text></svg>`;
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

execFileSync('node', [join(root, 'scripts/register-helper.ts')], { stdio: 'ignore' });

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let extension = undefined as Awaited<ReturnType<typeof browser.extensions>> extends Map<
  string,
  infer E
>
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
const shot = (page: Page, name: string) => page.screenshot({ path: join(shots, `${name}.png`) });

try {
  // 1. First run: create the vault.
  const manager = await openPage('manager.html');
  check('first run asks to create a vault', await hasText(manager, 'Create your vault'));
  await shot(manager, '01-create');
  await type(manager, 'input[type=password]', password);
  const fields = await manager.$$('input[type=password]');
  await fields[1]!.type(password);
  await click(manager, 'button', 'Create vault');
  check('vault is created and the manager opens', await hasText(manager, 'All bookmarks', 15000));
  await shot(manager, '02-empty');

  // 2. Folders.
  await click(manager, 'button', 'New folder');
  await manager.waitForSelector('dialog[open] input');
  await manager.type('dialog[open] input', 'Reading');
  await manager.evaluate(() =>
    document.querySelector<HTMLButtonElement>('button[aria-label="book"]')?.click(),
  );
  await manager.evaluate(() =>
    document
      .querySelector<HTMLButtonElement>('dialog button[type=submit], dialog button.primary')
      ?.click(),
  );
  check(
    'a folder can be created',
    await until(
      manager,
      'folder',
      () => !!document.querySelector('.tree-row') && document.body.innerText.includes('Reading'),
    ),
  );

  // 3. Save a page from the popup, which is how it is used.
  const articleTab = await browser.newPage();
  await articleTab.goto(`${site}/article`);
  await articleTab.bringToFront();
  await extension.triggerAction(articleTab);
  await sleep(1500);
  const popup = (await extension.pages()).find((p) => p.url().endsWith('popup.html'));
  check('the popup opens from the toolbar button', !!popup);
  if (popup) {
    check(
      'the popup reads the page title',
      await until(
        popup,
        'title',
        () =>
          (document.querySelector('input.input') as HTMLInputElement | null)?.value ===
          'A fine article about Rust',
        15000,
      ),
    );
    await sleep(500);
    await shot(popup, '03-popup');
    await popup.evaluate(() => {
      const select = document.querySelector<HTMLSelectElement>('.popup select')!;
      select.value = [...select.options].find((o) => o.text.includes('Reading'))!.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(popup, 'button', 'Save bookmark');
    await sleep(2500);
  }

  // 4. A page with no declared cover gets a screenshot.
  const plainTab = await browser.newPage();
  await plainTab.goto(`${site}/plain`);
  await plainTab.bringToFront();
  await extension.triggerAction(plainTab);
  await sleep(1500);
  const popup2 = (await extension.pages()).find(
    (p) => p.url().endsWith('popup.html') && p !== popup,
  );
  if (popup2) {
    await until(
      popup2,
      'title',
      () =>
        (document.querySelector('input.input') as HTMLInputElement | null)?.value === 'Plain page',
      15000,
    );
    await sleep(800);
    await shot(popup2, '04-popup-screenshot-cover');
    await click(popup2, 'button', 'Save bookmark');
    await sleep(2500);
  }

  // 5. The manager shows both, with covers and icons.
  await manager.bringToFront();
  const listed = await hasText(manager, 'A fine article about Rust');
  check(
    'saved bookmarks appear in the manager',
    listed && (await text(manager)).includes('Plain page'),
  );
  await sleep(1000);
  const covers = await manager.$$eval(
    '.bm-cover',
    (els) => els.filter((e) => (e as HTMLElement).style.backgroundImage.startsWith('url(')).length,
  );
  check('both bookmarks have a cover picture', covers === 2, `${covers} covers`);
  const iconsInList = await manager.$$eval('img.favicon', (els) => els.length);
  check('the declared site icon was saved and shown', iconsInList >= 1, `${iconsInList} icons`);
  await shot(manager, '05-list');
  for (const layout of ['Grid', 'Headlines', 'Masonry']) {
    await click(manager, 'button', layout);
    await sleep(500);
    await shot(manager, `06-${layout.toLowerCase()}`);
  }
  await click(manager, 'button', 'List');

  // 6. Search, favorites, edit.
  await manager.type('input[aria-label=Search]', 'rust');
  await sleep(400);
  check('search narrows the list', (await manager.$$eval('.bm', (e) => e.length)) === 1);
  await manager.click('input[aria-label=Search]', { count: 3 });
  await manager.keyboard.press('Backspace');

  // 7. Settings and locking.
  await click(manager, 'button', 'Settings');
  await hasText(manager, 'Locking');
  await shot(manager, '07-settings');
  await manager.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.radio-card')]
      .find((e) => e.innerText.includes('Every time'))
      ?.click(),
  );
  await sleep(500);
  const modeSaved = await manager.evaluate(() =>
    (
      document
        .querySelector('input[name=lock-mode]:checked')
        ?.closest('.radio-card') as HTMLElement | null
    )?.innerText.includes('Every time'),
  );
  check('the lock setting can be changed', !!modeSaved);
  await manager.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.radio-card')]
      .find((e) => e.innerText.includes('After a period'))
      ?.click(),
  );
  await sleep(500);
  await shot(manager, '08-settings-idle');
  await manager.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.radio-card')]
      .find((e) => e.innerText.includes('Every time'))
      ?.click(),
  );
  await sleep(500);

  // 7b. The unlock key stays in memory unless "never" is chosen, and a restarted background carries on.
  const keyIn = (area: 'session' | 'local') =>
    manager.evaluate(
      async (area) => !!(await chrome.storage[area].get('unlockKey')).unlockKey,
      area,
    );
  const pickMode = async (label: string) => {
    await manager.evaluate(
      (label) =>
        [...document.querySelectorAll<HTMLElement>('.radio-card')]
          .find((e) => e.innerText.includes(label))
          ?.click(),
      label,
    );
    await sleep(600);
  };
  await pickMode('When the browser closes');
  check(
    'the key is held in memory only by default',
    (await keyIn('session')) && !(await keyIn('local')),
  );
  const [worker] = await extension.workers();
  await worker?.close();
  await sleep(800);
  await manager.reload();
  check(
    'a restarted background reopens the vault without asking',
    await hasText(manager, 'All bookmarks', 15000),
  );
  await click(manager, 'button', 'Settings');
  await pickMode('Never');
  check(
    '"never" also keeps the key on disk, with a warning',
    (await keyIn('local')) && (await text(manager)).includes('Anyone who can read'),
  );
  await shot(manager, '07b-settings-never');
  await pickMode('When the browser closes');
  check(
    'leaving "never" removes the key from disk',
    !(await keyIn('local')) && (await keyIn('session')),
  );
  await pickMode('Every time');

  // 8. "Every time" mode: closing every page locks the vault.
  for (const p of await browser.pages())
    if (p.url().startsWith(base) || p.url().startsWith(site)) await p.close().catch(() => {});
  await sleep(5000);
  const again = await openPage('manager.html');
  check('closing BookPass locks it in every-time mode', await hasText(again, 'Unlock BookPass'));
  await shot(again, '09-locked');
  await type(again, 'input[type=password]', 'wrong password');
  await click(again, 'button', 'Unlock');
  check('a wrong password is refused', await hasText(again, 'Wrong master password'));
  await type(again, 'input[type=password]', password);
  await click(again, 'button', 'Unlock');
  check(
    'the right password unlocks and shows the bookmarks',
    await hasText(again, 'A fine article about Rust', 15000),
  );
} finally {
  await browser.close().catch(() => {});
  server.close();
  try {
    execFileSync('taskkill', ['/F', '/IM', 'bookpass-helper.exe'], { stdio: 'ignore' });
  } catch {
    /* none running */
  }
}

// 9. The file on disk opens in KeePassXC.
try {
  const listing = execFileSync(
    'C:/Program Files/KeePassXC/keepassxc-cli.exe',
    ['ls', '-q', '-R', vaultPath],
    { input: password + '\n', encoding: 'utf8' },
  );
  check(
    'KeePassXC opens the vault and lists the bookmarks',
    listing.includes('A fine article about Rust') && listing.includes('Reading/'),
    listing.replace(/\s+/g, ' ').slice(0, 120),
  );
} catch (e) {
  check('KeePassXC opens the vault', false, String(e).slice(0, 200));
}

console.log(
  failures
    ? `\n${failures} check(s) failed. Screenshots are in e2e-out/`
    : '\nAll checks passed. Screenshots are in e2e-out/',
);
process.exit(failures ? 1 : 0);
