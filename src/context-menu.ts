// Right click saving: "Save page to BookPass", and the same for links and images.
// Choosing one counts as the user's say so for that tab, so activeTab lets BookPass read the page it was chosen on.
import { browser } from 'wxt/browser';
import { fromBase64 } from './base64';
import * as model from './bookmark-model';
import { inspectTab, isSavable } from './capture';
import { shrinkCover } from './images';
import { stopCoversVaultBytes } from './constants';
import { loadKey } from './key-store';
import type { Vault } from './vault';

const menus = [
  { id: 'save-page', title: 'Save page to BookPass', contexts: ['page'] },
  { id: 'save-link', title: 'Save link to BookPass', contexts: ['link'] },
  { id: 'save-image', title: 'Save image to BookPass', contexts: ['image'] },
] as const;

/** Tells the person it worked, on the toolbar button, since the menu click leaves no other trace. */
function flash(text: string) {
  void browser.action.setBadgeText({ text });
  setTimeout(() => void browser.action.setBadgeText({ text: '' }), 2500);
}

/** A locked vault cannot take a bookmark, so the manager opens with the bookmark ready to save once unlocked. */
function saveAfterUnlocking(url: string, title: string) {
  const hash = '#save=' + encodeURIComponent(JSON.stringify({ url, title }));
  void browser.tabs.create({ url: browser.runtime.getURL('/manager.html') + hash });
}

export function startContextMenu(vault: Vault) {
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      for (const menu of menus)
        browser.contextMenus.create({ ...menu, contexts: [...menu.contexts] });
    });
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    const kind = info.menuItemId;
    const url =
      kind === 'save-link'
        ? info.linkUrl
        : kind === 'save-image'
          ? info.srcUrl
          : (info.pageUrl ?? tab?.url);
    if (!isSavable(url)) return flash('NO');
    const title =
      (kind === 'save-link' ? info.selectionText : undefined) ||
      (kind === 'save-page' ? tab?.title : undefined) ||
      url;

    if (!(await loadKey())) return saveAfterUnlocking(url, title);

    try {
      let input: model.BookmarkInput = { folderId: null, title, url };
      let capture: model.Capture = {};
      if (kind === 'save-page' && tab) {
        const page = await inspectTab(
          tab,
          vault.settings.captureCovers && (await vault.sizeBytes()) < stopCoversVaultBytes,
          vault.settings.coversFromOtherServers,
        );
        input = {
          ...input,
          title: page.title || title,
          excerpt: page.description,
          type: page.type,
        };
        capture = {
          cover: page.cover
            ? fromBase64(await shrinkCover(page.cover, vault.settings.coverWidth))
            : undefined,
          favicon: page.favicon
            ? {
                site: new URL(url).origin,
                png: fromBase64(page.favicon.replace(/^data:image\/png;base64,/, '')),
              }
            : undefined,
        };
      } else if (kind === 'save-image') {
        input = { ...input, type: 'image' };
      }
      await vault.edit((db) => model.addBookmark(db, input, capture));
      flash('OK');
    } catch {
      flash('ERR');
    }
  });
}
