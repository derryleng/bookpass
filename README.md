# BookPass

A browser extension for Chrome, Brave and Firefox that stores bookmarks in an encrypted kdbx file on your own computer.

Features:

- Save the current page or all tabs
- Folders with icons and colors, tags, favorites, notes, search, four layouts, trash, earlier versions of each bookmark
- Optional key file, configurable locking
- Import from browser bookmarks, HTML or CSV, and export to HTML, CSV or JSON

## Getting started

Browsers cannot write to the kdbx file, so a small helper program is used.

### 1. Install the extension

From the browser store once it is published, or by loading the build as an unpacked extension (Chrome, Brave) or a temporary add-on (Firefox).

### 2. Install the helper

Browsers cannot write to a file you choose, so a small helper program does it. The first screen gives the steps:

1. Download the helper for your system from the GitHub releases page.
2. Run it once. On Windows, double click it. On macOS and Linux, run `./bookpass-helper` in a terminal (on macOS run `xattr -d com.apple.quarantine bookpass-helper` first, because the program is not signed yet). It copies itself to a folder for your user only and registers with Chrome, Brave, Vivaldi, Chromium and Firefox, whichever are installed.
3. Go back to the extension and press Check again.

During development `npm run helper:register` does step 2.

### 3. Create the vault

The file goes in `.bookpass/bookmarks.kdbx` in your home folder by default. "Use a different file" takes a full path ending in `.kdbx`.

## Privacy

Bookmarks exist only in the vault file in the place you choose. The helper only sees encrypted data. Settings are kept in the browser's extension storage. The unlock key (a hash of the master password) is kept in memory while unlocked and is written to disk only with the "never lock" setting.

The extension reads a page only when you save it. The only network requests are the picture fetches you start with a button (for one bookmark, a folder, a selection or everything). Those ask for permission to reach all sites, and removes permissions when done. They never go to a favicon service or any other third party, and nothing is fetched automatically, not even after an import.

## Security

The vault is KDBX 4.1 with Argon2id (256 MiB, 3 iterations), so a copy of the file from a disk, backup or sync service is protected by the master password and the optional key file. BookPass does not protect against malware running as you on an unlocked computer, against a weak password, or, with "never lock", against anyone who can read your browser profile. A lost password cannot be recovered.

The helper reads and writes one configured file, never opens network connections, and only the BookPass extension may start it. The extension holds no site permissions at rest, has no content scripts and has no remote code.

## Documents

- [docs/FORMAT.md](docs/FORMAT.md): how bookmarks are stored in the KeePass file.
- [docs/PROTOCOL.md](docs/PROTOCOL.md): the helper protocol.
- [docs/DEVELOPING.md](docs/DEVELOPING.md), [docs/TESTING.md](docs/TESTING.md), [docs/RELEASING.md](docs/RELEASING.md), [docs/STORE.md](docs/STORE.md): working on BookPass.
