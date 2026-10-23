# Privacy policy

BookPass collects nothing. It has no server, no account, no analytics and no telemetry, and the extension makes no network requests.

## What BookPass keeps

- **Your bookmarks** are stored only in the encrypted vault file on your own computer, in the place you choose. The BookPass helper program reads and writes that file and only ever sees encrypted data.
- **Settings** such as the theme and how long the vault stays unlocked are kept in your browser's extension storage on your computer.
- **The unlock key**, which is a hash of your master password, is kept in the browser's memory while the vault is unlocked and is removed when it locks or the browser closes. Only if you choose the "never lock" setting is it also written to your browser profile on disk.

## What BookPass reads

- When you save a page, BookPass reads that one page (its title, description, icon and preview image) or takes a screenshot of the visible tab. This happens only when you press the BookPass button, use its right click menu or its keyboard shortcut.
- If you choose to save several tabs or import your browser's bookmarks, BookPass asks for the extra permission at that moment and reads titles and addresses only.

## What leaves your computer

Nothing is sent anywhere by BookPass. If you put your vault file in a folder that a sync tool such as Syncthing, OneDrive or Dropbox keeps in step, that tool copies the encrypted file, under its own terms.

## Contact

Questions go to the project's issue tracker on GitHub. The address will be added here when the repository is public.
