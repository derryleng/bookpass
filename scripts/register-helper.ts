// Registers the built helper with Chrome, Edge and Firefox for the current user (no administrator rights).
// Development convenience until the installers exist.
//
//   node scripts/register-helper.ts            register
//   node scripts/register-helper.ts --remove   undo
//
// Build the helper first: cd helper && go build -o bin/bookpass-helper.exe .
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { chromeId, firefoxId, hostName } from './ids.ts';

const remove = process.argv.includes('--remove');
const exe = resolve(
  import.meta.dirname,
  '../helper/bin',
  platform() === 'win32' ? 'bookpass-helper.exe' : 'bookpass-helper',
);

if (!remove && !existsSync(exe)) throw new Error(`Build the helper first: ${exe} is missing`);

const base = { name: hostName, description: 'BookPass native helper', path: exe, type: 'stdio' };
const chromeManifest = { ...base, allowed_origins: [`chrome-extension://${chromeId}/`] };
const firefoxManifest = { ...base, allowed_extensions: [firefoxId] };

interface Target {
  name: string;
  manifest: object;
  file: string; // where the manifest json lives
  regKey?: string; // Windows registry key that points at it
}

function targets(): Target[] {
  const home = homedir();
  if (platform() === 'win32') {
    const dir = join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'BookPass');
    const reg = (vendor: string) => `HKCU\\Software\\${vendor}\\NativeMessagingHosts\\${hostName}`;
    return [
      {
        name: 'Chrome',
        manifest: chromeManifest,
        file: join(dir, 'host-chrome.json'),
        regKey: reg('Google\\Chrome'),
      },
      {
        name: 'Edge',
        manifest: chromeManifest,
        file: join(dir, 'host-chrome.json'),
        regKey: reg('Microsoft\\Edge'),
      },
      {
        name: 'Firefox',
        manifest: firefoxManifest,
        file: join(dir, 'host-firefox.json'),
        regKey: reg('Mozilla'),
      },
    ];
  }
  const mac = platform() === 'darwin';
  const support = join(home, 'Library', 'Application Support');
  const dirs = mac
    ? {
        chrome: join(support, 'Google/Chrome'),
        edge: join(support, 'Microsoft Edge'),
        firefox: join(support, 'Mozilla'),
      }
    : {
        chrome: join(home, '.config/google-chrome'),
        edge: join(home, '.config/microsoft-edge'),
        firefox: join(home, '.mozilla'),
      };
  const sub = 'NativeMessagingHosts';
  return [
    { name: 'Chrome', manifest: chromeManifest, file: join(dirs.chrome, sub, `${hostName}.json`) },
    { name: 'Edge', manifest: chromeManifest, file: join(dirs.edge, sub, `${hostName}.json`) },
    {
      name: 'Firefox',
      manifest: firefoxManifest,
      file: join(dirs.firefox, mac ? sub : 'native-messaging-hosts', `${hostName}.json`),
    },
  ];
}

for (const t of targets()) {
  if (remove) {
    if (t.regKey) {
      try {
        execFileSync('reg', ['delete', t.regKey, '/f'], { stdio: 'ignore' });
      } catch {
        /* was not registered */
      }
    }
    rmSync(t.file, { force: true });
  } else {
    mkdirSync(dirname(t.file), { recursive: true });
    writeFileSync(t.file, JSON.stringify(t.manifest, null, 2));
    if (t.regKey)
      execFileSync('reg', ['add', t.regKey, '/ve', '/t', 'REG_SZ', '/d', t.file, '/f'], {
        stdio: 'ignore',
      });
  }
  console.log(`${remove ? 'Removed' : 'Registered'} ${t.name}: ${t.file}`);
}
