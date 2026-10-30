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

Load `.output/chrome-mv3` as an unpacked extension in Chrome or Brave. The development build has a fixed extension id (see `scripts/ids.ts`). `helper:build` compiles the helper with `-tags dev`, which adds that id (from `helper/ids.dev.json`) to the extensions the helper allows. Release helpers are built without the tag and do not accept it. For Firefox run `npm run dev:firefox`. `npm run helper:unregister` undoes the registration. Run `npm run helper:register` again after rebuilding the helper.

## Styling and themes

- Styling is Tailwind CSS v4 utility classes written in the components. There are no named CSS classes and no other stylesheets. Classes used in many places live in `src/ui/cls.ts`.
- The end to end tests find elements by tag, role, label and text (`article`, `nav button`, `[role=toolbar]`, `dialog[open] footer button`), never by class. Use real elements and roles when markup is added, and the tests stay readable.
- Colours come from variables in `src/ui/theme.css`: neutral colours per mode (`data-mode`) and accent colours per theme (`data-theme`). Use the named colours (`bg-surface`, `text-muted`, `border-line`) and never fixed colours, so every theme works.
- The theme toggle (system, light, dark) picks the mode. The settings page picks which light theme and which dark theme are used. To add a theme, add its name to `themeNames` in `src/themes.ts` and copy an accent block in `theme.css` named `light-name` or `dark-name` (the name in lower case). A unit test fails if a name has no block.

## Checks

`npm run check` runs types, lint, unit tests and helper tests. The end to end scripts and what to try by hand are in [TESTING.md](TESTING.md).

## Conventions

- Keep it simple (KISS) and do not repeat yourself (DRY). Use semantic versioning.
- Work happens directly on `main`. Run `npm run check` before pushing. The only workflow is `Release`, which runs on a `v*` tag (see [RELEASING.md](RELEASING.md)).
- Markdown follows GitHub format.
- Commit messages start with a type and a short summary (`feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `revert`), then `-` bullets with the details.
- BookPass is licensed under the GNU General Public License version 3 or later (see `LICENSE`). Libraries and icons it uses are listed in [../THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).
