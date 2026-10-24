# Vault format

BookPass stores everything in one standard KeePass KDBX 4.1 file, so KeePassXC and KeePass open it and nothing new has to be designed or audited. Bookmarks are entries, folders are groups.

## File

- KDBX 4.1 with a master password. The whole file is encrypted and authenticated by the format.
- Key derivation is Argon2id with 256 MiB of memory, 3 iterations and 2 threads for new vaults (about 0.6 s). Vaults made by other programs keep their own settings. Older KDBX 3 and 4.0 files are upgraded to 4.1 with Argon2id on the first save.
- The default cipher is AES-256.
- The Recycle Bin group is the trash.

## Mapping

| BookPass             | KDBX                                | Notes                                                                                                                                                                         |
| -------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Folder               | Group                               | Folders nest as groups do. The name and note are the group name and notes.                                                                                                    |
| Folder icon          | Group custom data `bp.icon`         | A key such as `fa-solid:book`. Unknown keys show a plain folder.                                                                                                              |
| Folder color         | Group custom data `bp.color`        | A hex color.                                                                                                                                                                  |
| Folder view          | Group custom data `bp.view`         | JSON: layout, sort, sort direction, show subfolders, and the cover, note and tag toggles. Needs KDBX 4.1.                                                                     |
| Folder order         | Group custom data `bp.order`        | A number.                                                                                                                                                                     |
| Bookmark             | Entry                               | The entry id is the bookmark identity, which is what merging uses.                                                                                                            |
| Title, address, note | `Title`, `URL`, `Notes`             | Username and password stay empty.                                                                                                                                             |
| Description          | Custom field `bp.excerpt`           | Read from the page when saving.                                                                                                                                               |
| Type                 | Custom field `bp.type`              | link (omitted), article, image, video, document or audio.                                                                                                                     |
| Favorite             | Custom field `bp.favorite`          | `1` when set.                                                                                                                                                                 |
| Order                | Custom field `bp.order`             | A number, for manual order.                                                                                                                                                   |
| Tags                 | Entry tags                          |                                                                                                                                                                               |
| Added, edited        | Creation and last modification time |                                                                                                                                                                               |
| History              | Entry history                       | The old version is kept when a bookmark is edited.                                                                                                                            |
| Cover picture        | Attachment `cover.webp`             | About 256 px wide, roughly 8 to 15 KB. The bytes may be PNG if the browser cannot encode WebP, so the type is read from the bytes.                                            |
| Site icon            | KDBX custom icon                    | One per site, named by the site origin, shared by every entry from that site. A 64 px PNG. A picture you choose for one bookmark is named `custom:` and the entry id instead. |

KeePassXC and KeePass keep fields they do not know. KeePassXC adds a `_LAST_MODIFIED` custom data item to every group and entry it saves, so BookPass ignores custom data keys that start with an underscore and keeps them when it saves.

## Where it can go wrong

- kdbxweb writes KDBX 4.0 unless the minor version is set to 1 by hand, which BookPass does.
- kdbxweb's merge drops custom data and group tags when it copies an item from the other side. BookPass copies them back after every merge (`mergeRemote` in `src/kdbx.ts`).
- Merging is per entry, not per field: when two computers edit the same bookmark, the newer edit wins and the other stays in its history.
