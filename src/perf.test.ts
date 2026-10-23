// Makes a large vault for the performance check (scripts/e2e-perf.ts). Skipped unless PERF_VAULT names the file:
//
//   PERF_VAULT=E:/temp/big.kdbx npx vitest run src/perf.test.ts
//
// 10,000 bookmarks in 100 folders, each with a 5 KB cover picture, which makes a vault of about 50 MB.
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import * as model from './bookmark-model';
import { credentialsFromPassword, newDatabase, saveDatabase } from './kdbx';

describe.skipIf(!process.env.PERF_VAULT)('big vault', () => {
  it('writes it', async () => {
    const db = newDatabase(await credentialsFromPassword('perf'));
    const folders = Array.from({ length: 100 }, (_, i) =>
      model.createFolder(db, null, `Folder ${i}`),
    );
    for (let i = 0; i < 10_000; i++) {
      const cover = new Uint8Array(5000);
      for (let o = 0; o < cover.length; o += 65536)
        crypto.getRandomValues(cover.subarray(o, o + 65536));
      await model.addBookmark(
        db,
        {
          folderId: folders[i % 100]!,
          title: `Bookmark ${i}`,
          url: `https://site${i % 700}.test/page/${i}`,
          note: i % 5 === 0 ? 'A note about this page that is a little longer than a title.' : '',
          tags: [`tag${i % 40}`, `kind${i % 7}`],
          favorite: i % 50 === 0,
        },
        {
          cover,
          favicon: {
            site: `https://site${i % 700}.test`,
            png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, i % 256, 1, 2, 3]),
          },
        },
      );
    }
    writeFileSync(process.env.PERF_VAULT!, await saveDatabase(db));
  }, 300_000);
});
