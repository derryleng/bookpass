# BookPass

BookPass is a browser extension for Chrome, Edge and Firefox that keeps your bookmarks in an encrypted KeePass KDBX 4.1 file on your own disk. A small native helper reads and writes the file. The extension makes no network requests, and the file opens in KeePassXC and KeePass too.

The project is at version 0.0.x and not released yet. See the milestones in the project plan.

## What works now

- Create or unlock a vault, with a master password.
- Save the page you are on from the toolbar button, with its title, a site icon, and a cover picture (the page's preview image, or a screenshot of the tab). Only the `activeTab` permission is used.
- Folders and subfolders with icons and colors, tags, favorites, a trash with restore, search, and list, grid, headlines and masonry layouts with sorting.
- Settings for when the vault locks again: when the browser closes, after a period of inactivity, when the computer is idle or locked, every time you close it, or never.
- Saves are written through the helper atomically, with rotating backups, and changes made to the file elsewhere (a sync tool, KeePassXC) are merged.

## Layout

| Path               | Purpose                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| `src/entrypoints/` | Extension entry points required by WXT: background, popup, manager, options |
| `src/`             | Flat modules, one file per module. `src/ui/` holds the React screens        |
| `helper/`          | The native messaging helper, written in Go                                  |
| `docs/`            | The vault format and the helper protocol                                    |
| `scripts/`         | Developer tools: registering the helper, the end to end test                |
| `spikes/`          | The M0 experiments, each with a README of its findings                      |

## Develop

Requires Node 22.18 or newer and Go 1.22 or newer.

```bash
npm install
npm run helper:build       # builds helper/bin/bookpass-helper
npm run helper:register    # lets Chrome, Edge and Firefox start it (current user only)
npm run build              # .output/chrome-mv3
npm run build:firefox      # .output/firefox-mv3
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome or Edge, or run `npm run dev:firefox` for Firefox. The unpacked Chrome build has a fixed extension id (see `scripts/ids.ts`), which is what the helper's manifest allows. `npm run helper:unregister` undoes the registration.

Checks:

```bash
npm run typecheck
npm run lint
npm test                   # unit tests
npm run helper:test        # helper tests
npm run e2e                # builds nothing: drives the built Chrome extension with the real helper
```

## Documents

- [docs/FORMAT.md](docs/FORMAT.md): how bookmarks sit in a KDBX file.
- [docs/PROTOCOL.md](docs/PROTOCOL.md): the messages between the extension and the helper.
- [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md): icons and libraries.

## Conventions

- Keep it simple (KISS) and do not repeat yourself (DRY).
- Semantic versioning. Work happens on `dev` and feature branches cut from `dev`. `main` changes only through a pull request from `dev` after review.
- Markdown follows GitHub format.
