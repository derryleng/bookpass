# Testing

Everything a test reads or writes is under `tests/`, except the Go tests, which sit next to the code in `helper/`.

| Path              | Contents                                                                      |
| ----------------- | ----------------------------------------------------------------------------- |
| `tests/unit/`     | Unit tests, run by `npm test`                                                 |
| `tests/e2e/`      | End to end scripts that drive a real browser, and their shared `lib.ts`       |
| `tests/fixtures/` | Committed inputs: golden vaults, a key file, a bookmarks file                 |
| `tests/output/`   | Everything a run writes (screenshots, throwaway vaults and profiles). Ignored |

## Commands

| Command                | Checks                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run check`        | Types, lint, unit tests and helper tests                                                          |
| `npm run e2e:all`      | Every script below except Firefox and perf                                                        |
| `npm run e2e`          | Chrome with the built extension and the helper: first run, saving, locking                        |
| `npm run e2e:more`     | Key files, import, tags, history, outside changes, conflict copies, backups                       |
| `npm run e2e:a11y`     | axe-core on every screen in both themes                                                           |
| `npm run e2e:move`     | Moving the vault                                                                                  |
| `npm run e2e:view`     | The View menu, sections and the heading tick box                                                  |
| `npm run e2e:pictures` | Picture dialogs and fetching, using a build made for the test                                     |
| `npm run e2e:security` | Storage, network, who may use the helper, and the manifest                                        |
| `npm run e2e:firefox`  | Firefox with a build made for the test                                                            |
| `npm run e2e:perf`     | A 10,000 bookmark vault. Make it first with `PERF_VAULT=1 npx vitest run tests/unit/perf.test.ts` |

Rebuild the golden vaults with `UPDATE_FIXTURES=1 npx vitest run tests/unit/fixtures.test.ts`, only when the format deliberately changes.

The scripts run on Windows, Linux and macOS and look for Chrome, Firefox and `keepassxc-cli` in the usual places. Set `BOOKPASS_CHROME` or `BOOKPASS_FIREFOX` to use another (for a Snap Firefox, `/snap/bin/firefox`). On macOS build the helper first (`cd helper && go build -tags dev -o bin/bookpass-helper .`). Firefox needs Node 24 or newer.

## By hand

Scripts cannot press the toolbar button, use the right click menu, answer the permission prompt for fetching pictures, or run Flatpak and Snap browsers. Check these by hand with a spare vault:

- First run: the helper screen, creating a vault, closing the browser and unlocking again with a wrong and then the right password.
- Saving from the toolbar button, `Alt+Shift+B` and the right click menu (page, link, image), while locked, on a browser page, twice on the same page, and all or selected tabs.
- Fetching pictures for one bookmark, a folder, a selection and everything. Expect a permission prompt, a list of sites with ticks, and no site permission left granted afterwards.
- Each locking setting, including inactivity and the computer locking.
- Moving the vault with the system folder dialog, and on a machine with no desktop.
- Opening the vault in KeePassXC, and editing it there while BookPass is open.
- Two computers on a synced folder, editing different and the same bookmarks, and a sync conflict copy.
- Import from the browser, an HTML file and a CSV file, and export to each format.
- Firefox, a Flatpak or Snap browser on Linux, and Chrome and Firefox on macOS.
