# Privacy policy

BookPass collects nothing. It has no server, no account, no analytics and no telemetry, and the extension makes a network request only when you press a button that fetches pictures from a bookmarked site.

## What BookPass keeps

- **Your bookmarks** are stored only in the encrypted vault file on your own computer, in the place you choose. The BookPass helper program reads and writes that file and only ever sees encrypted data.
- **Settings** such as the theme and how long the vault stays unlocked are kept in your browser's extension storage on your computer.
- **The unlock key**, which is a hash of your master password, is kept in the browser's memory while the vault is unlocked and is removed when it locks or the browser closes. Only if you choose the "never lock" setting is it also written to your browser profile on disk.

## What BookPass reads

- When you save a page, BookPass reads that one page (its title, description, icon and preview image) or takes a screenshot of the visible tab. This happens only when you press the BookPass button, use its right click menu or its keyboard shortcut.
- If you choose to save several tabs or import your browser's bookmarks, BookPass asks for the extra permission at that moment and reads titles and addresses only.

- If you ask BookPass to fetch a bookmark's site icon or cover picture, or to fetch the missing pictures of many bookmarks, it asks your browser for permission to reach all sites, makes an ordinary request to each bookmarked site (and, only if you switch on "Also read preview images that sit on another server", to the image server that page names), and hands the permission back when it finishes. Those requests carry no cookies and no referrer. BookPass never asks a favicon service, search engine or any other third party about your bookmarks, and never fetches anything in the background.

## What leaves your computer

BookPass sends nothing anywhere, apart from the picture requests above, which go to the sites you bookmarked and nobody else. If you put your vault file in a folder that a sync tool such as Syncthing, OneDrive or Dropbox keeps in step, that tool copies the encrypted file, under its own terms.

## Contact

Questions go to the project's issue tracker on GitHub. The address will be added here when the repository is public.
