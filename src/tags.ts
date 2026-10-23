// Tags live on each entry, so renaming, merging and deleting a tag edits every bookmark that uses it.
// Tag colors are kept in the vault's own custom data.
import { inBin } from './bookmark-model';
import type { Kdbx } from './kdbx';

const COLORS_KEY = 'bp.tagcolors';

export function readTagColors(db: Kdbx): Record<string, string> {
  try {
    return JSON.parse(db.meta.customData?.get(COLORS_KEY)?.value ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeTagColors(db: Kdbx, colors: Record<string, string>) {
  db.meta.customData ??= new Map();
  const clean = Object.fromEntries(Object.entries(colors).filter(([, color]) => color));
  if (Object.keys(clean).length)
    db.meta.customData.set(COLORS_KEY, { value: JSON.stringify(clean), lastModified: new Date() });
  else db.meta.customData.delete(COLORS_KEY);
  db.meta.settingsChanged = new Date();
}

export function setTagColor(db: Kdbx, tag: string, color: string) {
  writeTagColors(db, { ...readTagColors(db), [tag]: color });
}

function* bookmarksWith(db: Kdbx, tag: string) {
  for (const entry of db.getDefaultGroup().allEntries()) {
    if (
      !inBin(db, entry.parentGroup) &&
      entry.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
    )
      yield entry;
  }
}

/** Renames a tag. If a tag with the new name exists, the two become one. */
export function renameTag(db: Kdbx, from: string, to: string) {
  const name = to.trim().replace(/^#/, '');
  if (!name) throw new Error('A tag needs a name');
  for (const entry of bookmarksWith(db, from)) {
    entry.tags = [
      ...new Set(entry.tags.map((t) => (t.toLowerCase() === from.toLowerCase() ? name : t))),
    ];
    entry.times.update();
  }
  const colors = readTagColors(db);
  if (colors[from] !== undefined) {
    const { [from]: color, ...rest } = colors;
    writeTagColors(db, { ...rest, [name]: rest[name] ?? color! });
  }
}

export function deleteTag(db: Kdbx, tag: string) {
  for (const entry of bookmarksWith(db, tag)) {
    entry.tags = entry.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
    entry.times.update();
  }
  const { [tag]: _removed, ...rest } = readTagColors(db);
  writeTagColors(db, rest);
}

/** Adds tags to many bookmarks at once. */
export function addTags(db: Kdbx, ids: string[], tags: string[]) {
  const wanted = new Set(ids);
  for (const entry of db.getDefaultGroup().allEntries()) {
    if (wanted.has(entry.uuid.id)) {
      entry.tags = [
        ...new Set([...entry.tags, ...tags.map((t) => t.trim().replace(/^#/, '')).filter(Boolean)]),
      ];
      entry.times.update();
    }
  }
}
