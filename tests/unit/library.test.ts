// Tests for the operations that work across many bookmarks: history, tags and import.
import { beforeAll, describe, expect, it } from 'vitest';
import * as model from '../../src/bookmark-model';
import { fromBase64 } from '../../src/base64';
import { getHistory, restoreVersion } from '../../src/history';
import { importInto, previewImport } from '../../src/importing';
import { parseNetscape } from '../../src/formats';
import {
  credentialsFromPassword,
  newDatabase,
  openDatabase,
  saveDatabase,
  type KdfParams,
} from '../../src/kdbx';
import { addTags, deleteTag, readTagColors, renameTag, setTagColor } from '../../src/tags';

const fastKdf: KdfParams = { memoryMiB: 1, iterations: 1, parallelism: 1 };
let creds: Awaited<ReturnType<typeof credentialsFromPassword>>;
beforeAll(async () => {
  creds = await credentialsFromPassword('pw');
});
const fresh = () => newDatabase(creds, fastKdf);

describe('history', () => {
  it('lists earlier versions and restores one', async () => {
    const db = fresh();
    const id = await model.addBookmark(db, {
      folderId: null,
      title: 'First',
      url: 'https://a.test/',
    });
    const entry = [...db.getDefaultGroup().allEntries()][0]!;
    // KDBX times have one second resolution, so give each version its own second.
    entry.times.lastModTime = new Date(Date.now() - 20_000);
    await model.updateBookmark(db, id, { title: 'Second', note: 'changed' });
    entry.times.lastModTime = new Date(Date.now() - 10_000);
    await model.updateBookmark(db, id, { title: 'Third' });

    const history = getHistory(db, id);
    expect(history.map((v) => v.title)).toEqual(['Second', 'First']);

    restoreVersion(db, id, history[1]!.time);
    const now = model.readSnapshot(db).bookmarks[0]!;
    expect(now.title).toBe('First');
    expect(getHistory(db, id).map((v) => v.title)).toContain('Third'); // what was replaced is kept
  });

  it('refuses a version that is gone', async () => {
    const db = fresh();
    const id = await model.addBookmark(db, { folderId: null, title: 'T', url: 'https://a.test/' });
    expect(() => restoreVersion(db, id, 12345)).toThrow(/no longer/);
  });
});

describe('tags', () => {
  async function vault() {
    const db = fresh();
    const a = await model.addBookmark(db, {
      folderId: null,
      title: 'A',
      url: 'https://a.test/',
      tags: ['Rust', 'web'],
    });
    const b = await model.addBookmark(db, {
      folderId: null,
      title: 'B',
      url: 'https://b.test/',
      tags: ['rust-lang', 'web'],
    });
    return { db, a, b };
  }
  const tagsOf = (db: ReturnType<typeof fresh>) =>
    model.readSnapshot(db).bookmarks.map((b) => b.tags.slice().sort());

  it('renames a tag everywhere, whatever its case', async () => {
    const { db } = await vault();
    renameTag(db, 'rust', 'Rustacean');
    expect(tagsOf(db)).toEqual([
      ['Rustacean', 'web'],
      ['rust-lang', 'web'],
    ]);
  });

  it('merges two tags when renamed onto an existing one', async () => {
    const { db } = await vault();
    renameTag(db, 'rust-lang', 'Rust');
    expect(tagsOf(db)).toEqual([
      ['Rust', 'web'],
      ['Rust', 'web'],
    ]);
  });

  it('deletes a tag and adds tags in bulk', async () => {
    const { db, a, b } = await vault();
    deleteTag(db, 'web');
    expect(tagsOf(db)).toEqual([['Rust'], ['rust-lang']]);
    addTags(db, [a, b], ['#new', 'new', ' ']);
    expect(tagsOf(db).every((t) => t.includes('new') && t.length === 2)).toBe(true);
  });

  it('keeps tag colors with the vault and moves them with a rename', async () => {
    const { db } = await vault();
    setTagColor(db, 'web', '#3e63dd');
    renameTag(db, 'web', 'internet');
    expect(readTagColors(db)).toEqual({ internet: '#3e63dd' });
    const back = (await openDatabase(await saveDatabase(db), creds, fastKdf)).db;
    expect(readTagColors(back)).toEqual({ internet: '#3e63dd' });
    setTagColor(back, 'internet', '');
    expect(readTagColors(back)).toEqual({});
  });
});

describe('import', () => {
  const html = `<DL><p>
    <DT><H3>Dev</H3><DL><p>
      <DT><A HREF="https://a.test/" ADD_DATE="1700000000" TAGS="x">A</A>
      <DT><H3>Deep</H3><DL><p><DT><A HREF="https://b.test/">B</A></DL><p>
    </DL><p>
    <DT><A HREF="https://c.test/">C</A>
    <DT><A HREF="https://a.test/#again">A again</A>
  </DL><p>`;

  it('previews without changing anything', async () => {
    const db = fresh();
    await model.addBookmark(db, { folderId: null, title: 'Already', url: 'https://c.test' });
    const preview = previewImport(db, parseNetscape(html), true);
    expect(preview).toEqual({ added: 2, skipped: 2, folders: 2 });
    expect(model.readSnapshot(db).bookmarks).toHaveLength(1);
  });

  it('imports into a dated folder, keeping structure, tags and dates, and skips duplicates', async () => {
    const db = fresh();
    await model.addBookmark(db, { folderId: null, title: 'Already', url: 'https://c.test' });
    const result = await importInto(db, parseNetscape(html), null, 'Imported today', true);
    expect(result).toEqual({ added: 2, skipped: 2, folders: 3 });

    const snap = model.readSnapshot(db);
    const names = (id: string | null): string[] =>
      id === null
        ? []
        : [
            ...names(snap.folders.find((f) => f.id === id)!.parentId),
            snap.folders.find((f) => f.id === id)!.name,
          ];
    const a = snap.bookmarks.find((b) => b.url === 'https://a.test/')!;
    expect(names(a.folderId)).toEqual(['Imported today', 'Dev']);
    expect(a.tags).toEqual(['x']);
    expect(a.created).toBe(1700000000 * 1000);
    expect(names(snap.bookmarks.find((b) => b.url === 'https://b.test/')!.folderId)).toEqual([
      'Imported today',
      'Dev',
      'Deep',
    ]);
  });

  it('imports twice without making copies', async () => {
    const db = fresh();
    await importInto(db, parseNetscape(html), null, undefined, true);
    const again = await importInto(db, parseNetscape(html), null, undefined, true);
    expect(again.added).toBe(0);
  });

  it('copes with a big import', async () => {
    const db = fresh();
    const many = {
      bookmarks: Array.from({ length: 3000 }, (_, i) => ({
        folderPath: ['F' + (i % 30)],
        title: 'B' + i,
        url: `https://x.test/${i}`,
        note: '',
        excerpt: '',
        tags: [],
        favorite: false,
      })),
      emptyFolders: [],
    };
    const started = performance.now();
    const result = await importInto(db, many, null, undefined, true);
    expect(result.added).toBe(3000);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

describe('folder pictures', () => {
  it('stores one picture per icon and color, shared between folders', () => {
    const db = fresh();
    const picture = { name: 'fa-solid:book|#e5484d', png: new Uint8Array([1, 2, 3]) };
    const a = model.createFolder(db, null, 'A', { icon: 'fa-solid:book', iconImage: picture });
    const b = model.createFolder(db, null, 'B', { icon: 'fa-solid:book', iconImage: picture });
    expect(db.meta.customIcons.size).toBe(1);
    expect(db.getGroup(a)!.customIcon!.id).toBe(db.getGroup(b)!.customIcon!.id);
    expect(fromBase64('AQID')).toEqual(picture.png);
  });
});
