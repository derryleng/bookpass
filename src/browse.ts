// What the manager shows: which bookmarks, in what order, and how folders nest. Pure logic, no React.
import type { Bookmark, Folder, GroupKey, Snapshot, ViewSettings } from './bookmark-model';

export type Selection =
  | { kind: 'all' }
  | { kind: 'unsorted' }
  | { kind: 'favorites' }
  | { kind: 'trash' }
  | { kind: 'folder'; id: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'search' };

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Two URLs that differ only in the fragment or a trailing slash count as the same page. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

// Folders

export interface TreeNode {
  folder: Folder;
  children: TreeNode[];
  /** Bookmarks directly in this folder. */
  own: number;
  /** Bookmarks in this folder and everything below it. */
  total: number;
}

export function buildTree(folders: Folder[], bookmarks: Bookmark[]): TreeNode[] {
  const own = new Map<string, number>();
  for (const b of bookmarks) if (b.folderId) own.set(b.folderId, (own.get(b.folderId) ?? 0) + 1);

  const nodes = new Map<string, TreeNode>();
  for (const folder of folders)
    nodes.set(folder.id, { folder, children: [], own: own.get(folder.id) ?? 0, total: 0 });

  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.folder.parentId ? nodes.get(node.folder.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }

  const byOrder = (a: TreeNode, b: TreeNode) =>
    a.folder.order - b.folder.order || a.folder.name.localeCompare(b.folder.name);
  const finish = (list: TreeNode[]) => {
    list.sort(byOrder);
    for (const node of list) {
      finish(node.children);
      node.total = node.own + node.children.reduce((sum, c) => sum + c.total, 0);
    }
  };
  finish(roots);
  return roots;
}

/** The folder and every folder below it. */
export function descendantIds(tree: TreeNode[], id: string): Set<string> {
  const ids = new Set<string>();
  const collect = (node: TreeNode) => {
    ids.add(node.folder.id);
    node.children.forEach(collect);
  };
  const find = (nodes: TreeNode[]): TreeNode | undefined => {
    for (const node of nodes) {
      if (node.folder.id === id) return node;
      const inner = find(node.children);
      if (inner) return inner;
    }
  };
  const start = find(tree);
  if (start) collect(start);
  return ids;
}

export interface FolderOption {
  id: string;
  name: string;
  depth: number;
}

/** Folders in tree order with their depth, for a folder picker. `exclude` hides folders that cannot be chosen. */
export function folderOptions(tree: TreeNode[], exclude: Set<string> = new Set()): FolderOption[] {
  const out: FolderOption[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      if (exclude.has(node.folder.id)) continue;
      out.push({ id: node.folder.id, name: node.folder.name, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return out;
}

// Search, filter, sort

/**
 * Words match the title, address, note, description and tags. Plus:
 *   #tag  bookmarks with that tag      domain:example.com   bookmarks from that site
 *   is:fav  favorites      type:video  one kind of page      has:note   has:cover
 */
export function matchesQuery(b: Bookmark, query: string): boolean {
  const haystack = `${b.title} ${b.url} ${b.note} ${b.excerpt} ${b.tags.join(' ')}`.toLowerCase();
  for (const raw of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (raw.startsWith('#')) {
      if (!b.tags.some((t) => t.toLowerCase() === raw.slice(1))) return false;
    } else if (raw.startsWith('domain:')) {
      if (!domainOf(b.url).includes(raw.slice(7))) return false;
    } else if (raw === 'is:fav') {
      if (!b.favorite) return false;
    } else if (raw.startsWith('type:')) {
      if (b.type !== raw.slice(5)) return false;
    } else if (raw === 'has:note') {
      if (!b.note) return false;
    } else if (raw === 'has:cover') {
      if (!b.hasCover) return false;
    } else if (!haystack.includes(raw)) {
      return false;
    }
  }
  return true;
}

export function sortBookmarks(
  list: Bookmark[],
  view: Pick<ViewSettings, 'sort' | 'sortDir'>,
): Bookmark[] {
  const compare: Record<ViewSettings['sort'], (a: Bookmark, b: Bookmark) => number> = {
    added: (a, b) => a.created - b.created,
    edited: (a, b) => a.modified - b.modified,
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    domain: (a, b) => domainOf(a.url).localeCompare(domainOf(b.url)),
    manual: (a, b) => a.order - b.order,
  };
  const sign = view.sortDir === 'asc' ? 1 : -1;
  return [...list].sort(
    (a, b) => sign * compare[view.sort](a, b) || a.title.localeCompare(b.title),
  );
}

export function bookmarksFor(
  snapshot: Snapshot,
  selection: Selection,
  view: ViewSettings,
  query: string,
): Bookmark[] {
  let list: Bookmark[];
  if (query.trim()) {
    list = snapshot.bookmarks.filter((b) => matchesQuery(b, query));
  } else {
    switch (selection.kind) {
      case 'all':
      case 'search':
        list = snapshot.bookmarks;
        break;
      case 'unsorted':
        list = snapshot.bookmarks.filter((b) => b.folderId === null);
        break;
      case 'favorites':
        list = snapshot.bookmarks.filter((b) => b.favorite);
        break;
      case 'trash':
        list = snapshot.trash;
        break;
      case 'tag':
        list = snapshot.bookmarks.filter((b) => b.tags.includes(selection.tag));
        break;
      case 'folder': {
        const ids = view.subfolders
          ? descendantIds(buildTree(snapshot.folders, []), selection.id)
          : new Set([selection.id]);
        list = snapshot.bookmarks.filter((b) => b.folderId !== null && ids.has(b.folderId));
        break;
      }
    }
  }
  return sortBookmarks(list, view);
}

// Grouping

export interface BookmarkGroup {
  key: string;
  /** The subheading. Empty when the list is not grouped. */
  title: string;
  bookmarks: Bookmark[];
}

/** Folders in the order the tree shows them, each with its names from the top, for grouping by folder. */
function folderPaths(folders: Folder[]): Map<string, { names: string[]; order: number }> {
  const tree = buildTree(folders, []);
  const out = new Map<string, { names: string[]; order: number }>();
  const walk = (nodes: TreeNode[], above: string[]) => {
    for (const node of nodes) {
      const names = [...above, node.folder.name];
      out.set(node.folder.id, { names, order: out.size });
      walk(node.children, names);
    }
  };
  walk(tree, []);
  return out;
}

const monthLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const monthKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Splits the list, which is already in the order the person chose, into sections. Inside a section the order is kept.
 * The sections themselves run A to Z for titles and websites, newest first for dates, and in tree order for folders.
 */
export function groupBookmarks(
  list: Bookmark[],
  group: GroupKey,
  snapshot: Pick<Snapshot, 'folders'>,
  selection: Selection,
): BookmarkGroup[] {
  if (group === 'none') return [{ key: '', title: '', bookmarks: list }];

  const paths = folderPaths(snapshot.folders);
  const base = selection.kind === 'folder' ? paths.get(selection.id)?.names.length : undefined;
  const classify: Record<
    Exclude<GroupKey, 'none'>,
    (b: Bookmark) => { key: string; title: string; rank: string | number }
  > = {
    folder: (b) => {
      const path = b.folderId ? paths.get(b.folderId) : undefined;
      if (!path) return { key: '', title: 'Unsorted', rank: Number.MAX_SAFE_INTEGER };
      // Inside a folder the sections are named from that folder down, and its own bookmarks take its name.
      const names = base ? path.names.slice(base - 1) : path.names;
      const title = names.length > 1 && base ? names.slice(1).join(' / ') : names.join(' / ');
      return { key: b.folderId!, title, rank: path.order };
    },
    title: (b) => {
      const first = b.title.trim().normalize('NFD')[0]?.toUpperCase() ?? '';
      const letter = /\p{L}/u.test(first) ? first : '#';
      return { key: letter, title: letter, rank: letter === '#' ? '' : letter };
    },
    website: (b) => {
      const site = domainOf(b.url);
      return { key: site, title: site || 'No website', rank: site || '\uffff' };
    },
    added: (b) => ({
      key: monthKey(b.created),
      title: monthLabel(b.created),
      rank: monthKey(b.created),
    }),
    edited: (b) => ({
      key: monthKey(b.modified),
      title: monthLabel(b.modified),
      rank: monthKey(b.modified),
    }),
  };

  const sections = new Map<string, BookmarkGroup & { rank: string | number }>();
  for (const b of list) {
    const { key, title, rank } = classify[group](b);
    const section = sections.get(key) ?? { key, title, bookmarks: [], rank };
    section.bookmarks.push(b);
    sections.set(key, section);
  }
  const dates = group === 'added' || group === 'edited';
  return [...sections.values()]
    .sort((a, b) => {
      const order =
        typeof a.rank === 'number' || typeof b.rank === 'number'
          ? Number(a.rank) - Number(b.rank)
          : a.rank.localeCompare(String(b.rank), undefined, { sensitivity: 'base' });
      return dates ? -order : order;
    })
    .map(({ key, title, bookmarks }) => ({ key, title, bookmarks }));
}

/** Tags with how many bookmarks use each, most used first. */
export function tagCounts(bookmarks: Bookmark[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const b of bookmarks) for (const tag of b.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * New manual order values after dragging bookmarks next to another one.
 * `list` is what is on screen, `ids` are the bookmarks dragged (kept in their on-screen order) and they land
 * just before or after `targetId`. Only the dragged ones get new values, placed between their new neighbours,
 * unless neighbours share a value, in which case everything is numbered again.
 */
export function reorder(
  list: Bookmark[],
  ids: string[],
  targetId: string,
  before: boolean,
  dir: 'asc' | 'desc',
): { id: string; order: number }[] {
  const moving = list.filter((b) => ids.includes(b.id));
  const rest = list.filter((b) => !ids.includes(b.id));
  const at = rest.findIndex((b) => b.id === targetId);
  if (at < 0 || moving.length === 0) return [];
  const insertAt = before ? at : at + 1;
  const prev = rest[insertAt - 1];
  const next = rest[insertAt];
  const sign = dir === 'asc' ? 1 : -1;
  // The values just outside the gap, extended one step past the end of the list where there is no neighbour.
  const count = moving.length;
  const from = prev ? prev.order : next ? next.order - sign * (count + 1) : 0;
  const to = next ? next.order : from + sign * (count + 1);
  const step = (to - from) / (count + 1);
  const values = moving.map((_, i) => from + step * (i + 1));
  const distinct = new Set([from, to, ...values]).size === count + 2;
  if (distinct) return moving.map((b, i) => ({ id: b.id, order: values[i]! }));

  // Neighbours with the same value leave no room, so number the whole list in the new sequence.
  const sequence = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
  return sequence.map((b, i) => ({ id: b.id, order: sign * (i + 1) * 1000 }));
}
