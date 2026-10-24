import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as model from '../../src/bookmark-model';
import {
  changePassword,
  createKeyFile,
  findEditConflicts,
  credentialsFromKey,
  credentialsFromPassword,
  keyOf,
  newDatabase,
  openDatabase,
  saveDatabase,
  type KdfParams,
} from '../../src/kdbx';

const fastKdf: KdfParams = { memoryMiB: 1, iterations: 1, parallelism: 1 };
const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

describe('golden files', () => {
  it('opens the file BookPass made, with every field', async () => {
    const { db, upgraded } = await openDatabase(
      fixture('golden-bookpass.kdbx'),
      await credentialsFromPassword('golden'),
      fastKdf,
    );
    expect(upgraded).toBe(false);
    const snap = model.readSnapshot(db);
    expect(snap.folders).toMatchObject([
      { name: 'Reading', icon: 'fa-solid:book', color: '#3e63dd' },
    ]);
    const book = snap.bookmarks.find((b) => b.title === 'The Rust Book')!;
    expect(book).toMatchObject({
      url: 'https://doc.rust-lang.org/book/',
      note: 'ownership chapter',
      excerpt: 'Learn Rust',
      type: 'article',
      favorite: true,
      tags: ['rust', 'learning'],
    });
    expect(book.iconId).toBeTruthy();
    expect(snap.bookmarks.find((b) => b.title === 'Loose')?.folderId).toBeNull();
  });

  it('opens a file KeePassXC made and upgrades it to KDBX 4.1 on save', async () => {
    const { db, upgraded } = await openDatabase(
      fixture('golden-keepassxc.kdbx'),
      await credentialsFromPassword('golden'),
      fastKdf,
    );
    expect(upgraded).toBe(true); // KeePassXC's command line tool writes KDBX 3.1
    expect(model.readSnapshot(db).bookmarks.map((b) => b.title)).toEqual(['KeePassXC site']);
    const saved = await saveDatabase(db);
    expect(new DataView(saved.buffer).getUint16(10, true)).toBe(4);
    expect(new DataView(saved.buffer).getUint16(8, true)).toBe(1);
  });
});

describe('tampering', () => {
  const golden = fixture('golden-bookpass.kdbx');
  const open = async (bytes: Uint8Array) =>
    openDatabase(bytes, await credentialsFromPassword('golden'), fastKdf);

  // Flipping one byte anywhere in the file must be noticed, never silently accepted.
  it.each([
    ['the signature', 1],
    ['the header', 30],
    ['the header hash', golden.length > 0 ? 170 : 0],
    ['the encrypted data', Math.floor(golden.length / 2)],
    ['the last block', golden.length - 40],
  ])('refuses a file with a flipped byte in %s', async (_where, at) => {
    const bad = golden.slice();
    bad[at] = bad[at]! ^ 0x01;
    await expect(open(bad)).rejects.toThrow();
  });

  it('refuses a truncated file', async () => {
    await expect(open(golden.slice(0, golden.length - 100))).rejects.toThrow();
    await expect(open(new Uint8Array(0))).rejects.toThrow();
  });

  it('does not open with the wrong password', async () => {
    await expect(
      openDatabase(golden, await credentialsFromPassword('Golden'), fastKdf),
    ).rejects.toMatchObject({ code: 'InvalidKey' });
  });
});

describe('key file', () => {
  it('needs both the password and the key file', async () => {
    const keyFile = await createKeyFile();
    const creds = await credentialsFromPassword('pw', keyFile);
    const bytes = await saveDatabase(newDatabase(creds, fastKdf));

    await openDatabase(bytes, await credentialsFromPassword('pw', keyFile), fastKdf);
    await expect(
      openDatabase(bytes, await credentialsFromPassword('pw'), fastKdf),
    ).rejects.toMatchObject({ code: 'InvalidKey' });
    await expect(
      openDatabase(bytes, await credentialsFromPassword('pw', await createKeyFile()), fastKdf),
    ).rejects.toMatchObject({ code: 'InvalidKey' });
  });

  it('keeps working through the stored unlock key', async () => {
    const keyFile = await createKeyFile();
    const creds = await credentialsFromPassword('pw', keyFile);
    const bytes = await saveDatabase(newDatabase(creds, fastKdf));
    const again = credentialsFromKey(keyOf(creds));
    await openDatabase(bytes, again, fastKdf);
    expect(keyOf(creds).startsWith('{')).toBe(true);
    expect(keyOf(await credentialsFromPassword('pw')).startsWith('{')).toBe(false); // no key file: the plain hash
  });
});

describe('changing the password', () => {
  it('re-encrypts with the new password and keeps the key file', async () => {
    const keyFile = await createKeyFile();
    const creds = await credentialsFromPassword('old', keyFile);
    const db = newDatabase(creds, fastKdf);
    await model.addBookmark(db, { folderId: null, title: 'Kept', url: 'https://k.test/' });
    await changePassword(db, 'new');
    const bytes = await saveDatabase(db);

    await expect(
      openDatabase(bytes, await credentialsFromPassword('old', keyFile), fastKdf),
    ).rejects.toThrow();
    const { db: back } = await openDatabase(
      bytes,
      await credentialsFromPassword('new', keyFile),
      fastKdf,
    );
    expect(model.readSnapshot(back).bookmarks[0]?.title).toBe('Kept');
  });
});

describe('edit conflicts', () => {
  async function twoCopies() {
    const creds = await credentialsFromPassword('pw');
    const base = newDatabase(creds, fastKdf);
    const id = await model.addBookmark(base, {
      folderId: null,
      title: 'Original',
      url: 'https://x.test/',
    });
    // The bookmark was last changed a minute ago, and the two computers last agreed 30 seconds ago.
    [...base.getDefaultGroup().allEntries()][0]!.times.lastModTime = new Date(Date.now() - 60_000);
    const bytes = await saveDatabase(base);
    const local = (await openDatabase(bytes, creds, fastKdf)).db;
    const remote = (await openDatabase(bytes, creds, fastKdf)).db;
    return { id, local, remote, since: Date.now() - 30_000 };
  }
  const entryOf = (db: Awaited<ReturnType<typeof twoCopies>>['local']) =>
    [...db.getDefaultGroup().allEntries()][0]!;

  it('reports a bookmark edited differently on both computers', async () => {
    const { id, local, remote, since } = await twoCopies();
    entryOf(local).fields.set('Title', 'Edited here');
    entryOf(local).times.update();
    entryOf(remote).fields.set('Title', 'Edited there');
    entryOf(remote).times.lastModTime = new Date(Date.now() + 3000);
    expect(findEditConflicts(local, remote, since)).toMatchObject([{ id, title: 'Edited here' }]);
  });

  it('does not report an edit made on one side only, or the same edit on both', async () => {
    const { local, remote, since } = await twoCopies();
    entryOf(remote).fields.set('Title', 'Only there');
    entryOf(remote).times.update();
    expect(findEditConflicts(local, remote, since)).toEqual([]);

    entryOf(local).fields.set('Title', 'Only there');
    entryOf(local).times.update();
    expect(findEditConflicts(local, remote, since)).toEqual([]);
  });
});
