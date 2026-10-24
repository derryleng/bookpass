# BookPass

BookPass is a browser extension for Chrome, Edge, Brave and Firefox that keeps your bookmarks in an encrypted KeePass KDBX 4.1 file on your own disk. A small native helper reads and writes the file. The extension makes no network requests, and the file opens in KeePassXC and KeePass too.

The project is at version 0.0.x and not released yet. The features of the plan are built (see `CHANGELOG.md`). The end to end checks pass with Chrome and Firefox on Windows and on Ubuntu (Chrome, and Firefox as a Snap). Edge and Brave, Flatpak browsers and macOS have not been tried yet (see `docs/TESTING.md`).

## What it does

- Keeps everything in one encrypted vault file, with a master password and an optional key file.
- Saves the page you are on (toolbar button, right click menu, `Alt+Shift+B`, or all open tabs) with its icon and a cover picture. Only the `activeTab` permission is used.
- Folders with icons and colors, tags, favorites, notes, trash, earlier versions of each bookmark, search, four layouts, sorting and manual order, drag and drop, bulk editing.
- Locks when you choose: when the browser closes, after inactivity, when the computer is idle, every time, or never.
- Merges changes made on another computer, by a sync tool or by KeePassXC. Imports and exports bookmark files.

## Layout

| Path               | Purpose                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| `src/entrypoints/` | Extension entry points required by WXT: background, popup, manager, options |
| `src/`             | Flat modules, one file per module. `src/ui/` holds the React screens        |
| `helper/`          | The native messaging helper, written in Go. It installs itself              |
| `docs/`            | The vault format, the helper protocol, security, releasing and more         |
| `scripts/`         | Developer tools: helper registration, the end to end checks, store zips     |
| `tests/fixtures/`  | Golden vault files made by BookPass and by KeePassXC                        |
| `spikes/`          | The M0 experiments, each with a README of its findings                      |

## Develop

Requires Node 24 or newer (it runs the TypeScript scripts directly) and Go 1.22 or newer.

```bash
npm install
npm run helper:build       # builds helper/bin/bookpass-helper.exe (Windows for now)
npm run helper:register    # the helper installs itself and registers with your browsers (current user only)
npm run build              # .output/chrome-mv3
npm run build:firefox      # .output/firefox-mv3
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome, Edge or Brave. The development build has a fixed extension id (see `scripts/ids.ts`), which is what the helper allows. For Firefox run `npm run dev:firefox`. `npm run helper:unregister` undoes the registration. Run `npm run helper:register` again after rebuilding the helper.

Checks:

```bash
npm run check              # types, lint, unit tests and helper tests
npm run e2e                # Chrome, the real helper and KeePassXC (Windows)
npm run e2e:more           # key files, import, tags, history, merging, backups, password change
npm run e2e:a11y           # accessibility, light and dark
npm run e2e:security       # storage, network, who may use the helper, the manifest
npm run e2e:firefox        # the same kind of run in Firefox
```

## Documents

- [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md): what a new person goes through, from install to the first bookmark.
- [docs/FORMAT.md](docs/FORMAT.md): how bookmarks sit in a KDBX file.
- [docs/PROTOCOL.md](docs/PROTOCOL.md): the messages between the extension and the helper.
- [docs/SECURITY.md](docs/SECURITY.md): what is protected, how, and the review.
- [docs/TESTING.md](docs/TESTING.md): the automatic checks and what to try by hand.
- [docs/PARITY.md](docs/PARITY.md): what is taken from Raindrop.io and what is left out.
- [docs/RELEASING.md](docs/RELEASING.md): releases, signing and the stores, and what the maintainer provides.
- [docs/STORE.md](docs/STORE.md) and [docs/PRIVACY.md](docs/PRIVACY.md): listing text and the privacy policy.
- [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md): icons and libraries.

## Conventions

- Keep it simple (KISS) and do not repeat yourself (DRY).
- Semantic versioning. Work happens on `dev` and feature branches cut from `dev`. `main` changes only through a pull request from `dev` after review.
- Markdown follows GitHub format.
