// Bundled into the spike extension (npm run spike:bundle). Builds a vault in the
// browser background, saves it through the helper, reads it back and opens it.
import * as kdbxweb from 'kdbxweb';
import { argon2id } from 'hash-wasm';

kdbxweb.CryptoEngine.setArgon2Impl(
  async (password, salt, memory, iterations, length, parallelism) => {
    const out = await argon2id({
      password: new Uint8Array(password),
      salt: new Uint8Array(salt),
      memorySize: memory,
      iterations,
      parallelism,
      hashLength: length,
      outputType: 'binary',
    });
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  },
);

const credentials = () =>
  new kdbxweb.KdbxCredentials(kdbxweb.ProtectedValue.fromString('correct horse'));
const heapMiB = () => {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? Math.round(memory.usedJSHeapSize / 1048576) : undefined;
};

interface Options {
  count: number;
  thumb: number;
  upload: (bytes: Uint8Array) => Promise<string>;
  download: () => Promise<Uint8Array>;
}

export async function vaultRoundTrip({ count, thumb, upload, download }: Options) {
  const db = kdbxweb.Kdbx.create(credentials(), 'BookPass');
  db.setKdf(kdbxweb.Consts.KdfId.Argon2id);
  const kdf = db.header.kdfParameters!;
  kdf.set('M', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(256 * 1048576));
  kdf.set('I', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(3));
  db.upgrade();
  db.header.versionMinor = 1;
  const root = db.getDefaultGroup();
  const folders = Array.from({ length: 50 }, (_, i) => db.createGroup(root, `Folder ${i}`));

  let t = performance.now();
  for (let i = 0; i < count; i++) {
    const entry = db.createEntry(folders[i % 50]!);
    entry.fields.set('Title', `Bookmark ${i}`);
    entry.fields.set('URL', `https://example.com/page/${i}`);
    entry.fields.set('Notes', 'x'.repeat(200));
    entry.tags = ['t' + (i % 20)];
    if (thumb) {
      const bytes = new Uint8Array(thumb);
      for (let o = 0; o < bytes.length; o += 65536)
        crypto.getRandomValues(bytes.subarray(o, o + 65536));
      entry.binaries.set('cover.webp', await db.createBinary(bytes.buffer as ArrayBuffer));
    }
  }
  const buildMs = Math.round(performance.now() - t);

  t = performance.now();
  const saved = new Uint8Array(await db.save());
  const saveMs = Math.round(performance.now() - t);

  t = performance.now();
  await upload(saved);
  const uploadMs = Math.round(performance.now() - t);

  t = performance.now();
  const bytes = await download();
  const downloadMs = Math.round(performance.now() - t);

  t = performance.now();
  const opened = await kdbxweb.Kdbx.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    credentials(),
  );
  const openMs = Math.round(performance.now() - t);

  return {
    fileMiB: +(saved.length / 1048576).toFixed(1),
    entriesBack: [...opened.getDefaultGroup().allEntries()].length,
    buildMs,
    saveMs,
    uploadMs,
    downloadMs,
    openMs,
    jsHeapMiB: heapMiB(),
  };
}
