// Reading and writing the bookmark file formats other tools use. Pure text in, plain objects out.
import type { Bookmark, Folder } from './bookmark-model';

export interface ImportBookmark {
  /** Folder names from the top down, empty for a bookmark with no folder. */
  folderPath: string[];
  title: string;
  url: string;
  note: string;
  excerpt: string;
  tags: string[];
  favorite: boolean;
  /** ms since 1970 */
  created?: number;
}

export interface ParsedImport {
  bookmarks: ImportBookmark[];
  /** Folders that hold no bookmark but should still be created. */
  emptyFolders: string[][];
}

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const point =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point < 0x110000
        ? String.fromCodePoint(point)
        : whole;
    }
    return entities[code.toLowerCase()] ?? whole;
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseAttributes(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/([a-z_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    out[m[1]!.toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

function dateFromSeconds(value: string | undefined): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

/**
 * The "Netscape bookmark file" that Chrome, Firefox, Raindrop and most other services export.
 * It is HTML that was never well formed, so this reads it tag by tag instead of building a tree.
 */
export function parseNetscape(html: string): ParsedImport {
  const result: ParsedImport = { bookmarks: [], emptyFolders: [] };
  const path: string[] = [];
  let pendingFolder: string | undefined;
  let last: ImportBookmark | undefined;
  const folderHasBookmark = new Set<string>();
  let lastWasDescription = false;

  const tag = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    const [, closing, name, rest, stray] = m;
    if (stray !== undefined) {
      if (last && lastWasDescription) last.note = (last.note + decodeEntities(stray)).trim();
      continue;
    }
    const element = name!.toLowerCase();
    lastWasDescription = element === 'dd' && !closing;
    if (element === 'h3' && !closing) {
      const from = tag.lastIndex;
      const close = html.slice(from).search(/<\/h3>/i);
      if (close >= 0) {
        pendingFolder =
          decodeEntities(html.slice(from, from + close).replace(/<[^>]*>/g, '')).trim() ||
          'Untitled';
        tag.lastIndex = from + close;
      }
    } else if (element === 'dl' && !closing) {
      if (pendingFolder !== undefined) {
        path.push(pendingFolder);
        result.emptyFolders.push([...path]);
        pendingFolder = undefined;
      }
    } else if (element === 'dl' && closing) {
      path.pop();
    } else if (element === 'a' && !closing) {
      const from = tag.lastIndex;
      const close = html.slice(from).search(/<\/a>/i);
      const label = close >= 0 ? html.slice(from, from + close) : '';
      const attrs = parseAttributes(rest ?? '');
      if (close >= 0) tag.lastIndex = from + close;
      const url = (attrs.href ?? '').trim();
      if (!url || /^(place|javascript|about):/i.test(url)) {
        last = undefined;
        continue;
      }
      last = {
        folderPath: [...path],
        title: decodeEntities(label.replace(/<[^>]*>/g, '')).trim() || url,
        url,
        note: '',
        excerpt: '',
        tags: (attrs.tags ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        favorite: false,
        created: dateFromSeconds(attrs.add_date),
      };
      result.bookmarks.push(last);
      folderHasBookmark.add(path.join('\0'));
    }
  }
  // Only folders that are empty all the way down need creating separately.
  result.emptyFolders = result.emptyFolders.filter(
    (folder) =>
      ![...folderHasBookmark].some(
        (key) => key === folder.join('\0') || key.startsWith(folder.join('\0') + '\0'),
      ),
  );
  return result;
}

// CSV

/** Reads CSV with quoted fields, doubled quotes and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

export function toCsv(rows: string[][]): string {
  const cell = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

const csvColumns = [
  'id',
  'title',
  'note',
  'excerpt',
  'url',
  'folder',
  'tags',
  'created',
  'cover',
  'highlights',
  'favorite',
];

/** Raindrop.io's CSV export: folders, tags, notes, favorites and dates carry over. Nested folders are written as "Parent/Child". */
export function parseRaindropCsv(text: string): ParsedImport {
  const [header, ...rows] = parseCsv(text);
  if (!header) return { bookmarks: [], emptyFolders: [] };
  const col = (name: string) => header.map((h) => h.trim().toLowerCase()).indexOf(name);
  const url = col('url');
  if (url < 0) throw new Error('This CSV has no url column, so it is not a bookmark export.');
  const bookmarks: ImportBookmark[] = [];
  for (const row of rows) {
    const get = (name: string) => (col(name) >= 0 ? (row[col(name)] ?? '').trim() : '');
    if (!get('url')) continue;
    const created = Date.parse(get('created'));
    bookmarks.push({
      folderPath: get('folder')
        .split('/')
        .map((p) => p.trim())
        .filter(Boolean),
      title: get('title') || get('url'),
      url: get('url'),
      note: get('note'),
      excerpt: get('excerpt'),
      tags: get('tags')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      favorite: get('favorite').toLowerCase() === 'true',
      created: Number.isFinite(created) ? created : undefined,
    });
  }
  return { bookmarks, emptyFolders: [] };
}

// Browser bookmarks (the bookmarks API tree)

export interface BrowserNode {
  title: string;
  url?: string;
  dateAdded?: number;
  children?: BrowserNode[];
}

export function fromBrowserTree(roots: BrowserNode[]): ParsedImport {
  const result: ParsedImport = { bookmarks: [], emptyFolders: [] };
  const walk = (node: BrowserNode, path: string[]) => {
    if (node.url) {
      if (/^(https?|ftp):/i.test(node.url)) {
        result.bookmarks.push({
          folderPath: path,
          title: node.title || node.url,
          url: node.url,
          note: '',
          excerpt: '',
          tags: [],
          favorite: false,
          created: node.dateAdded,
        });
      }
      return;
    }
    const next = node.title ? [...path, node.title] : path; // the invisible root has no title
    if (node.children?.length === 0 && node.title) result.emptyFolders.push(next);
    node.children?.forEach((child) => walk(child, next));
  };
  roots.forEach((root) => walk(root, []));
  return result;
}

// Export

function folderPath(folders: Map<string, Folder>, id: string | null): string[] {
  const path: string[] = [];
  for (
    let f = id ? folders.get(id) : undefined;
    f;
    f = f.parentId ? folders.get(f.parentId) : undefined
  )
    path.unshift(f.name);
  return path;
}

/** Netscape bookmark HTML, which every browser and most services can import. */
export function toNetscape(folders: Folder[], bookmarks: Bookmark[]): string {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  const write = (parent: string | null, indent: string) => {
    for (const b of bookmarks.filter((x) => x.folderId === parent)) {
      const tags = b.tags.length ? ` TAGS="${escapeHtml(b.tags.join(','))}"` : '';
      lines.push(
        `${indent}<DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${Math.round(b.created / 1000)}"${tags}>${escapeHtml(b.title)}</A>`,
      );
      if (b.note) lines.push(`${indent}<DD>${escapeHtml(b.note)}`);
    }
    for (const f of folders.filter((x) => x.parentId === parent)) {
      lines.push(`${indent}<DT><H3>${escapeHtml(f.name)}</H3>`, `${indent}<DL><p>`);
      write(f.id, indent + '    ');
      lines.push(`${indent}</DL><p>`);
    }
  };
  write(null, '    ');
  lines.push('</DL><p>', '');
  return lines.join('\n');
}

export function toRaindropCsv(folders: Folder[], bookmarks: Bookmark[]): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const rows = bookmarks.map((b, i) => [
    String(i + 1),
    b.title,
    b.note,
    b.excerpt,
    b.url,
    folderPath(byId, b.folderId).join('/') || 'Unsorted',
    b.tags.join(', '),
    new Date(b.created).toISOString(),
    '',
    '',
    String(b.favorite),
  ]);
  return toCsv([csvColumns, ...rows]);
}

/** Everything BookPass knows about each bookmark, as JSON. */
export function toJson(folders: Folder[], bookmarks: Bookmark[]): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  return JSON.stringify(
    bookmarks.map((b) => ({
      title: b.title,
      url: b.url,
      note: b.note,
      excerpt: b.excerpt,
      folder: folderPath(byId, b.folderId),
      tags: b.tags,
      type: b.type,
      favorite: b.favorite,
      created: new Date(b.created).toISOString(),
      modified: new Date(b.modified).toISOString(),
    })),
    null,
    2,
  );
}
