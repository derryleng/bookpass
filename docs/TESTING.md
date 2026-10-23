# Testing

## Automatic

| Command                             | What it checks                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint` | Types and style                                                                                                                                                                                               |
| `npm test`                          | Unit tests: the vault format, the bookmark model, locking rules, search and sorting, import and export formats, golden and tampered files, key files, password change, merging                                |
| `npm run helper:test`               | The helper: atomic writes, conflicts, backups, the one file rule, the installer for each operating system                                                                                                     |
| `npm run e2e`                       | Chrome with the built extension and the real helper: first run, saving from the toolbar button with covers and icons, layouts, search, the locking modes, a restarted background, KeePassXC opening the vault |
| `npm run e2e:more`                  | Key files, import, tags, history, drag and drop, changes made outside BookPass, sync conflict copies, backups, changing the password                                                                          |
| `npm run e2e:a11y`                  | An axe-core pass over every screen in the light and dark themes                                                                                                                                               |
| `npm run e2e:security`              | Storage, network, who may use the helper, and the manifest                                                                                                                                                    |
| `npm run e2e:perf`                  | A 48 MB vault with 10,000 bookmarks (make it first, see the script)                                                                                                                                           |

The end to end scripts need Windows, Chrome and KeePassXC in their default folders. Chrome's right click menu cannot be driven by a script, so the right click saving is checked by hand.

## By hand

Tick these off in a browser you use. Firefox, macOS and Linux have only had the spike (helper link, Argon2 and the vault code), so they need the whole list.

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
