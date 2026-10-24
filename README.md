# BookPass

A browser extension for Chrome, Brave and Firefox that stores bookmarks in an encrypted KeePass (KDBX 4.1) file on your own computer. KeePassXC and KeePass can open the same file. There is no account, no server and no sync service of its own.

Features: save the current page or all tabs, folders with icons and colors, tags, favorites, notes, search, four layouts, trash, earlier versions of each bookmark, optional key file, configurable locking, import from browser bookmarks, HTML or CSV, and export to HTML, CSV or JSON. To use the vault on several computers, put the file in a folder that Syncthing, OneDrive or Dropbox keeps in step. Changes made on another computer, by a sync tool or in KeePassXC are merged.

## Install

Browsers cannot write to a file you choose, so a small helper program (written in Go) does it. Install the extension, then download the helper from the [releases page](https://github.com/derryleng/bookpass/releases) and run it once. It copies itself to a per-user folder and registers with the browsers it finds, with no administrator rights. The extension's first screen walks through the rest. See [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md).

## Privacy

BookPass has no server, no analytics and no telemetry. Bookmarks exist only in the vault file in the place you choose. The helper only sees encrypted data. Settings are kept in the browser's extension storage. The unlock key (a hash of the master password) is kept in memory while unlocked and is written to disk only with the "never lock" setting.

The extension reads a page only when you save it. The only network requests are the picture fetches you start with a button (for one bookmark, a folder, a selection or everything). Those ask for permission to reach all sites, hand it back when done, go to the bookmarked sites over https with no cookies, no referrer and no cache, and list the sites first for a bulk fetch. They never go to a favicon service or any other third party, and nothing is fetched automatically, not even after an import.

## Security

The vault is KDBX 4.1 with Argon2id (256 MiB, 3 iterations), so a copy of the file from a disk, backup or sync service is protected by the master password and the optional key file. BookPass does not protect against malware running as you on an unlocked computer, against a weak password, or, with "never lock", against anyone who can read your browser profile. A lost password cannot be recovered.

The background script owns the vault, the key and all cryptography. The helper reads and writes one configured file, never opens network connections, and only the BookPass extension may start it. The extension holds no site permissions at rest, has no content scripts and has no remote code. The permissions it asks for are in `wxt.config.ts`. No outside security review has been done and the code has not been fuzzed. Report problems as an issue on GitHub.

## Status

Version 0.1.0. The helper is not signed, so Windows and macOS warn the first time. It has been tried with Chrome and Firefox on Windows and Ubuntu, and with Brave on macOS. Flatpak browsers and Firefox or Chrome on macOS have not been tried.

## Documents

- [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md): installing and first use.
- [docs/FORMAT.md](docs/FORMAT.md): how bookmarks are stored in the KeePass file.
- [docs/PROTOCOL.md](docs/PROTOCOL.md): the helper protocol.
- [docs/DEVELOPING.md](docs/DEVELOPING.md), [docs/TESTING.md](docs/TESTING.md), [docs/RELEASING.md](docs/RELEASING.md), [docs/STORE.md](docs/STORE.md): working on BookPass.

## License

[GNU General Public License version 3 or later](LICENSE). Libraries and icons are credited in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
