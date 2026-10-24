// Puts imported bookmarks into the vault.
import { addBookmark, createFolder, inBin } from "./bookmark-model";
import { normalizeUrl } from "./browse";
import type { ParsedImport } from "./formats";
import type { Kdbx } from "./kdbx";

export interface ImportResult {
  added: number;
  /** Bookmarks left out because the vault, or the file itself, already had the address. */
  skipped: number;
  folders: number;
}

/** The addresses already in the vault, ignoring the trash. */
export function existingUrls(db: Kdbx): Set<string> {
  const urls = new Set<string>();
  for (const entry of db.getDefaultGroup().allEntries()) {
    if (!inBin(db, entry.parentGroup))
      urls.add(normalizeUrl(String(entry.fields.get("URL") ?? "")));
  }
  return urls;
}

/** Counts what an import would do, without changing anything. */
export function previewImport(
  db: Kdbx,
  parsed: ParsedImport,
  skipDuplicates: boolean,
): ImportResult {
  const seen = skipDuplicates ? existingUrls(db) : new Set<string>();
  const folders = new Set<string>();
  let added = 0;
  let skipped = 0;
  for (const b of parsed.bookmarks) {
    const key = normalizeUrl(b.url);
    if (skipDuplicates && seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    added++;
    for (let i = 1; i <= b.folderPath.length; i++)
      folders.add(b.folderPath.slice(0, i).join("\0"));
  }
  for (const f of parsed.emptyFolders)
    for (let i = 1; i <= f.length; i++) folders.add(f.slice(0, i).join("\0"));
  return { added, skipped, folders: folders.size };
}

/**
 * Adds the bookmarks, creating the folders they came from under `parentId`. If `wrapper` is given, everything
 * goes into a new folder of that name, so an import is easy to look over and to undo.
 */
export async function importInto(
  db: Kdbx,
  parsed: ParsedImport,
  parentId: string | null,
  wrapper: string | undefined,
  skipDuplicates: boolean,
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, skipped: 0, folders: 0 };
  const seen = skipDuplicates ? existingUrls(db) : new Set<string>();
  const folders = new Map<string, string | null>();
  let root = parentId;
  if (wrapper) {
    root = createFolder(db, parentId, wrapper);
    result.folders++;
  }

  const folderFor = (path: string[]): string | null => {
    let parent = root;
    for (let depth = 1; depth <= path.length; depth++) {
      const key = path.slice(0, depth).join("\0");
      let id = folders.get(key);
      if (id === undefined) {
        id = createFolder(db, parent, path[depth - 1]!);
        folders.set(key, id);
        result.folders++;
      }
      parent = id;
    }
    return parent;
  };

  for (const path of parsed.emptyFolders) folderFor(path);
  const base = Date.now();
  for (const [index, b] of parsed.bookmarks.entries()) {
    const key = normalizeUrl(b.url);
    if (skipDuplicates && seen.has(key)) {
      result.skipped++;
      continue;
    }
    seen.add(key);
    await addBookmark(db, {
      folderId: folderFor(b.folderPath),
      title: b.title,
      url: b.url,
      note: b.note,
      excerpt: b.excerpt,
      tags: b.tags,
      favorite: b.favorite,
      order: base + index,
      created: b.created,
    });
    result.added++;
  }
  return result;
}
