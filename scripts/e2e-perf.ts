// How the extension copes with a big vault: 10,000 bookmarks, about 50 MB.
//
//   PERF_VAULT=E:/temp/big.kdbx npx vitest run src/perf.test.ts
//   npm run build && PERF_VAULT=E:/temp/big.kdbx node scripts/e2e-perf.ts
//
// Prints timings. The limits below are what a person would still call quick.
import { existsSync, statSync } from 'node:fs';
import { sleep, startSession } from './e2e-lib.ts';

const vault = process.env.PERF_VAULT;
if (!vault || !existsSync(vault))
  throw new Error('Set PERF_VAULT to a vault made by src/perf.test.ts');

const { check, openPage, hasText, click, type, shot, finish } = await startSession('e2e-perf-out', {
  vaultPath: vault,
});
const seconds = (since: number) => (performance.now() - since) / 1000;

try {
  const page = await openPage('manager.html');
  check('the big vault is offered for unlocking', await hasText(page, 'Unlock BookPass'));
  console.log(`  vault file: ${(statSync(vault).size / 1048576).toFixed(1)} MB`);

  await type(page, 'input[type=password]', 'perf');
  let t = performance.now();
  await click(page, 'button', 'Unlock');
  const opened = await hasText(page, 'All bookmarks', 60000);
  const unlock = seconds(t);
  check('it unlocks', opened, `${unlock.toFixed(1)} s`);
  check('unlocking takes under 20 seconds', unlock < 20);
  await sleep(1500);
  await shot(page, '01-big-vault');

  const shown = await page.$$eval('.bm', (els) => els.length);
  check('the first screenful is drawn, not all 10,000', shown > 0 && shown < 400, `${shown} drawn`);

  // Search across everything.
  t = performance.now();
  await page.type('input[aria-label=Search]', 'Bookmark 9999');
  await page.waitForFunction(() => document.querySelectorAll('.bm').length === 1, {
    timeout: 20000,
  });
  const search = seconds(t);
  check(
    'searching 10,000 bookmarks is quick',
    search < 3,
    `${search.toFixed(2)} s including typing`,
  );
  await page.click('input[aria-label=Search]', { count: 3 });
  await page.keyboard.press('Backspace');

  // A change is saved as a whole file.
  await page.waitForFunction(() => document.querySelectorAll('.bm').length > 10, {
    timeout: 20000,
  });
  t = performance.now();
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('.bm .fav')?.click());
  await sleep(500);
  await page.waitForFunction(() => document.body.innerText.includes('Saved'), { timeout: 60000 });
  const save = seconds(t);
  check('a change is saved in under 15 seconds', save < 15, `${save.toFixed(1)} s`);
} catch (e) {
  check('the run finished without an error', false, String(e).slice(0, 300));
}
await finish();
