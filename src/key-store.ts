// Where the unlock key is kept while the vault is unlocked.
// The key is the hash of the master password. It opens the vault but is not the password.
//
// Normally it lives in storage.session: memory only, gone when the browser closes, and never
// readable by web pages. Only the explicit "never lock" setting also writes it to disk.
import { browser } from "wxt/browser";

const KEY = "unlockKey";

export async function loadKey(): Promise<string | undefined> {
  const fromSession = (await browser.storage.session.get(KEY))[KEY] as
    string | undefined;
  return (
    fromSession ??
    ((await browser.storage.local.get(KEY))[KEY] as string | undefined)
  );
}

export async function saveKey(key: string, alsoOnDisk: boolean): Promise<void> {
  await browser.storage.session.set({ [KEY]: key });
  if (alsoOnDisk) await browser.storage.local.set({ [KEY]: key });
  else await browser.storage.local.remove(KEY);
}

/** Removes the key everywhere, which locks the vault. */
export async function clearKey(): Promise<void> {
  await Promise.all([
    browser.storage.session.remove(KEY),
    browser.storage.local.remove(KEY),
  ]);
}

/** Adds or removes the on disk copy without touching the in memory one. */
export async function setDiskCopy(key: string | undefined): Promise<void> {
  if (key) await browser.storage.local.set({ [KEY]: key });
  else await browser.storage.local.remove(KEY);
}
