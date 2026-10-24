# Spike: kdbxweb with KDBX 4.1 and Argon2id

Run the checks with `node spikes/kdbx/spike.ts` and `node spikes/kdbx/argon2-bench.ts`. Both need Node 22.18 or newer, which runs TypeScript directly.

## Findings

| Question                                 | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Is kdbxweb maintained?                   | No. The last release, 2.1.1, is from September 2021. It is MIT licensed, written in TypeScript and depends only on `@xmldom/xmldom` and `fflate`. Plan to vendor or fork it.                                                                                                                                                                                                                                                                                             |
| Does it read and write KDBX 4.1?         | It reads 4.1. Its `upgrade()` writes 4.0, because the default minor version for major 4 is 0. Setting `db.header.versionMinor = 1` before saving gives a real 4.1 file (verified from the header bytes). 4.1 only fields such as group tags and previous parent group are written when the minor version is 1.                                                                                                                                                           |
| Custom data on groups and entries        | Round trips, including the per item modification time.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Custom icons, tags, custom string fields | Round trip.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Argon2id                                 | Works, but kdbxweb ships no Argon2 code. `CryptoEngine.setArgon2Impl` takes one function. `hash-wasm` (MIT, WebAssembly) fits and kdbxweb passes memory in KiB. kdbxweb's `Argon2Type` enum is not exported, so use 0 for Argon2d and 2 for Argon2id. New vaults default to Argon2d, so call `db.setKdf(Consts.KdfId.Argon2id)` and set `M`, `I` and `P` in the KDF parameters.                                                                                          |
| Wrong password and tampering             | A wrong password fails with `InvalidKey`. A flipped byte fails with `FileCorrupt`.                                                                                                                                                                                                                                                                                                                                                                                       |
| Merge                                    | Entries and groups are matched by UUID. Edits, additions, moves and deletes merge, and merging twice changes nothing. An edit made after a delete beats the delete. **Gap:** merge drops custom data on both groups and entries, and group tags, whenever it copies an item from the other side (a new item, or a newer one). BookPass stores its folder view and manual order in custom data, so BookPass must copy those itself after `merge()`, or we patch the fork. |

## Argon2id timing (Node, hash-wasm, single thread)

Saving or opening a vault costs one KDF run.

| Memory  | Iterations | Time    |
| ------- | ---------- | ------- |
| 19 MiB  | 2          | 30 ms   |
| 64 MiB  | 3          | 130 ms  |
| 256 MiB | 3          | 580 ms  |
| 512 MiB | 3          | 1230 ms |

The plan assumed 64 MiB and 3 iterations take about one second. They take about 130 ms here, so reaching about one second needs roughly 512 MiB, which is a lot of memory for a service worker. A better default may be 128 to 256 MiB with 3 iterations. Browser timings are still to measure.

## Scale (Node, 64 MiB and 3 iterations)

| Vault                                    | Save  | Open  | File size | Process memory |
| ---------------------------------------- | ----- | ----- | --------- | -------------- |
| 10,000 entries, no thumbnails            | 0.5 s | 0.8 s | 0.3 MiB   | about 390 MiB  |
| 10,000 entries with 5 KB thumbnails each | 2.0 s | 1.1 s | 48 MiB    | about 880 MiB  |

Random thumbnail bytes do not compress, so the 48 MiB file is a worst case. Memory is the concern: a 48 MiB vault needed roughly 400 MiB more process memory than a small one, so the thumbnail pool fallback in the plan should be kept in reserve.

## Not yet verified

- Argon2id WebAssembly under the extension content security policy, in a Chrome service worker and a Firefox event page (needs the browsers).
- KeePassXC opening a BookPass vault and keeping its custom fields and icons (needs KeePassXC).

## KeePassXC interop (`node spikes/kdbx/interop.ts`)

Tested with KeePassXC 2.8.0 on Windows.

| Question                                  | Answer                                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does KeePassXC open a BookPass vault?     | Yes. `keepassxc-cli` lists the folders and shows the entry with its tags.                                                                                                               |
| Does it keep BookPass data when it saves? | Yes. After KeePassXC added an entry, the file was still KDBX 4.1 with Argon2id, and the `bp.excerpt` field, group and entry custom data, tags and custom icons were all intact.         |
| Anything new in the file?                 | KeePassXC adds a `_LAST_MODIFIED` custom data item to every group and entry it saves. BookPass must ignore custom data keys that start with an underscore, and keep them when it saves. |
| Does BookPass open a KeePassXC vault?     | Yes. Note that `keepassxc-cli db-create` made a KDBX 3.1 file here. BookPass should offer to upgrade an older vault, not refuse it.                                                     |
