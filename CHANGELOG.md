# Changelog

All notable changes are listed here. The project follows [semantic versioning](https://semver.org).

## Unreleased

## 0.1.0 - 2026-10-24

The first release. The helper program is not signed yet.

### Added

- GNU General Public License version 3 or later as the license. LICENSE and THIRD_PARTY_LICENSES.md are included in the extension packages and attached to the release. The README is now written for people who use BookPass, and the developer notes moved to docs/DEVELOPING.md.

- A browser extension for Chrome, Edge and Firefox (Manifest V3) that keeps bookmarks in a KeePass KDBX 4.1 file with Argon2id, readable by KeePassXC and KeePass.
- A Go native helper that reads and writes the vault atomically with rotating backups, and installs itself for the current user on Windows, macOS and Linux.
- Folders with icons and colors, tags, favorites, trash, search, four layouts, sorting, manual order, drag and drop, bulk edit, and earlier versions of each bookmark.
- Saving the current page from the toolbar button, the right click menu or a keyboard shortcut, with a site icon and a cover picture read from the page or taken as a tab screenshot, using only the `activeTab` permission. Saving all or selected tabs.
- Pictures you control. Fetching a site icon or cover picture for one bookmark from its edit dialog, for a folder, for the bookmarks you picked, or for everything from the settings, always on request and never by default. Choosing your own picture from a file and removing either. Fetching reads only the bookmarked site, over https, with no cookies, no referrer and no cache, after the browser's permission prompt, which is handed back afterwards. A bulk fetch lists the sites first so any can be left out, and spaces requests with random pauses. Answers redirected to a different site are discarded. Preview images on another server are read only if you switch that on.
- Moving the vault to another folder from the settings, with the system's folder dialog (or a typed path when there is none), a check before anything moves, new folders created as needed, and the backups carried along.
- A tick box under a list heading's icon that picks everything in the list, and sections: a list can be split by subfolder, title, website, date added or date edited, each with a subheading and a rule and its own tick box. One View menu now holds sorting, sections, subfolders and what to show.
- Locking settings: when the browser closes, after inactivity, when the computer is idle or locked, every time the popup or manager closes, or never.
- Optional key file, changing the master password, and restoring backups.
- Merging of changes made by another computer, a sync tool or KeePassXC, with a list of bookmarks edited on both sides and merging of sync tool conflict copies.
- Import from Netscape HTML, Raindrop CSV and the browser's bookmarks, export to HTML, CSV and JSON, and a duplicate finder.
- Font Awesome Free icons, with a searchable picker for the whole free set.
