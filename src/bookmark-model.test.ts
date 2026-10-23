import { beforeAll, describe, expect, it } from 'vitest';
import * as model from './bookmark-model';
import {
  credentialsFromKey,
  credentialsFromPassword,
  keyOf,
  mergeRemote,
  newDatabase,
  openDatabase,
  saveDatabase,
  type Kdbx,
  type KdfParams,
} from './kdbx';

// A cheap Argon2 setting keeps the tests fast. The real default is in kdbx.ts.
const fastKdf: KdfParams = { memoryMiB: 1, iterations: 1, parallelism: 1 };
let creds: Awaited<ReturnType<typeof credentialsFromPassword>>;

beforeAll(async () => {
  creds = await credentialsFromPassword('correct horse');
});

const fresh = () => newDatabase(creds, fastKdf);
const reopen = async (db: Kdbx) => (await openDatabase(await saveDatabase(db), creds, fastKdf)).db;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

describe('vault format', () => {
  it('creates a KDBX 4.1 file that opens with the password hash alone', async () => {
    const db = fresh();
    const bytes = await saveDatabase(db);
    expect(new DataView(bytes.buffer).getUint16(8, true)).toBe(1); // minor
    expect(new DataView(bytes.buffer).getUint16(10, true)).toBe(4); // major
    const opened = await openDatabase(bytes, credentialsFromKey(keyOf(creds)), fastKdf);
    expect(opened.upgraded).toBe(false);
  });

  it('rejects a wrong password', async () => {
    const bytes = await saveDatabase(fresh());
    const wrong = await credentialsFromPassword('wrong');
    await expect(openDatabase(bytes, wrong, fastKdf)).rejects.toMatchObject({ code: 'InvalidKey' });
  });
});

describe('bookmarks', () => {
  it('round trips every field through save and open', async () => {
    const db = fresh();
    const folder = model.createFolder(db, null, 'Reading', {
      icon: 'fa-solid:book',
      color: '#2a6',
    });
    const id = await model.addBookmark(db, {
      folderId: folder,
      title: 'Zażółć gęślą jaźń',
      url: 'https://example.com/a?b=c',
      note: 'my note',
      excerpt: 'page description',
      type: 'article',
      favorite: true,
      tags: ['one', 'two', 'one'],
    });
    const snap = model.readSnapshot(await reopen(db));
    expect(snap.folders).toHaveLength(1);
    expect(snap.folders[0]).toMatchObject({
      name: 'Reading',
      icon: 'fa-solid:book',
      color: '#2a6',
      parentId: null,
    });
    expect(snap.bookmarks).toHaveLength(1);
    expect(snap.bookmarks[0]).toMatchObject({
      id,
      folderId: folder,
      title: 'Zażółć gęślą jaźń',
      url: 'https://example.com/a?b=c',
      note: 'my note',
      excerpt: 'page description',
      type: 'article',
      favorite: true,
      tags: ['one', 'two'],
    });
  });

  it('keeps top level bookmarks out of folders', async () => {
    const db = fresh();
    await model.addBookmark(db, { folderId: null, title: 'Loose', url: 'https://x.test/' });
    expect(model.readSnapshot(db).bookmarks[0]?.folderId).toBeNull();
  });

  it('edits a bookmark, keeps the old version in history and can move it', async () => {
    const db = fresh();
    const a = model.createFolder(db, null, 'A');
    const b = model.createFolder(db, null, 'B');
    const id = await model.addBookmark(db, { folderId: a, title: 'Old', url: 'https://x.test/' });
    await model.updateBookmark(db, id, { title: 'New', folderId: b, favorite: true });
    const snap = model.readSnapshot(db);
    expect(snap.bookmarks[0]).toMatchObject({ title: 'New', folderId: b, favorite: true });
    const entry = [...db.getDefaultGroup().allEntries()][0]!;
    expect(entry.history).toHaveLength(1);
    expect(entry.history[0]!.fields.get('Title')).toBe('Old');
  });

  it('trashes, restores and deletes forever', async () => {
    const db = fresh();
    const folder = model.createFolder(db, null, 'F');
    const id = await model.addBookmark(db, {
      folderId: folder,
      title: 'T',
      url: 'https://x.test/',
    });

    model.trashBookmarks(db, [id]);
    let snap = model.readSnapshot(db);
    expect(snap.bookmarks).toHaveLength(0);
    expect(snap.trash.map((b) => b.id)).toEqual([id]);

    model.restoreBookmarks(db, [id]);
    snap = model.readSnapshot(db);
    expect(snap.trash).toHaveLength(0);
    expect(snap.bookmarks[0]?.folderId).toBe(folder);

    model.trashBookmarks(db, [id]);
    model.deleteForever(db, [id]);
    expect(model.readSnapshot(db).trash).toHaveLength(0);
    expect(db.deletedObjects.some((d) => d.uuid?.id === id)).toBe(true);
  });

  it('restores to the top level when the old folder was trashed too', async () => {
    const db = fresh();
    const folder = model.createFolder(db, null, 'F');
    const id = await model.addBookmark(db, {
      folderId: folder,
      title: 'T',
      url: 'https://x.test/',
    });
    model.trashFolder(db, folder);
    expect(model.readSnapshot(db).trash.map((b) => b.id)).toEqual([id]);
    model.restoreBookmarks(db, [id]);
    expect(model.readSnapshot(db).bookmarks[0]?.folderId).toBeNull();
  });

  it('stores one favicon per site and a cover per bookmark', async () => {
    const db = fresh();
    const icon = { site: 'https://example.com', png };
    const a = await model.addBookmark(
      db,
      { folderId: null, title: 'A', url: 'https://example.com/1' },
      { favicon: icon, cover: png },
    );
    await model.addBookmark(
      db,
      { folderId: null, title: 'B', url: 'https://example.com/2' },
      { favicon: icon },
    );
    expect(db.meta.customIcons.size).toBe(1);

    const reopened = await reopen(db);
    const snap = model.readSnapshot(reopened);
    const [first, second] = snap.bookmarks;
    expect(first!.iconId).toBeTruthy();
    expect(first!.iconId).toBe(second!.iconId);
    expect(first!.hasCover).toBe(true);
    expect(second!.hasCover).toBe(false);
    expect(model.getCover(reopened, a)?.mime).toBe('image/webp');
    expect(model.fromBase64(model.getIcon(reopened, first!.iconId!)!.base64)).toEqual(png);
  });
});

describe('folders', () => {
  it('nests, renames and keeps view settings', async () => {
    const db = fresh();
    const parent = model.createFolder(db, null, 'Parent');
    const child = model.createFolder(db, parent, 'Child');
    model.updateFolder(db, child, {
      name: 'Renamed',
      view: { ...model.defaultView, layout: 'grid', sort: 'title' },
    });
    const snap = model.readSnapshot(await reopen(db));
    const found = snap.folders.find((f) => f.id === child)!;
    expect(found).toMatchObject({ name: 'Renamed', parentId: parent });
    expect(found.view).toMatchObject({ layout: 'grid', sort: 'title' });
  });

  it('refuses to move a folder into itself or its descendants', () => {
    const db = fresh();
    const parent = model.createFolder(db, null, 'Parent');
    const child = model.createFolder(db, parent, 'Child');
    expect(() => model.moveFolder(db, parent, child)).toThrow();
    expect(() => model.moveFolder(db, parent, parent)).toThrow();
    model.moveFolder(db, child, null);
    expect(model.readSnapshot(db).folders.find((f) => f.id === child)?.parentId).toBeNull();
  });

  it('tolerates broken stored view settings', () => {
    const db = fresh();
    const id = model.createFolder(db, null, 'F');
    db.getGroup(id)!.customData!.set('bp.view', { value: '{not json' });
    expect(model.readSnapshot(db).folders[0]?.view).toEqual(model.defaultView);
  });
});

describe('merge', () => {
  it('keeps folder custom data that kdbxweb alone would drop', async () => {
    const base = fresh();
    const folder = model.createFolder(base, null, 'Shared');
    const bytes = await saveDatabase(base);
    const local = (await openDatabase(bytes, creds, fastKdf)).db;
    const remote = (await openDatabase(bytes, creds, fastKdf)).db;

    // The other computer changes the folder view and adds a folder with an icon.
    await new Promise((r) => setTimeout(r, 1100)); // KDBX times have one second resolution
    model.updateFolder(remote, folder, { view: { ...model.defaultView, layout: 'masonry' } });
    const added = model.createFolder(remote, null, 'Added remotely', { icon: 'fa-solid:star' });

    mergeRemote(local, remote);
    const snap = model.readSnapshot(local);
    expect(snap.folders.find((f) => f.id === folder)?.view.layout).toBe('masonry');
    expect(snap.folders.find((f) => f.id === added)?.icon).toBe('fa-solid:star');
  });

  it('is stable when merged twice', async () => {
    const a = fresh();
    model.createFolder(a, null, 'One');
    const bytes = await saveDatabase(a);
    const local = (await openDatabase(bytes, creds, fastKdf)).db;
    const remote = (await openDatabase(bytes, creds, fastKdf)).db;
    model.createFolder(remote, null, 'Two');
    mergeRemote(local, remote);
    const once = model.readSnapshot(local).folders.length;
    mergeRemote(local, remote);
    expect(model.readSnapshot(local).folders).toHaveLength(once);
  });
});
