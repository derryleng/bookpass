// Prints the spike extension's progress from its Chrome service worker, for when run.ts finds no report.
// Run: node spikes/native/debug.ts   (after run.ts has written out/chrome/host.json)
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const ext = join(import.meta.dirname, 'extension');
const out = join(import.meta.dirname, '../../tests/output/spikes/native/chrome');
const key = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.bookpass.spike';
execFileSync('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', join(out, 'host.json'), '/f'], {
  stdio: 'ignore',
});
try {
  const b = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    pipe: true,
    enableExtensions: [ext],
    userDataDir: join(import.meta.dirname, '../../tests/output/spikes/native/dbg-profile'),
    env: { ...process.env, BOOKPASS_SPIKE_DIR: out },
  });
  const target = await b
    .waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('ndpefeon'), {
      timeout: 15000,
    })
    .catch(() => undefined);
  const worker = await target?.worker();
  worker?.on('console', (m) => console.log('console:', m.text()));
  console.log(
    await worker
      ?.evaluate("import('./vault.js').then(() => 'import ok', (e) => 'import failed: ' + e)")
      .catch((e) => String(e)),
  );
  for (let i = 0; i < 1; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    console.log(
      await worker
        ?.evaluate(
          'JSON.stringify(globalThis.__report?.steps?.map((s) => s.name + (s.ok ? " ok " : " FAIL ") + (s.error ?? "")))',
        )
        .catch((e) => String(e)),
    );
  }
  await b.close();
} finally {
  execFileSync('reg', ['delete', key, '/f'], { stdio: 'ignore' });
  try {
    execFileSync('taskkill', ['/F', '/IM', 'bookpass-helper.exe'], { stdio: 'ignore' });
  } catch {
    /* none running */
  }
}
