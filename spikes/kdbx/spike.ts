// M0 spike: can kdbxweb carry BookPass data in a KDBX 4.1 file with Argon2id?
// Run: node spikes/kdbx/spike.ts
import * as kdbxweb from 'kdbxweb';
import { argon2id } from 'hash-wasm';

const MiB = 1024 * 1024;
const ms = (t0: number) => `${(performance.now() - t0).toFixed(0)} ms`;
const toBuf = (u: Uint8Array) =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

// kdbxweb ships no Argon2 code. We hand it hash-wasm, which is a small WASM build.
kdbxweb.CryptoEngine.setArgon2Impl(
  async (password, salt, memory, iterations, length, parallelism, type) => {
    if (type !== 2 /* Argon2id */) throw new Error('only Argon2id wanted');
    const out = await argon2id({
      password: new Uint8Array(password),
      salt: new Uint8Array(salt),
      memorySize: memory, // kdbxweb passes KiB, hash-wasm wants KiB
      iterations,
      parallelism,
      hashLength: length,
      outputType: 'binary',
    });
    return toBuf(out);
  },
);

const creds = () => new kdbxweb.KdbxCredentials(kdbxweb.ProtectedValue.fromString('correct horse'));

function newVault(memoryMiB: number, iterations: number) {
  const db = kdbxweb.Kdbx.create(creds(), 'BookPass');
  db.setKdf(kdbxweb.Consts.KdfId.Argon2id);
  const p = db.header.kdfParameters!;
  p.set('M', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(memoryMiB * MiB));
  p.set('I', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(iterations));
  p.set('P', kdbxweb.VarDictionary.ValueType.UInt32, 2);
  db.upgrade();
  return db;
}

async function main() {
  // 1. Version: does upgrade() give 4.1?
  let t = performance.now();
  const db = newVault(64, 3);
  console.log(`new vault: v${db.versionMajor}.${db.versionMinor} after upgrade()`);
  db.header.versionMinor = 1; // upgrade() stops at 4.0, so BookPass sets 4.1 itself
  console.log(
    `after setting minor: v${db.versionMajor}.${db.versionMinor}, atLeast 4.1 = ${db.versionIsAtLeast(4, 1)}`,
  );

  // 2. BookPass data shapes: group and entry custom data, custom field, tags, custom icon.
  const root = db.getDefaultGroup();
  const folder = db.createGroup(root, 'Reading');
  folder.tags = ['folder-tag'];
  folder.customData = new Map([
    [
      'bp.view',
      { value: JSON.stringify({ layout: 'grid', sort: 'title' }), lastModified: new Date() },
    ],
    ['bp.icon', { value: 'fa-solid:book' }],
  ]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const iconUuid = kdbxweb.KdbxUuid.random();
  db.meta.customIcons.set(iconUuid.id, {
    data: toBuf(png),
    name: 'fa-solid:book',
    lastModified: new Date(),
  });
  folder.customIcon = iconUuid;

  const e = db.createEntry(folder);
  e.fields.set('Title', 'Example');
  e.fields.set('URL', 'https://example.com/');
  e.fields.set('Notes', 'a note');
  e.fields.set('bp.excerpt', 'page description');
  e.fields.set('bp.type', 'article');
  e.tags = ['one', 'two'];
  e.customData = new Map([['bp.order', { value: '0.5' }]]);
  e.customIcon = iconUuid;

  const saved = await db.save();
  console.log(`save (Argon2id 64 MiB x3): ${ms(t)}, ${saved.byteLength} bytes`);

  // 3. Round trip and header check.
  const hv = new DataView(saved);
  console.log(
    `file header: sig ${hv.getUint32(0, true).toString(16)} ${hv.getUint32(4, true).toString(16)} minor ${hv.getUint16(8, true)} major ${hv.getUint16(10, true)}`,
  );
  t = performance.now();
  const back = await kdbxweb.Kdbx.load(saved, creds());
  console.log(`open: ${ms(t)}, v${back.versionMajor}.${back.versionMinor}`);
  const kdf = back.header.kdfParameters!;
  console.log(
    `KDF: uuid ${kdbxweb.ByteUtils.bytesToBase64(kdf.get('$UUID') as ArrayBuffer)} (Argon2id = ${kdbxweb.Consts.KdfId.Argon2id}) M=${(kdf.get('M') as { valueOf(): number }).valueOf() / MiB} MiB I=${(kdf.get('I') as { valueOf(): number }).valueOf()} P=${String(kdf.get('P'))}`,
  );
  const g2 = back.getDefaultGroup().groups.find((g) => g.name === 'Reading')!;
  console.log('group custom data:', JSON.stringify([...(g2.customData ?? [])]));
  console.log(
    'group tags:',
    g2.tags,
    'custom icon kept:',
    back.meta.customIcons.size === 1,
    'group icon ref ok:',
    g2.customIcon?.id === iconUuid.id,
  );
  const e2 = g2.entries[0]!;
  console.log(
    'entry:',
    e2.fields.get('Title'),
    e2.fields.get('bp.excerpt'),
    e2.tags,
    JSON.stringify([...(e2.customData ?? [])]),
  );

  // 4. Wrong password and a flipped byte must fail.
  try {
    await kdbxweb.Kdbx.load(
      saved,
      new kdbxweb.KdbxCredentials(kdbxweb.ProtectedValue.fromString('wrong')),
    );
    console.log('wrong password: OPENED (bad)');
  } catch (err) {
    console.log('wrong password rejected:', (err as kdbxweb.KdbxError).code);
  }
  const tampered = saved.slice(0);
  new Uint8Array(tampered)[tampered.byteLength - 40]! ^= 1;
  try {
    await kdbxweb.Kdbx.load(tampered, creds());
    console.log('tampered file: OPENED (bad)');
  } catch (err) {
    console.log('tampered file rejected:', (err as kdbxweb.KdbxError).code);
  }

  // 5. Merge: two copies diverge, then merge one into the other.
  const a = await kdbxweb.Kdbx.load(saved, creds());
  const b = await kdbxweb.Kdbx.load(saved, creds());
  const aG = a.getDefaultGroup().groups.find((g) => g.name === 'Reading')!,
    bG = b.getDefaultGroup().groups.find((g) => g.name === 'Reading')!;
  const aEntry = aG.entries[0]!;
  const bEntry = bG.entries[0]!;
  aEntry.pushHistory();
  aEntry.fields.set('Title', 'Edited on A');
  aEntry.times.lastModTime = new Date(Date.now() + 1000);
  const added = b.createEntry(bG);
  added.fields.set('Title', 'Added on B');
  const bFolder2 = b.createGroup(b.getDefaultGroup(), 'Only on B');
  bFolder2.customData = new Map([['bp.view', { value: '{"layout":"list"}' }]]);
  b.remove(bEntry); // delete on B, but A edited later: edit should win
  a.merge(b);
  const titles = [...a.getDefaultGroup().allEntries()].map((x) => x.fields.get('Title'));
  console.log(
    'merge: entries',
    titles,
    'groups',
    a.getDefaultGroup().groups.map((g) => g.name),
    'history of edited entry:',
    aEntry.history.length,
  );
  const bFolder = a.getDefaultGroup().groups.find((g) => g.name === 'Only on B');
  console.log('merged group custom data kept:', JSON.stringify([...(bFolder?.customData ?? [])]));
  a.merge(b);
  console.log(
    'merge twice is stable:',
    [...a.getDefaultGroup().allEntries()].length === titles.length,
  );

  // 5b. Does merge carry custom data and tags when the remote side is newer?
  const c = await kdbxweb.Kdbx.load(saved, creds());
  const d = await kdbxweb.Kdbx.load(saved, creds());
  const dG = d.getDefaultGroup().groups.find((g) => g.name === 'Reading')!;
  dG.customData = new Map([['bp.view', { value: '{"layout":"list"}' }]]);
  dG.tags = ['changed-on-d'];
  dG.times.lastModTime = new Date(Date.now() + 5000);
  const dE = dG.entries[0]!;
  dE.customData = new Map([['bp.order', { value: '9.9' }]]);
  dE.fields.set('bp.excerpt', 'edited on D');
  dE.times.lastModTime = new Date(Date.now() + 5000);
  c.merge(d);
  const cG = c.getDefaultGroup().groups.find((g) => g.name === 'Reading')!;
  console.log(
    'remote-newer merge: entry field',
    cG.entries[0]!.fields.get('bp.excerpt'),
    '| entry customData',
    JSON.stringify([...(cG.entries[0]!.customData ?? [])]),
    '| group customData',
    JSON.stringify([...(cG.customData ?? [])]),
    '| group tags',
    cG.tags,
  );

  // 6. Scale: 10,000 entries, then the same with ~5 KB thumbnails (about 50 MB).
  for (const [count, thumbBytes] of [
    [10_000, 0],
    [10_000, 5_000],
  ] as const) {
    const big = newVault(64, 3);
    big.header.versionMinor = 1;
    const r = big.getDefaultGroup();
    const folders = Array.from({ length: 50 }, (_, i) => big.createGroup(r, `Folder ${i}`));
    t = performance.now();
    for (let i = 0; i < count; i++) {
      const en = big.createEntry(folders[i % 50]!);
      en.fields.set('Title', `Bookmark ${i}`);
      en.fields.set('URL', `https://example.com/page/${i}`);
      en.fields.set('Notes', 'x'.repeat(200));
      en.tags = ['t' + (i % 20)];
      if (thumbBytes) {
        const bytes = new Uint8Array(thumbBytes);
        for (let o = 0; o < bytes.length; o += 65536)
          crypto.getRandomValues(bytes.subarray(o, o + 65536));
        const bin = await big.createBinary(toBuf(bytes));
        en.binaries.set('cover.webp', bin);
      }
    }
    const build = ms(t);
    const rss0 = process.memoryUsage().rss;
    t = performance.now();
    const file = await big.save();
    const saveMs = ms(t);
    t = performance.now();
    const loaded = await kdbxweb.Kdbx.load(file, creds());
    const openMs = ms(t);
    const n = [...loaded.getDefaultGroup().allEntries()].length;
    console.log(
      `${count} entries, ${thumbBytes} B thumbs: build ${build}, save ${saveMs}, open ${openMs}, file ${(file.byteLength / MiB).toFixed(1)} MiB, entries back ${n}, rss now ${(process.memoryUsage().rss / MiB).toFixed(0)} MiB (was ${(rss0 / MiB).toFixed(0)})`,
    );
  }
}

await main();
