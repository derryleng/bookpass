// Reads the page being saved: its title, description, site icon and a cover picture.
//
// Only the `activeTab` permission is used, which the browser grants for the one tab you opened BookPass on.
// A small function is injected into that tab to read the page. It can fetch the page's own images, but images from
// other sites usually refuse (CORS), so the fallback for the cover is a screenshot of the visible tab.
import { browser } from 'wxt/browser';
import { toBase64 } from './base64';
import type { BookmarkType } from './bookmark-model';
import { maxCoverBytes } from './constants';

export interface PageInfo {
  title: string;
  url: string;
  description: string;
  type: BookmarkType;
  /** The site icon as a PNG data URL, if one could be read. */
  favicon?: string;
  /** A cover picture as a data URL, if the page offered one that could be read. */
  cover?: string;
}

/** What the injected function sends back. */
interface PageRead {
  title: string;
  description: string;
  canonical: string;
  ogType: string;
  favicon?: string;
  cover?: string;
}

/**
 * Runs inside the web page, so it must not use anything from this file: the browser copies only its source.
 * Keep it self-contained.
 */
async function readPage(extraIcon: string | null): Promise<PageRead> {
  const meta = (selector: string) =>
    document.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? '';
  const absolute = (href: string) => {
    try {
      return new URL(href, location.href).href;
    } catch {
      return '';
    }
  };

  // Fetches an image, decodes it, and draws it onto a canvas no wider than `width`.
  async function pick(
    src: string,
    width: number,
    type: string,
    quality?: number,
  ): Promise<string | undefined> {
    try {
      const response = await fetch(src, { credentials: 'omit' });
      if (!response.ok) return undefined;
      const blob = await response.blob();
      if (blob.size > 6_000_000) return undefined;
      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        const scale = Math.min(1, width / (image.naturalWidth || width));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((image.naturalWidth || width) * scale));
        canvas.height = Math.max(1, Math.round((image.naturalHeight || width) * scale));
        canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL(type, quality);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      return undefined;
    }
  }

  // Site icon: the largest declared icon first, then the classic favicon.ico, then the tab's own idea of it.
  const declared = [
    ...document.querySelectorAll<HTMLLinkElement>(
      'link[rel~="icon"], link[rel="apple-touch-icon"]',
    ),
  ]
    .map((link) => ({
      href: absolute(link.getAttribute('href') ?? ''),
      size: parseInt(link.sizes?.[0] ?? '0', 10) || 0,
    }))
    .filter((icon) => icon.href)
    .sort((a, b) => b.size - a.size)
    .map((icon) => icon.href);
  const candidates = [
    ...new Set([...declared, absolute('/favicon.ico'), ...(extraIcon ? [extraIcon] : [])]),
  ].slice(0, 4);
  let favicon: string | undefined;
  for (const candidate of candidates) {
    favicon = await pick(candidate, 64, 'image/png');
    if (favicon) break;
  }

  const ogImage = absolute(meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]'));
  const cover = ogImage ? await pick(ogImage, 512, 'image/jpeg', 0.85) : undefined;

  return {
    title: meta('meta[property="og:title"]') || document.title,
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    canonical: absolute(
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? '',
    ),
    ogType: meta('meta[property="og:type"]'),
    favicon,
    cover,
  };
}

function guessType(url: string, ogType: string): BookmarkType {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(path)) return 'image';
  if (/\.(pdf|docx?|xlsx?|pptx?|odt)$/.test(path)) return 'document';
  if (/\.(mp3|flac|ogg|wav|m4a)$/.test(path) || ogType.startsWith('music')) return 'audio';
  if (ogType.startsWith('video') || /(youtube\.com\/watch|youtu\.be\/|vimeo\.com\/)/.test(url))
    return 'video';
  if (ogType === 'article') return 'article';
  return 'link';
}

/** A screenshot of the tab you are looking at, shrunk to a cover. Null where the browser does not allow it. */
async function screenshot(windowId: number | undefined): Promise<string | null> {
  try {
    return await browser.tabs.captureVisibleTab(windowId as number, {
      format: 'jpeg',
      quality: 80,
    });
  } catch {
    return null;
  }
}

/** An image as pixels. Works in a page and in the background, which has no document. */
async function decode(dataUrl: string): Promise<ImageBitmap> {
  return createImageBitmap(await (await fetch(dataUrl)).blob());
}

async function encode(image: ImageBitmap, width: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, width / image.width);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d')!.drawImage(image, 0, 0, w, h);
  return canvas.convertToBlob({ type: 'image/webp', quality });
}

/**
 * Shrinks a picture to a cover: no wider than `width`, as WebP, squeezed until it is no bigger than `maxBytes`
 * (smaller pictures first, then lower quality). A vault holds one per bookmark, so they must stay small.
 * Returns base64. The browser may fall back to PNG if it cannot make WebP, which is fine.
 */
export async function shrinkCover(
  dataUrl: string,
  width = 256,
  maxBytes = maxCoverBytes,
): Promise<string> {
  const image = await decode(dataUrl);
  let best: Blob | undefined;
  for (const [w, quality] of [
    [width, 0.72],
    [width, 0.55],
    [width, 0.4],
    [Math.round(width * 0.75), 0.4],
    [Math.round(width * 0.5), 0.35],
  ] as const) {
    const blob = await encode(image, w, quality);
    if (!best || blob.size < best.size) best = blob;
    if (blob.size <= maxBytes) break;
  }
  image.close();
  return toBase64(new Uint8Array(await best!.arrayBuffer()));
}

export const isSavable = (url: string | undefined): url is string =>
  !!url && /^https?:\/\//i.test(url);

/** Reads the tab. Pages the browser does not let us script (store pages, the PDF viewer) just give their title and address. */
export async function inspectTab(
  tab: { id?: number; url?: string; title?: string; favIconUrl?: string; windowId?: number },
  wantCovers: boolean,
): Promise<PageInfo> {
  const info: PageInfo = {
    title: tab.title ?? '',
    url: tab.url ?? '',
    description: '',
    type: guessType(tab.url ?? '', ''),
  };
  if (tab.id === undefined || !isSavable(tab.url)) return info;

  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: readPage,
      args: [tab.favIconUrl && /^https?:|^data:/.test(tab.favIconUrl) ? tab.favIconUrl : null],
    });
    const page = result?.result as PageRead | undefined;
    if (page) {
      info.title = page.title || info.title;
      info.description = page.description;
      info.type = guessType(page.canonical || tab.url, page.ogType);
      if (wantCovers) {
        info.favicon = page.favicon;
        info.cover = page.cover ?? (await screenshot(tab.windowId)) ?? undefined;
      }
    }
  } catch {
    // Not scriptable. A screenshot may still be allowed.
    if (wantCovers) info.cover = (await screenshot(tab.windowId)) ?? undefined;
  }
  return info;
}
