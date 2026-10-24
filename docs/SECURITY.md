# Security

## What BookPass protects against

- Someone who gets a copy of the vault file, from a stolen disk, a sync service or a backup. The file is KDBX 4.1, encrypted and authenticated by the format, with a key derived from your master password (and key file if you use one) by Argon2id using 256 MiB of memory.
- Web pages and other extensions. The extension asks for no site access, and the helper only answers the BookPass extension.

## What it does not protect against

- Malware running as you on an unlocked computer. It can read the browser's memory, where the unlock key and the decrypted bookmarks live while the vault is unlocked.
- A weak master password. Argon2id slows guessing down but cannot save a guessable password.
- Anyone who can read your browser profile if you choose the "never lock" setting, because that setting keeps the unlock key on disk. The settings page says so.

## How the pieces are kept apart

- The background (a service worker in Chrome, an event page in Firefox) owns the vault, the key and all cryptography. The popup, manager and settings pages are thin views that ask it for data in typed messages.
- The helper reads and writes one file, the path in its own config, and only ever sees encrypted bytes. It never starts programs, opens network connections or listens on a port. Writes go to a temporary file in the same folder, are flushed, and replace the vault by an atomic rename. A write is refused if the file changed since it was read, if the checksum of what arrived is wrong, or if the path is not the configured one. Reads of other files are limited to conflict copies and backups that the helper itself found.
- The browser decides who may start the helper: the native messaging manifest names the BookPass extension only (`allowed_origins` for Chrome based browsers, `allowed_extensions` for Firefox).
- The unlock key is a hash of the master password, kept in `storage.session` (memory only, not readable by web pages). It is written to `storage.local` only for the "never lock" setting, and removed when another setting is chosen.

## Permissions

| Permission                  | Why                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `nativeMessaging`           | Reaches the helper                                                                                             |
| `storage`                   | Settings, and the unlock key in memory                                                                         |
| `activeTab` and `scripting` | Reads the one page you save, only after you press the button or use the menu or shortcut                       |
| `contextMenus`              | The right click save entries                                                                                   |
| `alarms` and `idle`         | The locking timers                                                                                             |
| `tabs` (optional)           | Asked for when you save several tabs                                                                           |
| `bookmarks` (optional)      | Asked for when you import your browser's bookmarks                                                             |
| all sites (optional)        | Asked for when you press a button that fetches pictures from your bookmarked sites, and handed back afterwards |

There is no host permission held at rest, no content script and no standing access to any site. The optional all sites permission is requested only when you press a fetch button and is removed again when the job ends. The content security policy is `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. `wasm-unsafe-eval` is needed to run Argon2 as WebAssembly, and there is no `unsafe-eval`, inline script or remote code.

## Review of 24 October 2026

The checks below are automated and run with the end to end scripts (`npm run e2e:security`).

- Storage: no bookmark text in `storage.local`, `storage.session`, `localStorage`, IndexedDB or caches. `storage.local` holds only the settings. `storage.session` holds only the unlock key and the last activity time. The unlock key is a hash, not the password.
- Files: the vault file contains no readable bookmark text. No temporary file is left behind. The helper config holds only the vault path and backup count.
- Network: the extension pages and the background made no network request during a full session. The `fetch` calls are in the injected page reader (against the page's own site, to read its images) and in the picture fetcher (`src/fetch-pictures.ts`), which runs only after you press a fetch button, with no cookies and no referrer, against the bookmarked site and, only if you allow it, the image server the page names.
- Logging: the only console output is an error line for an unexpected failure, which prints the request name and the error, never the data.
- Callers: a second extension asking for the helper is refused by the browser ("forbidden").
- Manifest: only the permissions above, no required host permissions, `*://*/*` as the one optional host permission, no content scripts, and the policy above.
- Dependencies: `npm audit --omit=dev` reports no vulnerabilities. kdbxweb is unmaintained since 2021, and its XML library `@xmldom/xmldom` had a high severity advisory, so the repository pins the patched 0.8.15 with an override. Replacing or vendoring kdbxweb is worth considering before 1.0.
- Format: golden files from BookPass and from KeePassXC open in the tests, and a flipped byte in the signature, header, header hash, encrypted data or last block makes the vault fail to open.

## Not yet done

- An outside review. This is a self review by the author.
- Fuzzing the KDBX reader and the helper's JSON input.
- Memory hygiene: kdbxweb keeps decrypted values in ordinary JavaScript memory, and nothing can be wiped on lock beyond dropping references.

## Reporting a problem

Open an issue on GitHub, or for something sensitive, contact the maintainer directly. The address will be added when the repository is public.
