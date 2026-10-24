# Getting started

## 1. Install the extension

From the browser store once it is published, or by loading the build as an unpacked extension (Chrome, Brave) or a temporary add-on (Firefox). See [DEVELOPING.md](DEVELOPING.md).

## 2. Install the helper

Browsers cannot write to a file you choose, so a small helper program does it. The first screen gives the steps:

1. Download the helper for your system from the GitHub releases page.
2. Run it once. On Windows, double click it. On macOS and Linux, run `./bookpass-helper` in a terminal (on macOS run `xattr -d com.apple.quarantine bookpass-helper` first, because the program is not signed yet). It copies itself to a folder for your user only and registers with Chrome, Brave, Vivaldi, Chromium and Firefox, whichever are installed. It needs no administrator rights and does not touch any vault.
3. Go back to the extension and press Check again.

During development `npm run helper:register` does step 2.

## 3. Create the vault

- The file goes in `.bookpass/bookmarks.kdbx` in your home folder by default. "Use a different file" takes a full path ending in `.kdbx`. If a file is already there, BookPass offers to unlock it.
- Choose a master password. A key file is optional. A lost password cannot be recovered.
- The helper keeps your last five versions of the vault next to it.

The vault is a KeePass file that KeePassXC opens with the same password.

## 4. Save bookmarks

Click the BookPass button or press `Alt+Shift+B` on a page, choose a folder, tags and a note, and press Save bookmark. BookPass reads that page's title, description, icon and preview image, or screenshots the tab if the page has no picture. The right click menu saves a page, link or image, and the popup can save all or the selected tabs.

Pictures never come from a third party. To fetch a missing site icon or cover from the bookmarked site, use Edit, Pictures on one bookmark, or Fetch missing pictures from the settings, a folder's edit dialog or the bar that appears when you tick bookmarks. A bulk fetch lists the sites first so you can untick any. Only https addresses are fetched, and nothing is fetched on its own.

## 5. Locking

Settings has five choices: when the browser closes (the default), after inactivity, when the computer is idle or locked, every time BookPass closes, and never. "Never" keeps the unlock key on this computer.

## 6. A second computer

Install the extension and the helper there, choose Use a different file on the create screen, and point it at the same synced vault file. If both computers change things at once, BookPass merges them and lists any bookmark edited on both. To move the vault, use Settings, Vault file, Move vault.
