// Does KeePassXC open a BookPass vault and keep BookPass data when it saves?
// Needs keepassxc-cli. Run: node spikes/kdbx/interop.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as kdbxweb from 'kdbxweb';
import { argon2id } from 'hash-wasm';

const cli = 'C:/Program Files/KeePassXC/keepassxc-cli.exe';
const dir = join(import.meta.dirname, '../../tests/output/spikes/kdbx');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const file = join(dir, 'interop.kdbx');
const password = 'correct horse';

kdbxweb.CryptoEngine.setArgon2Impl(async (pw, salt, memory, iterations, length, parallelism) => {
  const out = await argon2id({
    password: new Uint8Array(pw),
    salt: new Uint8Array(salt),
    memorySize: memory,
    iterations,
    parallelism,
    hashLength: length,
    outputType: 'binary',
  });
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
});
const creds = () => new kdbxweb.KdbxCredentials(kdbxweb.ProtectedValue.fromString(password));
const xc = (...args: string[]) =>
  execFileSync(cli, args, { input: password + '\n', encoding: 'utf8' });

// 1. BookPass writes a vault.
const db = kdbxweb.Kdbx.create(creds(), 'BookPass');
db.setKdf(kdbxweb.Consts.KdfId.Argon2id);
db.upgrade();
db.header.versionMinor = 1;
const folder = db.createGroup(db.getDefaultGroup(), 'Reading');
folder.customData = new Map([['bp.view', { value: '{"layout":"grid"}' }]]);
folder.tags = ['folder-tag'];
const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const icon = kdbxweb.KdbxUuid.random();
db.meta.customIcons.set(icon.id, {
  data: png.buffer as ArrayBuffer,
  name: 'dot',
  lastModified: new Date(),
});
folder.customIcon = icon;
const e = db.createEntry(folder);
e.fields.set('Title', 'Example');
e.fields.set('URL', 'https://example.com/');
e.fields.set('bp.excerpt', 'page description');
e.tags = ['one'];
e.customData = new Map([['bp.order', { value: '0.5' }]]);
e.customIcon = icon;
writeFileSync(file, Buffer.from(await db.save()));

// 2. KeePassXC reads it.
console.log('KeePassXC version', xc('--version').trim());
console.log(xc('ls', '-q', '-R', file).trim());
console.log(xc('show', '-q', '-s', file, 'Reading/Example').trim());

// 3. KeePassXC edits and saves (adds an entry), then BookPass reads it back.
xc('add', '-q', file, '--url', 'https://added.example/', 'Reading/Added by KeePassXC');
const back = await kdbxweb.Kdbx.load(new Uint8Array(readFileSync(file)).buffer, creds());
const g = back.getDefaultGroup().groups.find((x) => x.name === 'Reading')!;
const ex = g.entries.find((x) => x.fields.get('Title') === 'Example')!;
console.log(
  `after KeePassXC save: v${back.versionMajor}.${back.versionMinor}, kdf ${kdbxweb.ByteUtils.bytesToBase64(back.header.kdfParameters!.get('$UUID') as ArrayBuffer)}`,
);
console.log(
  'entries:',
  g.entries.map((x) => x.fields.get('Title')),
);
console.log('bp.excerpt kept:', ex.fields.get('bp.excerpt'));
console.log('entry customData kept:', JSON.stringify([...(ex.customData ?? [])]));
console.log(
  'group customData kept:',
  JSON.stringify([...(g.customData ?? [])]),
  'tags',
  g.tags,
  'entry tags',
  ex.tags,
);
console.log(
  'custom icon kept:',
  back.meta.customIcons.size,
  'entry icon ref:',
  ex.customIcon?.id === icon.id,
  'group icon ref:',
  g.customIcon?.id === icon.id,
);

// 4. A vault made by KeePassXC opens in BookPass.
const fromXc = join(dir, 'from-keepassxc.kdbx');
execFileSync(cli, ['db-create', '-q', '-p', fromXc], {
  input: `${password}\n${password}\n`,
  encoding: 'utf8',
});
const opened = await kdbxweb.Kdbx.load(new Uint8Array(readFileSync(fromXc)).buffer, creds());
console.log(
  `KeePassXC-made vault: v${opened.versionMajor}.${opened.versionMinor}, kdf ${opened.header.kdfParameters ? kdbxweb.ByteUtils.bytesToBase64(opened.header.kdfParameters.get('$UUID') as ArrayBuffer) : 'none in header (KDBX 3)'}, opened by kdbxweb`,
);
