# Testing

## Where things live

Everything a test reads or writes is under `tests/`, except the Go tests, which Go requires to sit next to the code in `helper/`.

| Path              | What it holds                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/`     | Unit tests, run by `npm test`                                                                                          |
| `tests/e2e/`      | End to end checks that drive a real browser, and their shared library `lib.ts`                                         |
| `tests/fixtures/` | Inputs, committed: the golden vault files, a key file and a bookmarks file to import                                   |
| `tests/output/`   | Everything a run writes: screenshots, throwaway vaults and browser profiles, the big performance vault. Ignored by git |

`.gitignore` ignores `tests/output/`, any `out` folder and `.log` file under `tests/`, and every `.kdbx` except the `golden-*.kdbx` files in `tests/fixtures/`. The spikes in `spikes/` write to `tests/output/spikes/`.

## Automatic

| Command                             | What it checks                                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint` | Types and style                                                                                                                                                                                                                                      |
| `npm test`                          | Unit tests: the vault format, the bookmark model, locking rules, search and sorting, import and export formats, golden and tampered files, key files, password change, merging                                                                       |
| `npm run helper:test`               | The helper: atomic writes, conflicts, backups, the one file rule, the installer for each operating system                                                                                                                                            |
| `npm run e2e`                       | Chrome with the built extension and the real helper: first run, saving from the toolbar button with covers and icons, layouts, search, the locking modes, a restarted background, KeePassXC opening the vault                                        |
| `npm run e2e:more`                  | Key files, import, tags, history, drag and drop, changes made outside BookPass, sync conflict copies, backups, changing the password                                                                                                                 |
| `npm run e2e:a11y`                  | An axe-core pass over every screen in the light and dark themes                                                                                                                                                                                      |
| `npm run e2e:security`              | Storage, network, who may use the helper, and the manifest                                                                                                                                                                                           |
| `npm run e2e:firefox`               | Firefox with a build made only for the test (it opens its own manager and popup, since a script cannot press the toolbar button): creating and unlocking a vault, saving pages with covers and icons, the lock setting, KeePassXC opening the result |
| `npm run e2e:perf`                  | A 48 MB vault with 10,000 bookmarks. Make it first with `PERF_VAULT=1 npx vitest run tests/unit/perf.test.ts`                                                                                                                                        |

The golden files are made again with `UPDATE_FIXTURES=1 npx vitest run tests/unit/fixtures.test.ts`, only when the format deliberately changes.

The end to end scripts run on Windows and Linux (they look for Chrome, Firefox and `keepassxc-cli` in the usual places; set `BOOKPASS_CHROME` or `BOOKPASS_FIREFOX` to use another). On Linux use Node 24 or newer, and for a Snap Firefox set `BOOKPASS_FIREFOX=/snap/bin/firefox`. They have not been run on macOS. Chrome refuses remote debugging in its default profile folder, so on Linux the tests give a throwaway profile its own copy of the helper manifest. The manifest the helper installer writes for the default profile is covered by the helper tests but was never loaded by a real Chrome. Chrome's right click menu cannot be driven by a script, so the right click saving is checked by hand.

## By hand

Tick these off in a browser you use. The scripts have run on Windows (Chrome 156, Firefox 158) and on Ubuntu 26.04 in WSL (Chrome 156, Firefox 158 as a Snap). Flatpak browsers, macOS, Edge and Brave have not had the whole list.

1. Install the helper (run it once) and load the extension. The popup should reach the create vault screen.
2. Create a vault. Close the browser, open it, and unlock.
3. Save a page with the toolbar button, then with `Alt+Shift+B`. Save a link and an image from the right click menu, and a page too.
4. Save two tabs with "Save several tabs".
5. In the manager: create nested folders with icons, drag bookmarks and folders, sort manually, try each layout, tag, search with `#tag`, favorite, trash and restore.
6. Settings: try each locking choice and check it behaves as described. Change the master password and unlock again.
7. Open the vault in KeePassXC and see the folders and bookmarks. Add an entry there and see it appear in BookPass.
8. Put the vault in a synced folder on two computers, edit on both, and check the merge.
9. Import your browser's bookmarks and a Raindrop export. Export to HTML and import that file into a browser.
10. On Linux with a Snap or Flatpak browser, check whether the helper starts. If not, note which browser.
