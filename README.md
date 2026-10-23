# BookPass

BookPass is a browser extension for Chrome and Firefox that keeps bookmarks in an encrypted KeePass KDBX 4.1 file on your own disk. A small native helper reads and writes the file. The extension makes no network requests.

This repository is at milestone M0 (setup and spikes). Nothing is released yet.

## Layout

| Path               | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `src/entrypoints/` | Extension entry points required by WXT: background, popup, manager |
| `src/`             | Flat modules, one file per module (added from M1)                  |
| `helper/`          | Native messaging helper written in Go                              |
| `spikes/`          | Throwaway experiments for M0, each with its own README of findings |
| `docs/`            | Project documentation                                              |

## Develop

Requires Node 22 or newer. The helper also needs Go 1.22 or newer.

```bash
npm install
npm run dev            # Chrome with hot reload
npm run dev:firefox    # Firefox with hot reload
npm run build          # .output/chrome-mv3
npm run build:firefox  # .output/firefox-mv3
npm run typecheck
npm run lint
npm test
```

## Conventions

- Keep it simple (KISS) and do not repeat yourself (DRY).
- Semantic versioning. Work happens on `dev` and feature branches cut from `dev`. `main` changes only through a pull request from `dev`.
- Markdown follows GitHub format.
