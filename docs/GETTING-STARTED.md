# Getting started

This is what a new person goes through, from nothing installed to the first saved bookmark. BookPass has no account, no sign in and no server. Your bookmarks live in one encrypted file on your own computer, and nothing else stores them. GitHub is only where the helper program is downloaded from.

## 1. Install the extension

From the browser store (once it is published), or for now by loading the build as an unpacked extension (Chrome, Brave) or as a temporary add-on (Firefox). Click the BookPass button in the toolbar.

## 2. Install the helper

Browsers cannot write to a file you choose, so a small helper program does it. The first screen says so and gives three steps:

1. Download the helper for your system (a link to the GitHub release page).
2. Run it once. On Windows, double click it and a console window says which browsers it registered with. On macOS and Linux, run `./bookpass-helper` in a terminal (on macOS, run `xattr -d com.apple.quarantine bookpass-helper` first, because the program is not signed yet). It copies itself to a folder for your user only and registers with Chrome, Brave, Vivaldi, Chromium and Firefox, whichever are installed. It needs no administrator rights and does not touch any vault.
3. Go back to the extension and press Check again.

If the helper is missing or not allowed, the screen shows the browser's own reason in a yellow box. During development, `npm run helper:register` does step 2.

## 3. Create the vault

The next screen is Create your vault.

- It shows where the file will go, by default `.bookpass/bookmarks.kdbx` in your home folder. "Use a different file" lets you type a full path ending in `.kdbx`. A folder that Syncthing, OneDrive or Dropbox keeps in step is how you use the vault on several computers. If a file is already at that path, BookPass offers to unlock it instead.
- You choose a master password and repeat it. There is an optional key file as a second factor, chosen from disk or made on the spot (it downloads a file to keep safe).
- A warning says that a lost password cannot be recovered by anyone, and that the helper keeps your last five versions next to the vault as a safety net.

Create vault takes about a second (the password is stretched with Argon2id). The vault is now a KeePass file that KeePassXC can open with the same password.

## 4. Save the first bookmark

Open any web page and click the BookPass button (or press `Alt+Shift+B`). The popup shows the page's title, a cover picture, the site and a folder choice, tags and a note. Press Save bookmark. BookPass reads only that page, for its title, description, icon and preview image, or takes a screenshot of the tab if the page offers no picture.

BookPass never asks a favicon service or any other third party about your bookmarks. Pictures come from the page you are on, or from the bookmarked site itself when you press a fetch button. To give a bookmark a site icon or cover, choose Edit and use the Pictures section: fetch it from the site, choose a file of your own, or remove it. To fill in many at once, use "Fetch missing pictures" in the settings or the tools menu (everything), in a folder's edit dialog (that folder and the folders inside it), or in the bar that appears when you tick bookmarks (just those). It shows the sites it would contact first, and you can untick any. Nothing is ever fetched on its own, not even after an import. Only https addresses are fetched.

The menu button in the popup opens the manager in a tab, with the folder tree on the left, the bookmarks in the middle, search at the top and settings behind the gear. Until there are bookmarks it shows a short prompt to add one, import your browser's bookmarks, or add an address by hand.

## 5. Day to day

- By default the vault stays unlocked until you close the browser, then asks for the password again. Settings has five choices: when the browser closes, after inactivity (you pick the minutes), when the computer is idle or locked, every time you close BookPass, and never (which keeps the unlock key on this computer, with a warning).
- Right click on a page, link or image saves it. The popup can also save all or just the selected tabs into a new folder.
- Move the vault: Settings, Vault file, Move vault. Browse opens your system's folder dialog (or type the folder if there is none), the new place is checked before anything moves, a folder that does not exist yet is created, and the backups come along. BookPass stays unlocked.
- Tick the icon beside a list's heading (hover it to reveal the tick box) to pick everything in the folder, including its subfolders when they are included. The View menu holds sorting, sections (by subfolder, title, website, date added or date edited, each with a subheading and a rule), including subfolders, and what to show on each bookmark. Each folder remembers its own view.
- The helper keeps rotating backups of the vault, and each bookmark keeps its earlier versions.

## 6. A second computer

Install the extension and the helper there, choose Use a different file on the create screen, and point it at the same synced vault file. It asks for the master password (and key file) and opens. If both computers change things at once, BookPass merges them and lists any bookmark edited on both.
