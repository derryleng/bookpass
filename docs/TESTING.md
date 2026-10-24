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

The scripts have run on Windows (Chrome 156, Firefox 158) and on Ubuntu 26.04 in WSL (Chrome 156, Firefox 158 as a Snap). Things a script cannot do, and anything on macOS, Edge, Brave and Flatpak browsers, need a person. Use a spare vault file, and see `GETTING-STARTED.md` for what each screen should look like. For each step the result to expect is after the dash.

### First run

1. Run `npm run build` and `npm run helper:build`, load `.output/chrome-mv3` as an unpacked extension, and click the BookPass button. Expect the "Install the BookPass helper" screen.
2. Run the helper (`npm run helper:register`, or double click the built program). Expect a message for each browser it registered with. Press Check again. Expect the "Create your vault" screen showing the default path.
3. Try a mismatch: type two different passwords. Expect "The two passwords do not match."
4. Create the vault. Expect the manager with an empty state and a "Saved" mark. Check that the file exists at the path shown.
5. Close the browser completely and open it again. Click the button. Expect "Unlock BookPass". Try a wrong password (expect "Wrong master password"), then the right one.

### Saving

6. On a normal page click the button. Expect the title, a cover picture and a folder choice. Save it, and see it in the manager with its cover and site icon.
7. Press `Alt+Shift+B` on another page. Expect the same popup. (If the shortcut is taken, set it at `chrome://extensions/shortcuts`.)
8. Right click a page, then a link, then an image, and choose the BookPass entry. Expect "OK" on the toolbar button for a moment and a new bookmark each time. Do it once while locked: expect the manager to open with the address ready to save after you unlock.
9. Open a browser page such as `chrome://extensions`. Expect "BookPass can only save web pages".
10. Save a page twice. Expect "You saved this page before", and an update, not a duplicate.
11. Choose "Save several tabs" with a few tabs open, once for all tabs and once for selected tabs. Expect a permission prompt the first time and a new folder with the tabs.

### Organising

12. Create nested folders with different icons and colors. Search the icon picker for `rocket` and `github`. Expect the whole free set to be found.
13. Drag a bookmark onto a folder, onto Unsorted, and a folder onto another folder. Choose Manual order and drag bookmarks up and down.
14. Try all four layouts and the "what to show" menu. Open a folder, switch it to Grid, go to another folder, and come back. Expect each folder to remember its own layout.
15. Tag several bookmarks at once, rename and merge tags in the tag manager, search with `#tag`, `domain:`, `type:video`, `is:fav`. Favorite one.
16. Trash a bookmark and a folder, restore them, empty the trash.
17. Edit a bookmark twice and open "Earlier versions". Restore the first one.

### Settings and locking

18. Try each locking choice: "when the browser closes", inactivity (set one minute and wait), computer idle or locked (lock the screen and come back), every time (close the manager and popup, then open one), and never (restart the browser and expect no password prompt). Note any that does not behave as the text says.
19. Change the master password, lock, and unlock with the new one. Make a key file vault on another path and check that the password alone is refused.
20. Settings, Backups. Expect a list. Restore one and check the bookmarks go back.
21. Dark and light themes, and a narrow window.

### Other programs and computers

22. Open the vault in KeePassXC with the same password. Expect folders as groups and bookmarks as entries. Add an entry there, and expect it in BookPass within about 30 seconds (or when you click the page).
23. Put the vault in a synced folder (Syncthing, OneDrive or Dropbox) on two computers. Edit different bookmarks on both and check both changes survive. Edit the same bookmark on both and check the notice about it.
24. Make the sync tool leave a conflict copy (or copy the vault to `bookmarks.sync-conflict-1.kdbx`) and check the "Merge it" notice.

### Import and export

25. Import your browser's bookmarks, then an exported HTML file, then a Raindrop CSV. Expect a preview with counts, duplicates skipped, and a new "Imported" folder.
26. Export to HTML, CSV and JSON. Import the HTML into a fresh browser profile.
27. Find duplicates after importing the same bookmarks without skipping.

### Other systems

28. Firefox: load the add-on, check the same first run and saving steps. Add-ons loaded as temporary are removed when Firefox closes, so a daily Firefox needs the signed store version.
29. Linux with a Flatpak or Snap browser: run the helper and check whether the browser can start it. If not, note which browser and version.
30. macOS: unpack the helper, clear the quarantine mark, run it, and repeat the first run steps.
31. The VMware or any other desktop with a real screen: look for anything that is cut off, too small, or hard to read.
