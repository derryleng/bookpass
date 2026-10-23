# Store listings

Text for the Chrome Web Store, Firefox add-ons and Edge Add-ons. Screenshots come from the end to end runs (`e2e-out`, `e2e-more-out`) at 1280 by 800.

## Name

BookPass

## Summary (132 characters at most)

Bookmarks in an encrypted KeePass file on your own disk. No account, no cloud, no tracking.

## Description

BookPass is a bookmark manager that keeps everything in one encrypted file on your own computer. The file is a standard KeePass vault (KDBX 4.1), so KeePassXC and KeePass can open it too, and you can put it in a folder that Syncthing, OneDrive or Dropbox syncs to use it on several computers.

What you can do

- Save the page you are on with one click, with its icon and a cover picture, or save a link, an image, or all your open tabs.
- Organise bookmarks in nested folders with icons and colors, tags, favorites and notes.
- See them as a list, a grid, headlines or a masonry wall, and sort them or put them in your own order.
- Search by words, tags, site or type.
- Import from your browser, Raindrop or any bookmarks file, and export when you want to leave.
- Choose how often you unlock: once per browser session, after a period of inactivity, when the computer goes idle, every time, or never.
- Keep earlier versions of a bookmark, rotating backups of the vault, and merging when two computers edit at once.

How it works

BookPass needs a small helper program to read and write the vault file, because browsers cannot write to a folder of your choice. You install it once (run it and it sets itself up for your user, no administrator rights). The helper only ever sees the encrypted file. BookPass makes no network requests and collects nothing.

Open source. Icons by Font Awesome (CC BY 4.0).

## Single purpose

Saves and organises the user's bookmarks in an encrypted local file.

## Permission justifications

| Permission           | Justification                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| nativeMessaging      | Talks to the BookPass helper, which reads and writes the encrypted vault file on disk                                                          |
| storage              | Keeps the settings and, while unlocked, the unlock key in memory                                                                               |
| activeTab, scripting | Reads the title, description, icon and preview image of the one page the user chooses to save, and takes a screenshot of that tab as its cover |
| contextMenus         | Adds Save page, Save link and Save image to the right click menu                                                                               |
| alarms, idle         | Lock the vault after the time the user chose                                                                                                   |
| tabs (optional)      | Asked for only when the user saves all open tabs                                                                                               |
| bookmarks (optional) | Asked for only when the user imports their browser bookmarks                                                                                   |

No host permissions are requested.

## Data use answers

- Collects personal data: no.
- Sells or shares data: no.
- Uses remote code: no.
- Privacy policy: `docs/PRIVACY.md`, published at a public address.

## Firefox reviewer notes

The source is in the second zip. Build with `npm ci && npm run build:firefox` using Node 24 or newer; the output is `.output/firefox-mv3`. The extension needs the native helper from the GitHub release to do anything beyond the first screen. Argon2 is `hash-wasm` (WebAssembly), which is why the content security policy allows `wasm-unsafe-eval`.
