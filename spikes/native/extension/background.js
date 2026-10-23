// M0 spike: talk to the Go helper, move 50 MB each way, and run Argon2id,
// all from the extension background. Writes a report through the helper.
import { argon2id } from './hash-wasm.js';
import { vaultRoundTrip } from './vault.js';

const api = globalThis.browser ?? globalThis.chrome;
const HOST = 'com.bookpass.spike';
const MiB = 1024 * 1024;
const report = { agent: navigator.userAgent, steps: [] };
globalThis.__report = report; // lets a debugger read progress

let port;
let nextId = 1;
const waiting = new Map();

function connect() {
  port = api.runtime.connectNative(HOST);
  port.onMessage.addListener((msg) => {
    waiting.get(msg.id)?.resolve(msg);
    waiting.delete(msg.id);
  });
  port.onDisconnect.addListener((p) => {
    const err = new Error(
      'disconnected: ' + (p?.error?.message ?? api.runtime.lastError?.message ?? 'no reason'),
    );
    for (const w of waiting.values()) w.reject(err);
    waiting.clear();
    port = undefined;
  });
}

function call(req) {
  if (!port) connect();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    try {
      port.postMessage({ id, ...req });
    } catch (e) {
      waiting.delete(id);
      reject(e);
    }
  });
}

const hasToBase64 = typeof Uint8Array.prototype.toBase64 === 'function';
const hasFromBase64 = typeof Uint8Array.fromBase64 === 'function';

function toB64(bytes) {
  if (hasToBase64) return bytes.toBase64();
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64) {
  if (hasFromBase64) return Uint8Array.fromBase64(b64);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));

async function writeReport() {
  const data = toB64(new TextEncoder().encode(JSON.stringify(report, null, 2)));
  await call({ op: 'log', path: 'report.json', data });
}

async function step(name, fn) {
  const t0 = performance.now();
  try {
    const result = await fn();
    report.steps.push({ name, ok: true, ms: Math.round(performance.now() - t0), ...result });
  } catch (e) {
    report.steps.push({
      name,
      ok: false,
      ms: Math.round(performance.now() - t0),
      error: String(e?.message ?? e),
    });
  }
  await writeReport().catch(() => {}); // keep a partial report in case a later step kills the page
}

async function upload(file, chunk) {
  const sum = await sha256(file);
  let r = await call({ op: 'writeBegin', path: 'vault.kdbx' });
  if (!r.ok) throw new Error(r.error);
  for (let o = 0; o < file.length; o += chunk) {
    r = await call({ op: 'writeChunk', data: toB64(file.subarray(o, o + chunk)) });
    if (!r.ok) throw new Error(r.error);
  }
  r = await call({ op: 'writeCommit', size: file.length, sha256: sum });
  if (!r.ok) throw new Error(r.error);
  return sum;
}

async function download(chunk) {
  const parts = [];
  let total = 0;
  for (let o = 0; ; o += chunk) {
    const r = await call({ op: 'read', path: 'vault.kdbx', offset: o, length: chunk });
    if (!r.ok) throw new Error(r.error);
    const bytes = fromB64(r.data ?? '');
    parts.push(bytes);
    total += bytes.length;
    if (r.eof) break;
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    all.set(p, off);
    off += p.length;
  }
  return all;
}

async function transfer(file, chunk, readChunk = chunk) {
  let t = performance.now();
  const sum = await upload(file, chunk);
  const upMs = Math.round(performance.now() - t);
  t = performance.now();
  const all = await download(readChunk);
  const downMs = Math.round(performance.now() - t);
  return { upMs, downMs, hashMatch: (await sha256(all)) === sum };
}

async function run() {
  report.hasToBase64 = hasToBase64;
  report.hasFromBase64 = hasFromBase64;

  await step('hello', async () => {
    const r = await call({ op: 'hello' });
    return { reply: r };
  });

  for (const [mem, iter] of [
    [64, 3],
    [256, 3],
  ]) {
    await step(`argon2id ${mem} MiB x${iter}`, async () => {
      const out = await argon2id({
        password: new Uint8Array(32).fill(1),
        salt: new Uint8Array(32).fill(2),
        memorySize: mem * 1024,
        iterations: iter,
        parallelism: 2,
        hashLength: 32,
        outputType: 'hex',
      });
      return { out: out.slice(0, 16) };
    });
  }

  const file = new Uint8Array(50 * MiB);
  for (let o = 0; o < file.length; o += 65536) crypto.getRandomValues(file.subarray(o, o + 65536));

  for (const kib of [64, 256, 512, 700]) {
    await step(`50 MiB both ways, ${kib} KiB chunks`, () => transfer(file, kib * 1024));
  }

  // Browser to helper has a much higher limit than helper to browser. Probe both.
  for (const mb of [2, 8, 32]) {
    await step(`one ${mb} MiB chunk browser to helper`, () =>
      transfer(file.subarray(0, mb * MiB), mb * MiB, 512 * 1024).then((r) => ({
        hashMatch: r.hashMatch,
      })),
    );
  }
  for (const bytes of [400_000, 700_000, 760_000, 1_100_000, 4_000_000]) {
    await step(`helper reply with ${bytes} raw bytes`, async () => {
      const r = await call({ op: 'echoOversize', echo: bytes });
      return { gotBytes: fromB64(r.data ?? '').length, ok: r.ok };
    });
  }

  await step('helper reply after an oversize reply', () =>
    call({ op: 'hello' }).then((r) => ({ ok: r.ok })),
  );

  // The real thing: build a 10,000 bookmark vault with thumbnails, save it through the helper, read it back.
  for (const thumb of [0, 5000]) {
    await step(`vault of 10,000 entries, ${thumb} B thumbnails, end to end`, () =>
      vaultRoundTrip({
        count: 10000,
        thumb,
        upload: (b) => upload(b, 512 * 1024),
        download: () => download(512 * 1024),
      }),
    );
  }

  await step('write report', async () => {
    const data = toB64(new TextEncoder().encode(JSON.stringify(report, null, 2)));
    const r = await call({ op: 'log', path: 'report.json', data });
    return { ok: r.ok };
  });
}

run().catch(async (e) => {
  report.fatal = String(e?.message ?? e);
  try {
    await call({
      op: 'log',
      path: 'report.json',
      data: toB64(new TextEncoder().encode(JSON.stringify(report, null, 2))),
    });
  } catch {
    /* nothing more to try */
  }
});
