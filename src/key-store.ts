// Where the unlock key is kept while the vault is unlocked.
// The key is the hash of the master password. It opens the vault but is not the password.
//
// It lives in storage.session: memory only, gone when the browser closes, and never readable by web pages.
import { browser } from "wxt/browser";

const KEY = "unlockKey";

export async function loadKey(): Promise<string | undefined> {
  return (await browser.storage.session.get(KEY))[KEY] as string | undefined;
}

export async function saveKey(key: string): Promise<void> {
  await browser.storage.session.set({ [KEY]: key });
}

export async function clearKey(): Promise<void> {
  await browser.storage.session.remove(KEY);
}

/** The "never lock" setting of version 0.1.0 wrote the key to disk. That setting is gone, so any copy is deleted. */
export async function removeDiskCopy(): Promise<void> {
  await browser.storage.local.remove(KEY);
}
