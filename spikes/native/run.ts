// Runs the native messaging spike in one browser on Windows.
//
//   node spikes/native/run.ts chrome|edge|firefox
//
// Registers the helper for the current user only (HKCU, no administrator
// rights), starts the browser with a throwaway profile and the spike extension,
// waits for the extension to write report.json through the helper, prints it,
// and removes the registration again.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const browser = process.argv[2] as 'chrome' | 'edge' | 'firefox';
const timeoutMs = 180_000;
const root = resolve(import.meta.dirname, '../..');
const ext = join(root, 'spikes/native/extension');
const helper = join(root, 'spikes/native/helper/bin/bookpass-helper.exe');
const out = join(root, 'tests/output/spikes/native', browser);
const hostName = 'com.bookpass.spike';
const chromeId = 'ndpefeoncgmemiofijbmljmmlbfkdcif'; // derived from the key in extension/manifest.json
const firefoxId = 'bookpass-spike@local';

if (!existsSync(helper))
  throw new Error(
    'Build the helper first: cd spikes/native/helper && go build -o bin/bookpass-helper.exe .',
  );
copyFileSync(join(root, 'node_modules/hash-wasm/dist/index.esm.js'), join(ext, 'hash-wasm.js'));
execFileSync('npx.cmd', ['rolldown', '-c', 'spikes/native/rolldown.config.js'], {
  cwd: root,
  stdio: 'ignore',
  shell: true,
});
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const manifestPath = join(out, 'host.json');
writeFileSync(
  manifestPath,
  JSON.stringify({
    name: hostName,
    description: 'BookPass spike helper',
    path: helper,
    type: 'stdio',
    ...(browser === 'firefox'
      ? { allowed_extensions: [firefoxId] }
      : { allowed_origins: [`chrome-extension://${chromeId}/`] }),
  }),
);

const regKey = {
  chrome: `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`,
  edge: `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${hostName}`,
  firefox: `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${hostName}`,
}[browser];
execFileSync('reg', ['add', regKey, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], {
  stdio: 'ignore',
});

const env = { ...process.env, BOOKPASS_SPIKE_DIR: out };
let close = async () => {};
try {
  if (browser === 'firefox') {
    const child = spawn(
      'npx.cmd',
      [
        'web-ext',
        'run',
        '--source-dir',
        ext,
        '--firefox',
        '"C:\\Program Files\\Mozilla Firefox\\firefox.exe"',
        '--no-input',
        '--no-reload',
        '--arg=-headless',
        '--start-url',
        'about:blank',
      ],
      { cwd: root, env, stdio: 'ignore', shell: true },
    );
    close = async () =>
      void execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
  } else {
    const executablePath =
      browser === 'chrome'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const b = await puppeteer.launch({
      executablePath,
      headless: true,
      pipe: true,
      enableExtensions: [ext],
      userDataDir: join(out, 'profile'),
      env,
    });
    close = () => b.close();
  }
  const report = join(out, 'report.json');
  const deadline = Date.now() + timeoutMs;
  while (
    !(existsSync(report) && readFileSync(report, 'utf8').includes('write report')) &&
    Date.now() < deadline
  )
    await new Promise((r) => setTimeout(r, 1000));
  console.log(
    existsSync(report) ? readFileSync(report, 'utf8') : `No report after ${timeoutMs / 1000} s`,
  );
} finally {
  await close().catch(() => {});
  try {
    execFileSync('taskkill', ['/F', '/IM', 'bookpass-helper.exe'], { stdio: 'ignore' });
  } catch {
    /* none running */
  }
  execFileSync('reg', ['delete', regKey, '/f'], { stdio: 'ignore' });
}
