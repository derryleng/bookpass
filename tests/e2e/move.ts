// Moving the vault to another folder: the path is checked before anything moves, a folder that does not exist yet is
// created, the folder dialog (stood in for by a file the test writes, see BOOKPASS_TEST_PICK in helper/picker.go) fills
// in the folder, a typed path is the fallback when there is no dialog, and the vault arrives intact and keeps saving.
//
//   npm run build && npm run helper:build && node tests/e2e/move.ts
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'puppeteer-core';
import { keepassxcCli, password, sleep, startSession } from './lib.ts';

const { work, vaultPath, check, openPage, text, hasText, click, type, shot, finish } =
  await startSession('move');

const answer = join(work, 'pick-answer.txt');
const dialogText = (page: Page) =>
  page.evaluate(() => document.querySelector('dialog[open]')?.textContent ?? '');
const setField = async (page: Page, label: string, value: string) => {
  await page.evaluate((label) => {
    const field = [...document.querySelectorAll('dialog[open] label.field')].find((l) =>
      (l as HTMLElement).innerText.startsWith(label),
    )!;
    const input = field.querySelector('input')!;
    input.focus();
    input.select();
  }, label);
  if (value) await page.keyboard.type(value);
  else await page.keyboard.press('Backspace');
  await sleep(700); // the check waits for typing to pause
};
const moveButton = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find((b) =>
        b.innerText.includes('Move vault'),
      )?.disabled,
  );

try {
  const manager = await openPage('manager.html');
  await hasText(manager, 'Create your vault');
  await type(manager, 'input[type=password]', password);
  await (await manager.$$('input[type=password]'))[1]!.type(password);
  await click(manager, 'button', 'Create vault');
  await hasText(manager, 'All bookmarks', 15000);
  for (const [url, title] of [
    ['https://one.test/', 'First'],
    ['https://two.test/', 'Second'],
  ] as const) {
    await click(manager, 'button', 'Add bookmark');
    await manager.waitForSelector('dialog[open] input[type=url]');
    await manager.type('dialog[open] input[type=url]', url);
    await manager.type('dialog[open] input:not([type])', title);
    await click(manager, 'dialog button', 'Save');
    await sleep(2200); // saves are batched, so each one writes the file and leaves a backup
  }

  const settings = await openPage('options.html');
  await hasText(settings, 'Vault file');
  await click(settings, 'button', 'Move vault…');
  await settings.waitForSelector('dialog[open] label.field');
  await shot(settings, 'move-open');

  // Typed paths are checked before anything moves.
  const base = join(work, 'elsewhere');
  await setField(settings, 'File name', 'vault.txt');
  await setField(settings, 'New folder', join(base, 'deep', 'er'));
  check(
    'a file name that does not end in .kdbx is refused',
    (await dialogText(settings)).includes('must end in .kdbx') &&
      (await moveButton(settings)) === true,
  );
  await setField(settings, 'File name', 'moved.kdbx');
  check(
    'a folder that does not exist yet is accepted and said to be created',
    (await dialogText(settings)).includes('will be created') &&
      (await moveButton(settings)) === false,
  );
  await shot(settings, 'move-checked');
  check('checking changes nothing on disk', !existsSync(base));
  await setField(settings, 'New folder', '');
  check('with no folder there is nothing to move', (await moveButton(settings)) === true);

  // The folder dialog fills in the folder, or is closed, or does not exist.
  const picked = join(work, 'picked folder');
  writeFileSync(answer, picked);
  await click(settings, 'dialog button', 'Browse…');
  await sleep(500);
  check(
    'the folder dialog fills in the folder',
    await settings.evaluate(
      (picked) =>
        [...document.querySelectorAll<HTMLInputElement>('dialog[open] input')].some(
          (i) => i.value === picked,
        ),
      picked,
    ),
  );
  writeFileSync(answer, '');
  await click(settings, 'dialog button', 'Browse…');
  await sleep(500);
  check(
    'closing the folder dialog keeps the folder',
    await settings.evaluate(
      (picked) =>
        [...document.querySelectorAll<HTMLInputElement>('dialog[open] input')].some(
          (i) => i.value === picked,
        ),
      picked,
    ),
  );
  writeFileSync(answer, 'unavailable');
  await click(settings, 'dialog button', 'Browse…');
  await hasText(settings, 'no folder dialog', 5000);
  check(
    'without a folder dialog the person is asked to type the path',
    !(await settings.evaluate(() =>
      [...document.querySelectorAll('dialog[open] button')].some((b) =>
        (b as HTMLElement).innerText.includes('Browse'),
      ),
    )),
  );
  await shot(settings, 'move-no-dialog');

  // The move itself.
  const target = join(picked, 'moved.kdbx');
  await hasText(settings, 'will be created', 5000);
  await click(settings, 'dialog button', 'Move vault');
  await settings.waitForFunction(() => !document.querySelector('dialog[open]'), { timeout: 15000 });
  check('the vault file is at the new place', existsSync(target));
  check('and no longer at the old one', !existsSync(vaultPath));
  const backups = existsSync(join(picked, 'backups')) ? readdirSync(join(picked, 'backups')) : [];
  check(
    'the backups came along, named after the new file',
    backups.length > 0 && backups.every((b) => b.startsWith('moved-')),
    `${backups.length} backups`,
  );
  check('the settings show the new path', (await text(settings)).includes(target));

  // Still unlocked, and the next save lands at the new place.
  await manager.reload();
  check('the vault stays unlocked', await hasText(manager, 'All bookmarks', 15000));
  await click(manager, 'button', 'Add bookmark');
  await manager.waitForSelector('dialog[open] input[type=url]');
  await manager.type('dialog[open] input[type=url]', 'https://three.test/');
  await manager.type('dialog[open] input:not([type])', 'Third');
  await click(manager, 'dialog button', 'Save');
  await sleep(2500);
  try {
    const out = execFileSync(keepassxcCli, ['ls', '-q', '-R', target], {
      input: password + '\n',
      encoding: 'utf8',
    });
    check(
      'KeePassXC opens the moved vault, with a bookmark saved after the move',
      out.includes('First') && out.includes('Third'),
      out.replace(/\s+/g, ' ').slice(0, 150),
    );
  } catch (e) {
    check(
      'KeePassXC opens the moved vault',
      false,
      String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 200),
    );
  }
} catch (e) {
  check('the run finished', false, String(e).slice(0, 400));
} finally {
  await finish();
}
