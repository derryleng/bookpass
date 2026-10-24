// The picture controls and the spacing of the bookmark list and dialogs: the checkbox on a bookmark keeps clear of the
// border and the text in every layout, dialogs have the same room on every side, a bookmark can be given its own
// site icon and cover and have them taken away, and the settings offer the picture options.
//
// Fetching from a site needs the browser's permission prompt, which a script cannot answer, so that part is checked
// by hand (see docs/TESTING.md).
//
//   npm run build && npm run helper:build && node tests/e2e/pictures.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'puppeteer-core';
import { fixtures, outputDir, password, sleep, startSession } from './lib.ts';

const { check, openPage, text, hasText, click, type, shot, finish } =
  await startSession('pictures');

const importPath = join(fixtures, 'bookmarks.html');

/** A picture to choose, drawn by the page itself so no binary file has to be kept in the repository. */
async function makePicture(page: Page, name: string, from: string, to: string) {
  const data = await page.evaluate(
    async (from, to) => {
      const canvas = new OffscreenCanvas(320, 180);
      const g = canvas.getContext('2d')!;
      const fill = g.createLinearGradient(0, 0, 320, 180);
      fill.addColorStop(0, from);
      fill.addColorStop(1, to);
      g.fillStyle = fill;
      g.fillRect(0, 0, 320, 180);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
    },
    from,
    to,
  );
  const path = join(outputDir, 'work', name);
  writeFileSync(path, Buffer.from(data, 'base64'));
  return path;
}

try {
  // 1. A vault with a few bookmarks that have no pictures.
  const manager = await openPage('manager.html');
  await hasText(manager, 'Create your vault');
  await type(manager, 'input[type=password]', password);
  await (await manager.$$('input[type=password]'))[1]!.type(password);
  await click(manager, 'button', 'Create vault');
  await hasText(manager, 'All bookmarks', 15000);
  await click(manager, 'summary', 'Tools');
  await click(manager, '.menu-list button', 'Import bookmarks…');
  await manager.waitForSelector('dialog[open] input[type=file]');
  await (await manager.$('dialog[open] input[type=file]'))!.uploadFile(importPath);
  await hasText(manager, 'bookmarks to import');
  await click(manager, 'dialog button', 'Import');
  await hasText(manager, 'Imported');
  await click(manager, 'dialog button', 'Done');
  await manager.waitForSelector('.bm', { timeout: 15000 });

  // 2. The checkbox that appears over a bookmark keeps clear of its border and its text.
  for (const layout of ['List', 'Headlines', 'Grid', 'Masonry']) {
    await manager.click(`button[aria-label="${layout}"]`);
    await sleep(400);
    await manager.hover('.bm');
    await sleep(250);
    const spots = await manager.evaluate(() => {
      const rect = (e: Element | null) => e?.getBoundingClientRect();
      const bm = document.querySelector('.bm')!;
      const check = rect(bm.querySelector('.bm-check'))!;
      const body = rect(bm.querySelector('.bm-body'))!;
      const card = rect(bm)!;
      return {
        fromLeft: check.left - card.left,
        fromTop: check.top - card.top,
        toText: body.left - check.right,
        sameRow: check.bottom > body.top && check.top < body.bottom,
      };
    });
    const overText = layout === 'List' || layout === 'Headlines' ? spots.toText < 6 : false;
    check(
      `${layout}: the checkbox is clear of the border${layout === 'List' || layout === 'Headlines' ? ' and the text' : ''}`,
      spots.fromLeft >= 8 && !overText,
      `left ${spots.fromLeft.toFixed(0)}px, top ${spots.fromTop.toFixed(0)}px, to text ${spots.toText.toFixed(0)}px`,
    );
    await shot(manager, `checkbox-${layout.toLowerCase()}`);
  }
  await manager.click('button[aria-label="List"]');
  await manager.mouse.move(5, 5);

  // 3. The edit dialog has the same room on every side.
  await manager.evaluate(() =>
    document.querySelector<HTMLButtonElement>('.bm-actions button[aria-label=Edit]')?.click(),
  );
  await manager.waitForSelector('dialog[open] fieldset.pictures');
  await sleep(300);
  const room = await manager.evaluate(() => {
    const dialog = document.querySelector('dialog[open]')!.getBoundingClientRect();
    const buttons = [...document.querySelectorAll('dialog[open] .modal-foot button')];
    const last = buttons[buttons.length - 1]!.getBoundingClientRect();
    const first = document.querySelector('dialog[open] .modal-body')!.firstElementChild!;
    return {
      bottom: dialog.bottom - last.bottom,
      side: first.getBoundingClientRect().left - dialog.left,
      right: dialog.right - last.right,
    };
  });
  check(
    'the edit dialog has as much room at the bottom as at the sides',
    room.bottom >= 16 &&
      Math.abs(room.bottom - room.side) <= 6 &&
      Math.abs(room.right - room.side) <= 6,
    `bottom ${room.bottom.toFixed(0)}px, left ${room.side.toFixed(0)}px, right ${room.right.toFixed(0)}px`,
  );
  await shot(manager, 'edit-dialog');

  // 4. Choose a site icon and a cover of your own.
  const iconFile = await makePicture(manager, 'my-icon.png', '#e8590c', '#fcc419');
  const coverFile = await makePicture(manager, 'my-cover.png', '#7048e8', '#15aabf');
  const inputs = await manager.$$('dialog[open] fieldset.pictures input[type=file]');
  await inputs[0]!.uploadFile(iconFile);
  await inputs[1]!.uploadFile(coverFile);
  await sleep(1000);
  const preview = await manager.evaluate(() => ({
    icon: !!document.querySelector('dialog[open] .picture-icon img.favicon'),
    cover: document.querySelector<HTMLElement>('dialog[open] .picture-cover')!.style
      .backgroundImage,
  }));
  check(
    'a chosen icon and cover show in the dialog',
    preview.icon && preview.cover.startsWith('url('),
  );
  await shot(manager, 'edit-dialog-chosen');
  for (const width of [1280, 520]) {
    await manager.setViewport({ width, height: 800 });
    await sleep(300);
    const fit = await manager.evaluate(() => {
      const inside = document
        .querySelector('dialog[open] fieldset.pictures')!
        .getBoundingClientRect();
      const body = document.querySelector<HTMLElement>('dialog[open] .modal-body')!;
      const out = [...document.querySelectorAll('dialog[open] .picture-slot *')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right > inside.right + 0.5 || r.left < inside.left - 0.5);
      });
      return { out: out.length, scrolls: body.scrollWidth > body.clientWidth };
    });
    check(
      `the pictures stay inside their box at ${width}px wide`,
      fit.out === 0 && !fit.scrolls,
      `${fit.out} outside, sideways scroll ${fit.scrolls}`,
    );
    await shot(manager, `edit-dialog-${width}`);
  }
  await manager.setViewport({ width: 1280, height: 800 });
  await click(manager, 'dialog button', 'Save');
  await sleep(1500);
  const saved = await manager.evaluate(() => ({
    cover: document.querySelector<HTMLElement>('.bm .bm-cover')?.style.backgroundImage ?? '',
    icons: document.querySelectorAll('.bm img.favicon').length,
  }));
  check(
    'the chosen cover and icon are saved on the bookmark',
    saved.cover.startsWith('url(') && saved.icons > 0,
  );

  // 5. And take them away again.
  await manager.evaluate(() =>
    document.querySelector<HTMLButtonElement>('.bm-actions button[aria-label=Edit]')?.click(),
  );
  await manager.waitForSelector('dialog[open] fieldset.pictures');
  await manager.evaluate(() => {
    for (const slot of document.querySelectorAll('dialog[open] .picture-slot'))
      [...slot.querySelectorAll('button')].find((b) => b.innerText.includes('Remove'))?.click();
  });
  await click(manager, 'dialog button', 'Save');
  await sleep(1500);
  const removed = await manager.evaluate(() => ({
    cover: document.querySelector<HTMLElement>('.bm .bm-cover')?.style.backgroundImage ?? '',
    icons: document.querySelectorAll('.bm:first-of-type img.favicon').length,
  }));
  check(
    'removing the pictures takes them off the bookmark',
    !removed.cover.startsWith('url(') && removed.icons === 0,
  );

  // 6. The settings: picture options and the tool for filling in what is missing.
  const settings = await openPage('options.html');
  await hasText(settings, 'Pictures');
  const other = 'Also read preview images that sit on another server';
  check('the settings offer the cover options', (await text(settings)).includes(other));
  check(
    'reading covers from other servers is off by default',
    await settings.evaluate(
      (label) =>
        ![...document.querySelectorAll('label')]
          .find((l) => l.innerText.includes(label))!
          .querySelector('input')!.checked,
      other,
    ),
  );
  await settings.evaluate(
    (label) =>
      [...document.querySelectorAll('label')]
        .find((l) => l.innerText.includes(label))!
        .querySelector('input')!
        .click(),
    other,
  );
  await sleep(600);
  await settings.reload();
  await hasText(settings, 'Pictures');
  check(
    'the setting is remembered',
    await settings.evaluate(
      (label) =>
        [...document.querySelectorAll('label')]
          .find((l) => l.innerText.includes(label))!
          .querySelector('input')!.checked,
      other,
    ),
  );
  await shot(settings, 'settings-pictures');
  await click(settings, 'button', 'Fetch missing pictures…');
  await settings.waitForSelector('dialog[open]');
  check(
    'the fetch dialog counts the bookmarks without pictures',
    await hasText(settings, 'have no site icon'),
    ((await text(settings)).match(/\d+ of your \d+ bookmarks[^.]*\./) ?? [''])[0],
  );
  check(
    'the fetch dialog explains what is sent',
    (await text(settings)).includes('no cookies and no referrer'),
  );
  await shot(settings, 'fetch-missing');
  await click(settings, 'dialog button', 'Cancel');
} catch (e) {
  check('the run finished', false, String(e).slice(0, 300));
} finally {
  await finish();
}
