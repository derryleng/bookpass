// End to end check of the built Chrome extension with the real helper, on Windows.
//
//   npm run build && npm run helper:build && node tests/e2e/core.ts
//
// It uses a throwaway browser profile and a throwaway vault, and writes screenshots to tests/output/core/.
import { execFileSync } from 'node:child_process';
import { keepassxcCli, password, sleep, startSession } from './lib.ts';

const {
  browser,
  extension,
  base,
  site,
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
} = await startSession('core');

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
} catch (e) {
  check('the run finished without an error', false, String(e).slice(0, 300));
}

// 9. The file on disk opens in KeePassXC.
try {
  const listing = execFileSync(keepassxcCli, ['ls', '-q', '-R', vaultPath], {
    input: password + '\n',
    encoding: 'utf8',
  });
  check(
    'KeePassXC opens the vault and lists the bookmarks',
    listing.includes('A fine article about Rust') && listing.includes('Reading/'),
    listing.replace(/\s+/g, ' ').slice(0, 120),
  );
} catch (e) {
  check('KeePassXC opens the vault', false, String(e).slice(0, 200));
}

await finish();
