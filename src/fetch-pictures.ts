// Fetching a bookmark's site icon and cover picture from the site itself, for bookmarks that were not saved from an
// open page (typed in, imported, or saved from a link). It runs in an extension page and needs access to the sites,
// which the person grants for the time it takes (see site-access.ts).
//
// How it keeps the footprint small:
//  - Nothing happens until the person asks, and never in the background.
//  - Requests carry no cookies, no referrer and no extra headers, and are never kept in the browser's cache, so the
//    site sees only a plain visit to an address it already knows about from the bookmark.
//  - Only https addresses are contacted (a plain http request can be read and changed on the way), except for the
//    computer's own addresses, which never leave it.
//  - An address that redirects to a different site is not trusted: whatever it returns is thrown away. A browser does
//    not let an extension stop a redirect before it is followed, so that other site has been asked once, without
//    cookies or a referrer.
//  - The page is read once, only far enough to find its picture links. Icons come from the page's own list, then
//    from /favicon.ico. A cover is taken only from the address, or one on the same site, unless the person has
//    allowed covers from other servers.
//  - Only pictures are kept, and only after being shrunk. Nothing else from the page is stored.
//  - There is no third party lookup service, so no one but the site hears about the bookmark.
import { shrinkCover, toIconPng } from './images';
import { findPictureLinks } from './pictures';

const MAX_PAGE_BYTES = 1_000_000;
const MAX_PICTURE_BYTES = 3_000_000;
const TIMEOUT_MS = 10_000;

export interface PictureWish {
  icon: boolean;
  cover: boolean;
}

export interface FetchedPictures {
  /** The icon as base64 PNG, with the site it belongs to. */
  icon?: { site: string; png: string };
  /** The cover as base64 WebP. */
  cover?: string;
  /** A cover was on another server and was left alone because that is not allowed. */
  skippedOtherServer?: boolean;
  /** Plain words about what did not work, for the person. */
  problems: string[];
}

interface Options {
  /** Allow covers from a server other than the page's. */
  otherServers: boolean;
  coverWidth: number;
  signal?: AbortSignal;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Whether BookPass will contact this address: https, or an address on this computer. */
export function canFetch(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' || (protocol === 'http:' && LOOPBACK.has(hostname));
  } catch {
    return false;
  }
}

/** The same site, allowing for www and other subdomains of it. */
export function sameSite(a: string, b: string): boolean {
  const host = (url: string) => new URL(url).hostname.replace(/^www\./, '');
  const [x, y] = [host(a), host(b)];
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

/** A GET with nothing extra sent. Returns the body, cut off at `limit` bytes. */
async function get(url: string, limit: number, signal?: AbortSignal) {
  const guard = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'follow',
    cache: 'no-store',
    signal: signal ? AbortSignal.any([guard, signal]) : guard,
  });
  if (response.url && !sameSite(url, response.url)) {
    void response.body?.cancel().catch(() => {});
    throw new Error('The address redirects to a different site, so nothing from it was kept');
  }
  if (!response.ok || !response.body) throw new Error(`The site answered ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  void reader.cancel().catch(() => {});
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return {
    bytes: bytes.subarray(0, Math.min(total, limit)),
    type: response.headers.get('content-type') ?? '',
    finalUrl: response.url || url,
    complete: total < limit,
  };
}

const origin = (url: string) => new URL(url).origin;

export async function fetchPictures(
  pageUrl: string,
  wish: PictureWish,
  options: Options,
): Promise<FetchedPictures> {
  const result: FetchedPictures = { problems: [] };
  if (!/^https?:\/\//i.test(pageUrl)) {
    result.problems.push('Only web addresses can be fetched.');
    return result;
  }
  if (!canFetch(pageUrl)) {
    result.problems.push(
      'The address is plain http, so it was not contacted. Only https is fetched.',
    );
    return result;
  }

  let links = { icons: [] as string[], covers: [] as string[] };
  let base = pageUrl;
  try {
    const page = await get(pageUrl, MAX_PAGE_BYTES, options.signal);
    base = page.finalUrl;
    if (/html|xml/i.test(page.type) || page.type === '') {
      links = findPictureLinks(new TextDecoder().decode(page.bytes), page.finalUrl);
    } else {
      result.problems.push('The address is not a web page, so it lists no pictures.');
    }
  } catch (error) {
    result.problems.push(`The page could not be read: ${(error as Error).message}.`);
  }
  const site = origin(base);

  if (wish.icon) {
    // Icons the page lists, then the classic place. A page's icon host is the page's own choice, so it is fine.
    for (const candidate of [...new Set([...links.icons, `${site}/favicon.ico`])]
      .filter(canFetch)
      .slice(0, 4)) {
      try {
        const picture = await get(candidate, MAX_PICTURE_BYTES, options.signal);
        result.icon = {
          site,
          png: await toIconPng(new Blob([picture.bytes as BlobPart], { type: picture.type })),
        };
        break;
      } catch {
        /* try the next one */
      }
    }
    if (!result.icon) result.problems.push('No site icon could be read.');
  }

  if (wish.cover) {
    const allowed = links.covers.filter(
      (href) => canFetch(href) && (options.otherServers || origin(href) === site),
    );
    result.skippedOtherServer = allowed.length < links.covers.length;
    for (const candidate of allowed.slice(0, 2)) {
      try {
        const picture = await get(candidate, MAX_PICTURE_BYTES, options.signal);
        result.cover = await shrinkCover(
          new Blob([picture.bytes as BlobPart], { type: picture.type }),
          options.coverWidth,
        );
        break;
      } catch {
        /* try the next one */
      }
    }
    if (!result.cover) {
      result.problems.push(
        links.covers.length === 0
          ? 'The page does not list a cover picture.'
          : result.skippedOtherServer && allowed.length === 0
            ? 'The cover picture is on another server, which is not allowed in the settings.'
            : 'The cover picture could not be read.',
      );
    }
  }
  return result;
}
