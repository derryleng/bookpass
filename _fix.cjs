const fs = require('fs');
function edit(file, pairs) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) throw new Error(`missing in ${file}: ${a.slice(0, 70)}`);
    s = s.replace(a, b);
  }
  fs.writeFileSync(file, s);
}

edit('tests/e2e/firefox.ts', [
  [
    "  try {\n    const listing = execFileSync(keepassxcCli, ['ls', '-q', '-R', vaultPath]",
    "  // A Snap Firefox starts the helper through a portal with a clean environment, so the vault lands in the default\n  // place instead of the throwaway one.\n  const defaultVault = join(homedir(), '.bookpass', 'bookmarks.kdbx');\n  const written = existsSync(vaultPath) ? vaultPath : defaultVault;\n  try {\n    const listing = execFileSync(keepassxcCli, ['ls', '-q', '-R', written]",
  ],
  [
    "import { execFileSync } from 'node:child_process';",
    "import { execFileSync } from 'node:child_process';\nimport { existsSync } from 'node:fs';\nimport { homedir } from 'node:os';",
  ],
]);

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts['e2e:firefox'] = 'node tests/e2e/firefox.ts';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

edit('docs/TESTING.md', [
  [
    '| `npm run e2e:perf` |',
    '| `npm run e2e:firefox` | Firefox with a build made only for the test (it opens its own manager and popup, since a script cannot press the toolbar button): creating and unlocking a vault, saving pages with covers and icons, the lock setting, KeePassXC opening the result |\n| `npm run e2e:perf` |',
  ],
  [
    'The Chrome end to end scripts need Windows, Chrome and KeePassXC in their default folders.',
    'The end to end scripts run on Windows and Linux (they look for Chrome, Firefox and `keepassxc-cli` in the usual places; set `BOOKPASS_CHROME` or `BOOKPASS_FIREFOX` to use another). On Linux use Node 24 or newer, and for a Snap Firefox set `BOOKPASS_FIREFOX=/snap/bin/firefox`. They have not been run on macOS.',
  ],
  [
    'Firefox, macOS and Linux have only had the spike (helper link, Argon2 and the vault code), so they need the whole list.',
    'The scripts have run on Windows (Chrome 156, Firefox 158) and on Ubuntu 26.04 in WSL (Chrome 156, Firefox 158 as a Snap). Flatpak browsers, macOS, Edge and Brave have not had the whole list.',
  ],
]);

edit('README.md', [
  [
    'Chrome and Edge are tested end to end on Windows. The Firefox build passes `web-ext lint` and its helper link, Argon2 and vault code were proven in the M0 spike, but its screens, and macOS and Linux, have not been tried yet (see `docs/TESTING.md`).',
    'The end to end checks pass with Chrome and Firefox on Windows and on Ubuntu (Chrome, and Firefox as a Snap). Edge and Brave, Flatpak browsers and macOS have not been tried yet (see `docs/TESTING.md`).',
  ],
  [
    'npm run e2e:security       # storage, network, who may use the helper, the manifest',
    'npm run e2e:security       # storage, network, who may use the helper, the manifest\nnpm run e2e:firefox        # the same kind of run in Firefox',
  ],
]);
console.log('ok');
