# BookPass

Your bookmarks in an encrypted file on your own computer. BookPass is a browser extension for Chrome, Edge, Brave and Firefox that stores bookmarks in a KeePass file, so there is no account, no cloud service and no tracking, and KeePassXC and KeePass can open the same file.

## What you get

- **One encrypted file.** Protected by a master password and, if you want, a key file. A lost password cannot be recovered by anyone.
- **Quick saving.** Save the page you are on from the toolbar button, the right click menu, `Alt+Shift+B`, or save all your open tabs. BookPass keeps the page's icon and a cover picture.
- **Organised your way.** Folders with icons and colors, tags, favorites, notes, search, four layouts, sorting, sections, drag and drop, and earlier versions of every bookmark. The trash keeps what you delete.
- **You decide when it locks.** When the browser closes, after a time, when the computer is idle, every time, or never.
- **Works across computers.** Put the file in a folder that Syncthing, OneDrive or Dropbox keeps in step. Changes from another computer, a sync tool or KeePassXC are merged.
- **Bring your bookmarks along.** Import from your browser, Netscape HTML or Raindrop CSV, and export to HTML, CSV or JSON.

## Getting started

[docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) walks through installing the extension and the small helper program that writes the file, creating a vault, saving a first bookmark, and using a second computer.

## Your privacy

BookPass collects nothing and has no server. It contacts a bookmarked site only when you ask it to fetch that site's pictures. Read [docs/PRIVACY.md](docs/PRIVACY.md) for what is kept and read, and [docs/SECURITY.md](docs/SECURITY.md) for how the vault is protected.

## Status

BookPass is at version 0.1.0, the first release. The helper program is not signed yet, so Windows and macOS warn about it the first time. It has been tried with Chrome and Firefox on Windows and Ubuntu, and with Brave on macOS. Edge is not tested by this project. It takes the Chrome build and should work. Flatpak browsers and Firefox or Chrome on macOS have not been tried yet. See [CHANGELOG.md](CHANGELOG.md) for what exists so far and [docs/TESTING.md](docs/TESTING.md) for what has been tested.

## More documents

- [docs/FORMAT.md](docs/FORMAT.md): how bookmarks are stored in the KeePass file.
- [docs/PARITY.md](docs/PARITY.md): what is taken from Raindrop.io and what is left out.
- [docs/DEVELOPING.md](docs/DEVELOPING.md): building and changing BookPass.
- [docs/PROTOCOL.md](docs/PROTOCOL.md) and [docs/RELEASING.md](docs/RELEASING.md): the helper protocol, releases and the stores.
- [docs/STORE.md](docs/STORE.md): the store listing text.

## License

BookPass is free software under the [GNU General Public License version 3 or later](LICENSE). Icons and libraries it uses are credited in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
