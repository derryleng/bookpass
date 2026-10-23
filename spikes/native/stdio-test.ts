// Drives the helper over stdio the way a browser does, without a browser.
// Moves a 50 MB file up and down in chunks and checks the hash.
// Run: node spikes/native/stdio-test.ts
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface Reply {
  ok: boolean;
  error?: string;
  data?: string;
  eof?: boolean;
  [key: string]: unknown;
}

const dir = mkdtempSync(join(tmpdir(), 'bookpass-'));
const helper = spawn('spikes/native/helper/bin/bookpass-helper.exe', [], {
  env: { ...process.env, BOOKPASS_SPIKE_DIR: dir },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let pending = Buffer.alloc(0);
const waiting = new Map<number, (m: Reply) => void>();
helper.stdout.on('data', (d: Buffer) => {
  pending = Buffer.concat([pending, d]);
  while (pending.length >= 4 && pending.length >= 4 + pending.readUInt32LE(0)) {
    const n = pending.readUInt32LE(0);
    const msg = JSON.parse(pending.subarray(4, 4 + n).toString());
    pending = pending.subarray(4 + n);
    waiting.get(msg.id)?.(msg);
  }
});

let nextId = 1;
function call(req: Record<string, unknown>): Promise<Reply> {
  const id = nextId++;
  const body = Buffer.from(JSON.stringify({ id, ...req }));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    helper.stdin.write(Buffer.concat([head, body]));
  });
}

console.log('hello', await call({ op: 'hello' }));
const file = randomBytes(50 * 1024 * 1024);
const sha = createHash('sha256').update(file).digest('hex');

for (const chunk of [64 * 1024, 256 * 1024, 512 * 1024, 700 * 1024]) {
  let t = performance.now();
  await call({ op: 'writeBegin', path: 'vault.kdbx' });
  for (let o = 0; o < file.length; o += chunk) {
    const r = await call({
      op: 'writeChunk',
      data: file.subarray(o, o + chunk).toString('base64'),
    });
    if (!r.ok) throw new Error(r.error);
  }
  const c = await call({ op: 'writeCommit', size: file.length, sha256: sha });
  const up = performance.now() - t;
  t = performance.now();
  const parts: Buffer[] = [];
  for (let o = 0; ; o += chunk) {
    const r = await call({ op: 'read', path: 'vault.kdbx', offset: o, length: chunk });
    if (!r.ok) throw new Error(r.error);
    parts.push(Buffer.from(r.data ?? '', 'base64'));
    if (r.eof) break;
  }
  const down = performance.now() - t;
  const ok = createHash('sha256').update(Buffer.concat(parts)).digest('hex') === sha;
  console.log(
    `chunk ${chunk / 1024} KiB: commit ok=${c.ok}, up ${up.toFixed(0)} ms, down ${down.toFixed(0)} ms, hash match=${ok}`,
  );
}
console.log(
  'bad hash:',
  await call({ op: 'writeBegin', path: 'x.kdbx' })
    .then(() => call({ op: 'writeChunk', data: 'AAAA' }))
    .then(() => call({ op: 'writeCommit', size: 3, sha256: 'ff' })),
);
console.log(
  'outside root:',
  await call({ op: 'read', path: '../../secret', offset: 0, length: 10 }),
);
console.log('1.5 MB reply:', await call({ op: 'echo', echo: 1_200_000 }).then((r) => r));
helper.stdin.end();
