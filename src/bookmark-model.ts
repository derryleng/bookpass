// Turns a KDBX vault into bookmarks and folders and back. No browser APIs here, so it runs in unit tests.
//
// How BookPass data sits in KDBX (see docs/FORMAT.md):
//   folder   -> group; icon, color, order and view live in group custom data (bp.*)
//   bookmark -> entry; Title, URL and Notes are native, the rest are bp.* custom fields
//   cover    -> entry attachment cover.webp
//   favicon  -> KDBX custom icon, one per site, shared by every entry from it
//   trash    -> the Recycle Bin group
import { toBase64 } from './base64';
import type { Kdbx, KdbxEntry, KdbxGroup } from './kdbx';
import { KdbxUuid } from './kdbx';
import type { Layout } from './settings';

export type BookmarkType = 'link' | 'article' | 'image' | 'video' | 'document' | 'audio';
export const bookmarkTypes: BookmarkType[] = [
  'link',
  'article',
  'image',
  'video',
  'document',
  'audio',
];
export type SortKey = 'added' | 'edited' | 'title' | 'domain' | 'manual';

export interface ViewSettings {
  layout: Layout;
  sort: SortKey;
  sortDir: 'asc' | 'desc';
  /** Show bookmarks from subfolders too. */
  subfolders: boolean;
  showCover: boolean;
  showNote: boolean;
  showTags: boolean;
}

export const defaultView: ViewSettings = {
  layout: 'list',
  sort: 'added',
  sortDir: 'desc',
  subfolders: false,
  showCover: true,
  showNote: true,
  showTags: true,
};

export interface Folder {
  id: string;
  /** null for a top level folder. */
  parentId: string | null;
  name: string;
  note: string;
  /** Icon key such as fa-solid:folder. */
  icon: string;
  color: string;
  order: number;
  view: ViewSettings;
  expanded: boolean;
}

export interface Bookmark {
  id: string;
  /** null when the bookmark sits at the top level (Unsorted). */
  folderId: string | null;
  title: string;
  url: string;
  note: string;
  excerpt: string;
  type: BookmarkType;
  favorite: boolean;
  tags: string[];
  order: number;
  created: number;
  modified: number;
  hasCover: boolean;
  /** Id of the favicon, if the site has one stored. */
  iconId: string | null;
}

export interface Snapshot {
  folders: Folder[];
  bookmarks: Bookmark[];
  trash: Bookmark[];
}

export interface BookmarkInput {
  folderId: string | null;
  title: string;
  url: string;
  note?: string;
  excerpt?: string;
  type?: BookmarkType;
  favorite?: boolean;
  tags?: string[];
  /** Manual sort position. New bookmarks go last. */
  order?: number;
  /** When it was first saved (ms since 1970), for imports. */
  created?: number;
}

export interface Image {
  /** The bytes, as a base64 string so they can cross the extension message boundary. */
  base64: string;
  mime: string;
}

const entryField = {
  excerpt: 'bp.excerpt',
  type: 'bp.type',
  favorite: 'bp.favorite',
  order: 'bp.order',
};
const groupData = { icon: 'bp.icon', color: 'bp.color', view: 'bp.view', order: 'bp.order' };
const coverName = 'cover.webp';
export const defaultFolderIcon = 'fa-solid:folder';

// Small helpers around kdbxweb's loose types.

export function text(entry: KdbxEntry, name: string): string {
  const value = entry.fields.get(name);
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : value.getText();
}

export function setText(entry: KdbxEntry, name: string, value: string) {
  if (value) entry.fields.set(name, value);
  else entry.fields.delete(name);
}

function data(group: KdbxGroup, key: string): string | undefined {
  return group.customData?.get(key)?.value;
}

function setData(group: KdbxGroup, key: string, value: string | undefined) {
  group.customData ??= new Map();
  if (value === undefined || value === '') group.customData.delete(key);
  else group.customData.set(key, { value, lastModified: new Date() });
}

function binaryBytes(value: unknown): ArrayBuffer | undefined {
  const inner =
    value && typeof value === 'object' && 'value' in value
      ? (value as { value: unknown }).value
      : value;
  if (inner instanceof ArrayBuffer) return inner;
  if (inner && typeof (inner as { getBinary?: unknown }).getBinary === 'function') {
    return (inner as { getBinary(): ArrayBuffer }).getBinary();
  }
  return undefined;
}

function isBin(db: Kdbx, group: KdbxGroup): boolean {
  return !!db.meta.recycleBinUuid && group.uuid.equals(db.meta.recycleBinUuid);
}

/** True for the Recycle Bin and anything inside it. */
export function inBin(db: Kdbx, group: KdbxGroup | undefined): boolean {
  for (let g = group; g; g = g.parentGroup) if (isBin(db, g)) return true;
  return false;
}

function parseView(raw: string | undefined): ViewSettings {
  try {
    return { ...defaultView, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...defaultView };
  }
}

// Reading

function readFolder(group: KdbxGroup, parentId: string | null): Folder {
  return {
    id: group.uuid.id,
    parentId,
    name: group.name ?? '',
    note: group.notes ?? '',
    icon: data(group, groupData.icon) ?? defaultFolderIcon,
    color: data(group, groupData.color) ?? '',
    order: Number(data(group, groupData.order)) || 0,
    view: parseView(data(group, groupData.view)),
    expanded: group.expanded ?? false,
  };
}

function readBookmark(entry: KdbxEntry, folderId: string | null): Bookmark {
  const type = text(entry, entryField.type) as BookmarkType;
  return {
    id: entry.uuid.id,
    folderId,
    title: text(entry, 'Title'),
    url: text(entry, 'URL'),
    note: text(entry, 'Notes'),
    excerpt: text(entry, entryField.excerpt),
    type: bookmarkTypes.includes(type) ? type : 'link',
    favorite: text(entry, entryField.favorite) === '1',
    tags: [...entry.tags],
    order: Number(text(entry, entryField.order)) || 0,
    created: entry.times.creationTime?.getTime() ?? 0,
    modified: entry.times.lastModTime?.getTime() ?? 0,
    hasCover: entry.binaries.has(coverName),
    iconId: entry.customIcon && !entry.customIcon.empty ? entry.customIcon.id : null,
  };
}

export function readSnapshot(db: Kdbx): Snapshot {
  const snapshot: Snapshot = { folders: [], bookmarks: [], trash: [] };
  const walk = (group: KdbxGroup, parentId: string | null) => {
    for (const entry of group.entries) snapshot.bookmarks.push(readBookmark(entry, parentId));
    for (const child of group.groups) {
      if (isBin(db, child)) {
        for (const entry of child.allEntries()) snapshot.trash.push(readBookmark(entry, null));
        continue;
      }
      snapshot.folders.push(readFolder(child, parentId));
      walk(child, child.uuid.id);
    }
  };
  const root = db.getDefaultGroup();
  for (const entry of root.entries) snapshot.bookmarks.push(readBookmark(entry, null));
  for (const child of root.groups) {
    if (isBin(db, child)) {
      for (const entry of child.allEntries()) snapshot.trash.push(readBookmark(entry, null));
      continue;
    }
    snapshot.folders.push(readFolder(child, null));
    walk(child, child.uuid.id);
  }
  return snapshot;
}

export function findEntry(db: Kdbx, id: string): KdbxEntry {
  for (const entry of db.getDefaultGroup().allEntries()) if (entry.uuid.id === id) return entry;
  throw new Error('Bookmark not found');
}

export function findGroup(db: Kdbx, id: string | null): KdbxGroup {
  if (id === null) return db.getDefaultGroup();
  const group = db.getGroup(id);
  if (!group || inBin(db, group)) throw new Error('Folder not found');
  return group;
}

/** Bytes of a bookmark's cover thumbnail, if it has one. */
export function getCover(db: Kdbx, id: string): Image | null {
  const bytes = binaryBytes(findEntry(db, id).binaries.get(coverName));
  return bytes ? { base64: toBase64(bytes), mime: sniffMime(bytes) } : null;
}

/** Covers are WebP where the browser can make it, but PNG or JPEG are fine too, so look at the bytes. */
function sniffMime(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength));
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  return 'image/webp';
}

/** Bytes of a stored favicon. */
export function getIcon(db: Kdbx, iconId: string): Image | null {
  const icon = db.meta.customIcons.get(iconId);
  return icon ? { base64: toBase64(icon.data), mime: 'image/png' } : null;
}

// Writing bookmarks

function applyBookmark(entry: KdbxEntry, patch: Partial<BookmarkInput> & { order?: number }) {
  if (patch.title !== undefined) entry.fields.set('Title', patch.title);
  if (patch.url !== undefined) entry.fields.set('URL', patch.url);
  if (patch.note !== undefined) setText(entry, 'Notes', patch.note);
  if (patch.excerpt !== undefined) setText(entry, entryField.excerpt, patch.excerpt);
  if (patch.type !== undefined)
    setText(entry, entryField.type, patch.type === 'link' ? '' : patch.type);
  if (patch.favorite !== undefined) setText(entry, entryField.favorite, patch.favorite ? '1' : '');
  if (patch.order !== undefined) setText(entry, entryField.order, String(patch.order));
  if (patch.tags !== undefined)
    entry.tags = [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))];
}

export async function setCover(db: Kdbx, entry: KdbxEntry, bytes: Uint8Array) {
  entry.binaries.set(coverName, await db.createBinary(bytes.slice().buffer));
}

/** Stores a favicon once per site and points the entry at it. */
export function setFavicon(db: Kdbx, entry: KdbxEntry, site: string, png: Uint8Array) {
  let id = [...db.meta.customIcons].find(([, icon]) => icon.name === site)?.[0];
  if (!id) {
    const uuid = KdbxUuid.random();
    id = uuid.id;
    db.meta.customIcons.set(id, { data: png.slice().buffer, name: site, lastModified: new Date() });
  }
  entry.customIcon = new KdbxUuid(id);
}

export interface Capture {
  cover?: Uint8Array;
  favicon?: { site: string; png: Uint8Array };
}

export async function addBookmark(
  db: Kdbx,
  input: BookmarkInput,
  capture: Capture = {},
): Promise<string> {
  const entry = db.createEntry(findGroup(db, input.folderId));
  applyBookmark(entry, { ...input, order: input.order ?? Date.now() });
  if (input.created) entry.times.creationTime = new Date(input.created);
  if (capture.cover) await setCover(db, entry, capture.cover);
  if (capture.favicon) setFavicon(db, entry, capture.favicon.site, capture.favicon.png);
  return entry.uuid.id;
}

export async function updateBookmark(
  db: Kdbx,
  id: string,
  patch: Partial<BookmarkInput> & { order?: number },
  capture: Capture = {},
) {
  const entry = findEntry(db, id);
  entry.pushHistory(); // keeps the old version so an edit can be recovered
  applyBookmark(entry, patch);
  if (patch.folderId !== undefined) db.move(entry, findGroup(db, patch.folderId));
  if (capture.cover) await setCover(db, entry, capture.cover);
  if (capture.favicon) setFavicon(db, entry, capture.favicon.site, capture.favicon.png);
  entry.times.update();
}

export function moveBookmarks(db: Kdbx, ids: string[], folderId: string | null) {
  const target = findGroup(db, folderId);
  for (const id of ids) {
    const entry = findEntry(db, id);
    db.move(entry, target);
    entry.times.update();
  }
}

export function trashBookmarks(db: Kdbx, ids: string[]) {
  for (const id of ids) db.remove(findEntry(db, id));
}

/** Puts trashed bookmarks back where they came from, or at the top level if that folder is gone. */
export function restoreBookmarks(db: Kdbx, ids: string[]) {
  for (const id of ids) {
    const entry = findEntry(db, id);
    const previous = entry.previousParentGroup && db.getGroup(entry.previousParentGroup);
    db.move(entry, previous && !inBin(db, previous) ? previous : db.getDefaultGroup());
  }
}

export function deleteForever(db: Kdbx, ids: string[]) {
  for (const id of ids) db.move(findEntry(db, id), null);
}

export function emptyTrash(db: Kdbx) {
  const bin = db.meta.recycleBinUuid && db.getGroup(db.meta.recycleBinUuid);
  if (!bin) return;
  for (const entry of [...bin.allEntries()]) db.move(entry, null);
  for (const group of [...bin.groups]) db.move(group, null);
}

// Writing folders

export interface FolderPatch {
  /** The folder icon drawn as a PNG, so KeePassXC shows it too. Stored once per icon and color. */
  iconImage?: { name: string; png: Uint8Array };
  name?: string;
  note?: string;
  icon?: string;
  color?: string;
  view?: ViewSettings;
  expanded?: boolean;
  order?: number;
}

function applyFolder(group: KdbxGroup, patch: FolderPatch) {
  if (patch.name !== undefined) group.name = patch.name;
  if (patch.note !== undefined) group.notes = patch.note;
  if (patch.expanded !== undefined) group.expanded = patch.expanded;
  if (patch.icon !== undefined)
    setData(group, groupData.icon, patch.icon === defaultFolderIcon ? '' : patch.icon);
  if (patch.color !== undefined) setData(group, groupData.color, patch.color);
  if (patch.order !== undefined) setData(group, groupData.order, String(patch.order));
  if (patch.view !== undefined) setData(group, groupData.view, JSON.stringify(patch.view));
}

/** Points a folder at a stored picture, reusing one that is already there. */
function setFolderPicture(db: Kdbx, group: KdbxGroup, picture: { name: string; png: Uint8Array }) {
  let id = [...db.meta.customIcons].find(([, icon]) => icon.name === picture.name)?.[0];
  if (!id) {
    id = KdbxUuid.random().id;
    db.meta.customIcons.set(id, {
      data: picture.png.slice().buffer,
      name: picture.name,
      lastModified: new Date(),
    });
  }
  group.customIcon = new KdbxUuid(id);
}

export function createFolder(
  db: Kdbx,
  parentId: string | null,
  name: string,
  patch: FolderPatch = {},
): string {
  const group = db.createGroup(findGroup(db, parentId), name);
  applyFolder(group, { order: Date.now(), ...patch });
  if (patch.iconImage) setFolderPicture(db, group, patch.iconImage);
  return group.uuid.id;
}

export function updateFolder(db: Kdbx, id: string, patch: FolderPatch) {
  const group = findGroup(db, id);
  applyFolder(group, patch);
  if (patch.iconImage) setFolderPicture(db, group, patch.iconImage);
  // Opening or closing a folder in the tree is not an edit worth a new modification time.
  if (Object.keys(patch).some((k) => k !== 'expanded')) group.times.update();
}

export function moveFolder(db: Kdbx, id: string, parentId: string | null) {
  const group = findGroup(db, id);
  const target = findGroup(db, parentId);
  for (let g: KdbxGroup | undefined = target; g; g = g.parentGroup) {
    if (g === group) throw new Error('A folder cannot move into itself');
  }
  db.move(group, target);
  group.times.update();
}

/** Moves the folder, with everything in it, to the trash. */
export function trashFolder(db: Kdbx, id: string) {
  db.remove(findGroup(db, id));
}
