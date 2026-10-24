# Store listings

Text for the Chrome Web Store and Firefox add-ons. Screenshots come from the end to end runs (`tests/output/`) at 1280 by 800.

Name: BookPass

Summary: Bookmarks in an encrypted KeePass file on your own disk.

Single purpose: saves and organises the user's bookmarks in an encrypted local file.

The extension needs a small helper program to read and write the vault file, because browsers cannot write to a folder of your choice. The helper only sees the encrypted file.

## Permission justifications

| Permission           | Justification                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| nativeMessaging      | Talks to the helper, which reads and writes the encrypted vault file                                                       |
| storage              | Keeps the settings and, while unlocked, the unlock key in memory                                                           |
| activeTab, scripting | Reads the title, description, icon and preview image of the one page the user saves, and screenshots that tab as its cover |
| contextMenus         | Adds Save page, Save link and Save image to the right click menu                                                           |
| alarms, idle         | Lock the vault after the time the user chose                                                                               |
| tabs (optional)      | Asked for only when the user saves all open tabs                                                                           |
| bookmarks (optional) | Asked for only when the user imports their browser bookmarks                                                               |
| all sites (optional) | Asked for only when the user presses a button that fetches icons or covers from bookmarked sites, and removed afterwards   |

No host permission is held at rest. Requests carry no cookies and no referrer and go only to the bookmarked sites.

## Data use answers

Collects personal data: no. Sells or shares data: no. Uses remote code: no. Privacy policy: the Privacy section of the README.

## Firefox reviewer notes

The source is in the second zip. Build with `npm ci && npm run build:firefox` using Node 24 or newer; the output is `.output/firefox-mv3`. Argon2 is `hash-wasm` (WebAssembly), which is why the content security policy allows `wasm-unsafe-eval`.

The linter warns about the `Function` constructor and about `innerHTML`. The first is a line in the kdbxweb library's webpack wrapper (`return this || new Function('return this')()`) that never runs, and the content security policy would block it anyway. The second is React setting the text of an element. BookPass never builds markup from bookmark text.
