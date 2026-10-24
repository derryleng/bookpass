# Developing

## Layout

| Path               | Purpose                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| `src/entrypoints/` | Extension entry points required by WXT: background, popup, manager, options |
| `src/`             | Flat modules, one file per module. `src/ui/` holds the React screens        |
| `helper/`          | The native messaging helper, written in Go. It installs itself              |
| `docs/`            | The vault format, the helper protocol, releasing and more                   |
| `scripts/`         | Developer tools: helper registration, store zips                            |
| `tests/`           | Unit tests, end to end checks, fixtures and run output (see TESTING.md)     |

## Build and load

Requires Node 24 or newer (it runs the TypeScript scripts directly) and Go 1.22 or newer.

```bash
npm install
npm run helper:build       # builds helper/bin/bookpass-helper.exe (Windows for now)
npm run helper:register    # the helper installs itself and registers with your browsers (current user only)
npm run build              # .output/chrome-mv3
npm run build:firefox      # .output/firefox-mv3
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome or Brave. The development build has a fixed extension id (see `scripts/ids.ts`), which is what the helper allows. For Firefox run `npm run dev:firefox`. `npm run helper:unregister` undoes the registration. Run `npm run helper:register` again after rebuilding the helper.

## Checks

`npm run check` runs types, lint, unit tests and helper tests. The end to end scripts and what to try by hand are in [TESTING.md](TESTING.md).

## Conventions

- Keep it simple (KISS) and do not repeat yourself (DRY). Use semantic versioning.
- Work happens directly on `main`. Run `npm run check` before pushing. The only workflow is `Release`, which runs on a `v*` tag (see [RELEASING.md](RELEASING.md)).
- Markdown follows GitHub format.
- Commit messages start with a type and a short summary (`feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `revert`), then `-` bullets with the details.
- BookPass is licensed under the GNU General Public License version 3 or later (see `LICENSE`). Libraries and icons it uses are listed in [../THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).
