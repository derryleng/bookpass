# Helper protocol

The extension talks to the helper (`helper/`) with browser native messaging. The helper is started by the browser on demand, speaks on standard input and output, and never opens a network connection.

## Framing

Each message is a 4 byte length in native byte order followed by that many bytes of UTF-8 JSON.

- The browser accepts at most 1 MiB from the helper, counting the JSON. Chrome drops the connection when it is exceeded and Firefox reports an error. The helper therefore answers an oversize reply with a small error instead, and reads are limited to 512 KiB (about 683 KB of base64).
- The helper accepts up to 64 MiB per message from the browser, though the extension sends 512 KiB chunks.

## Requests and replies

A request is `{ "id": 1, "op": "...", ...fields }`. The reply carries the same `id` and `"ok": true`, or `"ok": false` with an `error` text and a `code`:

| Code          | Meaning                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| `conflict`    | The vault file changed since the extension last read it. Merge, then write again. |
| `invalid`     | The request was wrong, for example a bad checksum or path.                        |
| `io`          | The disk refused.                                                                 |
| `unavailable` | This computer cannot do that, for example show a file dialog.                     |

Binary data (`data`) is base64.

## Operations

| Operation     | Fields                             | Reply fields                                                                                                                                    |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `hello`       | none                               | `protocol`, `helper` (version), `os`, `arch`                                                                                                    |
| `getConfig`   | none                               | `vaultPath`, `defaultPath`, `backupCount`                                                                                                       |
| `setConfig`   | `vaultPath` and or `backupCount`   | the new `vaultPath`, `backupCount`                                                                                                              |
| `pickFolder`  | none                               | `path` of the folder chosen, empty if the dialog was closed. Fails with `unavailable` when there is no dialog. Blocks until the person answers. |
| `checkPath`   | `vaultPath`                        | `path` (cleaned), `creates` (outermost folder that would be made), `problem` (empty if usable). Changes nothing.                                |
| `moveVault`   | `vaultPath`                        | the new `vaultPath`. Copies and verifies the vault, points the config at it, then removes the old file and carries the backups over.            |
| `exists`      | none                               | `exists`, `size`. Cheap, does not hash the file.                                                                                                |
| `stat`        | none                               | `exists`, `size`, `sha256`                                                                                                                      |
| `read`        | `offset`, `length` (1 to 524288)   | `data`, `eof`                                                                                                                                   |
| `writeBegin`  | none                               | none. Starts a temporary file next to the vault.                                                                                                |
| `writeChunk`  | `data`                             | none                                                                                                                                            |
| `writeCommit` | `size`, `sha256`, `expectedSha256` | `sha256`, `size`                                                                                                                                |

Reading a vault is `stat`, then `read` chunks until `eof`, then the extension checks the SHA-256 of what it received against the `stat`, and starts again if they differ (the file changed while reading).

Writing a vault is `writeBegin`, `writeChunk` for each 512 KiB piece, then `writeCommit`. The helper checks the size and checksum of what it received, and checks that the file on disk still has the hash the extension passed as `expectedSha256` (an empty string means the file must not exist yet). Only then does it copy the old file into the backups folder, flush the new one to disk and rename it over the vault. A crash before the rename leaves the old vault intact.

## Safety rules

- The helper reads and writes exactly one file, the `vaultPath` from its config file, which must be absolute and end in `.kdbx`. The path changes only through `setConfig`.
- Backups go in a `backups` folder next to the vault, named `<vault>-<UTC time>.kdbx`, and the oldest beyond `backupCount` (default 5) are removed.
- Files are created for the current user only (folder 0700, files 0600 on macOS and Linux).
- The native messaging manifest names the extension that may start the helper: `allowed_origins` for Chrome and the other Chromium browsers, `allowed_extensions` for Firefox. Web pages and other extensions cannot reach it.

## Versioning

`protocol` in the `hello` reply is a single integer. The extension refuses a helper with a different number and tells the user to update the helper. Helper and extension also have their own semantic versions.

## Configuration

The config lives in `config.json` in the user config folder (`%AppData%\BookPass` on Windows, `~/Library/Application Support/BookPass` on macOS, `~/.config/BookPass` on Linux). The default vault is `.bookpass/bookmarks.kdbx` in the home folder. The environment variables `BOOKPASS_CONFIG_DIR` and `BOOKPASS_DEFAULT_VAULT` override both, which the tests use. `BOOKPASS_TEST_PICK` names a file that stands in for the folder dialog in tests: its text is returned as the chosen folder, `unavailable` means no dialog, and empty means the dialog was closed.
