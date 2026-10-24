import { describe, expect, it } from 'vitest';
import { defaultView, type Bookmark, type Folder, type Snapshot } from '../../src/bookmark-model';
import {
  bookmarksFor,
  buildTree,
  descendantIds,
  domainOf,
  folderOptions,
  matchesQuery,
  reorder,
  normalizeUrl,
  sortBookmarks,
  tagCounts,
} from '../../src/browse';

const bookmark = (over: Partial<Bookmark>): Bookmark => ({
  id: 'b' + Math.random(),
  folderId: null,
  title: 'Title',
  url: 'https://example.com/',
  note: '',
  excerpt: '',
  type: 'link',
  favorite: false,
  tags: [],
  order: 0,
  created: 0,
  modified: 0,
  hasCover: false,
  iconId: null,
  ...over,
});

const folder = (id: string, parentId: string | null, name = id, order = 0): Folder => ({
  id,
  parentId,
  name,
  note: '',
  icon: 'fa-solid:folder',
  color: '',
  order,
  view: defaultView,
  expanded: false,
});

describe('urls', () => {
  it('finds the site name', () => {
    expect(domainOf('https://www.example.com/a/b?c=d')).toBe('example.com');
    expect(domainOf('not a url')).toBe('');
  });

  it('treats fragments and trailing slashes as the same page', () => {
    expect(normalizeUrl('https://Example.com/page/#top')).toBe(
      normalizeUrl('https://example.com/page'),
    );
    expect(normalizeUrl('https://example.com/a')).not.toBe(normalizeUrl('https://example.com/b'));
  });
});

describe('folder tree', () => {
  const folders = [
    folder('b', null, 'B'),
    folder('a', null, 'A'),
    folder('a1', 'a', 'A1'),
    folder('a2', 'a', 'A2'),
    folder('a11', 'a1'),
  ];
  const bookmarks = [
    bookmark({ folderId: 'a' }),
    bookmark({ folderId: 'a1' }),
    bookmark({ folderId: 'a11' }),
    bookmark({ folderId: 'a11' }),
  ];
  const tree = buildTree(folders, bookmarks);

  it('nests folders and sorts siblings by name', () => {
    expect(tree.map((n) => n.folder.id)).toEqual(['a', 'b']);
    expect(tree[0]!.children.map((n) => n.folder.id)).toEqual(['a1', 'a2']);
  });

  it('counts bookmarks directly and with subfolders', () => {
    expect(tree[0]).toMatchObject({ own: 1, total: 4 });
    expect(tree[1]).toMatchObject({ own: 0, total: 0 });
  });

  it('lists a folder with everything below it', () => {
    expect([...descendantIds(tree, 'a1')].sort()).toEqual(['a1', 'a11']);
  });

  it('builds a picker that can hide a folder and its children', () => {
    const options = folderOptions(tree, descendantIds(tree, 'a1'));
    expect(options.map((o) => `${o.depth}${o.id}`)).toEqual(['0a', '1a2', '0b']);
  });

  it('keeps a folder whose parent is missing', () => {
    expect(buildTree([folder('x', 'gone')], []).map((n) => n.folder.id)).toEqual(['x']);
  });
});

describe('search', () => {
  const b = bookmark({
    title: 'Rust Book',
    url: 'https://doc.rust-lang.org/book/',
    note: 'learn ownership',
    tags: ['Rust', 'learning'],
    favorite: true,
  });

  it('matches words anywhere, case insensitively, all of them', () => {
    expect(matchesQuery(b, 'rust ownership')).toBe(true);
    expect(matchesQuery(b, 'rust python')).toBe(false);
  });

  it('understands tags, domains and favorites', () => {
    expect(matchesQuery(b, '#rust')).toBe(true);
    expect(matchesQuery(b, '#go')).toBe(false);
    expect(matchesQuery(b, 'domain:rust-lang')).toBe(true);
    expect(matchesQuery(b, 'is:fav')).toBe(true);
    expect(matchesQuery(bookmark({}), 'is:fav')).toBe(false);
  });
});

describe('sorting and selections', () => {
  const list = [
    bookmark({ id: '1', title: 'banana', created: 1, url: 'https://b.test/' }),
    bookmark({ id: '2', title: 'Apple', created: 3, url: 'https://c.test/' }),
    bookmark({ id: '3', title: 'cherry', created: 2, url: 'https://a.test/' }),
  ];
  const ids = (l: Bookmark[]) => l.map((b) => b.id).join('');

  it('sorts by each key in both directions', () => {
    expect(ids(sortBookmarks(list, { sort: 'title', sortDir: 'asc' }))).toBe('213');
    expect(ids(sortBookmarks(list, { sort: 'added', sortDir: 'desc' }))).toBe('231');
    expect(ids(sortBookmarks(list, { sort: 'domain', sortDir: 'asc' }))).toBe('312');
  });

  const snapshot: Snapshot = {
    folders: [folder('f', null), folder('g', 'f')],
    bookmarks: [
      bookmark({ id: 'loose' }),
      bookmark({ id: 'in-f', folderId: 'f', tags: ['x'], favorite: true }),
      bookmark({ id: 'in-g', folderId: 'g' }),
    ],
    trash: [bookmark({ id: 'gone' })],
  };
  const show = (selection: Parameters<typeof bookmarksFor>[1], over = {}, query = '') =>
    bookmarksFor(snapshot, selection, { ...defaultView, sort: 'title', ...over }, query)
      .map((b) => b.id)
      .sort();

  it('picks bookmarks for each part of the sidebar', () => {
    expect(show({ kind: 'all' })).toEqual(['in-f', 'in-g', 'loose']);
    expect(show({ kind: 'unsorted' })).toEqual(['loose']);
    expect(show({ kind: 'favorites' })).toEqual(['in-f']);
    expect(show({ kind: 'tag', tag: 'x' })).toEqual(['in-f']);
    expect(show({ kind: 'trash' })).toEqual(['gone']);
  });

  it('shows subfolder bookmarks only when asked', () => {
    expect(show({ kind: 'folder', id: 'f' })).toEqual(['in-f']);
    expect(show({ kind: 'folder', id: 'f' }, { subfolders: true })).toEqual(['in-f', 'in-g']);
  });

  it('searches everything, whatever is selected', () => {
    expect(show({ kind: 'trash' }, {}, 'title')).toEqual(['in-f', 'in-g', 'loose']);
  });

  it('counts tags, most used first', () => {
    const tags = tagCounts([bookmark({ tags: ['a', 'b'] }), bookmark({ tags: ['b'] })]);
    expect(tags).toEqual([
      { tag: 'b', count: 2 },
      { tag: 'a', count: 1 },
    ]);
  });
});

describe('manual order', () => {
  const list = (...orders: number[]) =>
    orders.map((order, i) =>
      bookmark({ id: String.fromCharCode(97 + i), order, title: String.fromCharCode(97 + i) }),
    );
  const apply = (items: Bookmark[], updates: { id: string; order: number }[]) =>
    sortBookmarks(
      items.map((b) => ({ ...b, order: updates.find((u) => u.id === b.id)?.order ?? b.order })),
      { sort: 'manual', sortDir: 'asc' },
    )
      .map((b) => b.id)
      .join('');

  it('puts a dragged bookmark between two others, changing only its own value', () => {
    const items = list(10, 20, 30, 40); // a b c d
    const updates = reorder(items, ['d'], 'a', false, 'asc'); // after a
    expect(updates).toHaveLength(1);
    expect(apply(items, updates)).toBe('adbc');
  });

  it('can go first and last, and keeps several dragged items in order', () => {
    const items = list(10, 20, 30, 40);
    expect(apply(items, reorder(items, ['c'], 'a', true, 'asc'))).toBe('cabd');
    expect(apply(items, reorder(items, ['a'], 'd', false, 'asc'))).toBe('bcda');
    expect(apply(items, reorder(items, ['d', 'c'], 'a', true, 'asc'))).toBe('cdab');
  });

  it('works when the list is shown in reverse', () => {
    const items = list(40, 30, 20, 10); // shown top to bottom: a b c d, with falling values
    const moved = apply(
      items,
      reorder(items, ['d'], 'a', false, 'desc'), // after a
    );
    // Read back in descending order to match what is on screen.
    const screen = sortBookmarks(
      items.map((b) => ({
        ...b,
        order:
          reorder(items, ['d'], 'a', false, 'desc').find((u) => u.id === b.id)?.order ?? b.order,
      })),
      { sort: 'manual', sortDir: 'desc' },
    )
      .map((b) => b.id)
      .join('');
    expect(screen).toBe('adbc');
    expect(moved.length).toBe(4);
  });

  it('numbers everything again when neighbours share a value', () => {
    const items = list(0, 0, 0, 0);
    const updates = reorder(items, ['d'], 'a', false, 'asc'); // between a and b
    expect(updates).toHaveLength(4);
    expect(apply(items, updates)).toBe('adbc');
  });

  it('does nothing for a target that is not in the list', () => {
    expect(reorder(list(1, 2), ['a'], 'zzz', true, 'asc')).toEqual([]);
  });
});
