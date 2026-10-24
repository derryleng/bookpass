// Reads the page being saved: its title, description, site icon and a cover picture.
//
// Only the `activeTab` permission is used, which the browser grants for the one tab you opened BookPass on.
// A small function is injected into that tab to read the page. It can fetch the page's own images, but images from
// other sites usually refuse (CORS), so the fallback for the cover is a screenshot of the visible tab.
import { browser } from "wxt/browser";
import type { BookmarkType } from "./bookmark-model";

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
async function readPage(
  extraIcon: string | null,
  otherServers: boolean,
): Promise<PageRead> {
  const meta = (selector: string) =>
    document.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? "";
  const absolute = (href: string) => {
    try {
      return new URL(href, location.href).href;
    } catch {
      return "";
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
      // No cookies, no referrer, and the browser's own copy if it has one, so the site hears as little as possible.
      const response = await fetch(src, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "force-cache",
      });
      if (!response.ok) return undefined;
      const blob = await response.blob();
      if (blob.size > 6_000_000) return undefined;
      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        const scale = Math.min(1, width / (image.naturalWidth || width));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(
          1,
          Math.round((image.naturalWidth || width) * scale),
        );
        canvas.height = Math.max(
          1,
          Math.round((image.naturalHeight || width) * scale),
        );
        canvas
          .getContext("2d")!
          .drawImage(image, 0, 0, canvas.width, canvas.height);
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
      href: absolute(link.getAttribute("href") ?? ""),
      size: parseInt(link.sizes?.[0] ?? "0", 10) || 0,
    }))
    .filter((icon) => icon.href)
    .sort((a, b) => b.size - a.size)
    .map((icon) => icon.href);
  const candidates = [
    ...new Set([
      ...declared,
      absolute("/favicon.ico"),
      ...(extraIcon ? [extraIcon] : []),
    ]),
  ].slice(0, 4);
  let favicon: string | undefined;
  for (const candidate of candidates) {
    favicon = await pick(candidate, 64, "image/png");
    if (favicon) break;
  }

  const ogImage = absolute(
    meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]'),
  );
  // A preview image on another server was never requested by the page you are looking at, so it is read only if
  // the settings allow that. The screenshot is the fallback and stays on this computer.
  const sameServer =
    ogImage !== "" && new URL(ogImage).origin === location.origin;
  const cover =
    ogImage && (sameServer || otherServers)
      ? await pick(ogImage, 512, "image/jpeg", 0.85)
      : undefined;

  return {
    title: meta('meta[property="og:title"]') || document.title,
    description:
      meta('meta[name="description"]') ||
      meta('meta[property="og:description"]'),
    canonical: absolute(
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ??
        "",
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
      return "";
    }
  })();
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(path)) return "image";
  if (/\.(pdf|docx?|xlsx?|pptx?|odt)$/.test(path)) return "document";
  if (/\.(mp3|flac|ogg|wav|m4a)$/.test(path) || ogType.startsWith("music"))
    return "audio";
  if (
    ogType.startsWith("video") ||
    /(youtube\.com\/watch|youtu\.be\/|vimeo\.com\/)/.test(url)
  )
    return "video";
  if (ogType === "article") return "article";
  return "link";
}

/** A screenshot of the tab you are looking at, shrunk to a cover. Null where the browser does not allow it. */
async function screenshot(
  windowId: number | undefined,
): Promise<string | null> {
  try {
    return await browser.tabs.captureVisibleTab(windowId as number, {
      format: "jpeg",
      quality: 80,
    });
  } catch {
    return null;
  }
}

export const isSavable = (url: string | undefined): url is string =>
  !!url && /^https?:\/\//i.test(url);

/** Reads the tab. Pages the browser does not let us script (store pages, the PDF viewer) just give their title and address. */
export async function inspectTab(
  tab: {
    id?: number;
    url?: string;
    title?: string;
    favIconUrl?: string;
    windowId?: number;
  },
  wantCovers: boolean,
  otherServers = false,
): Promise<PageInfo> {
  const info: PageInfo = {
    title: tab.title ?? "",
    url: tab.url ?? "",
    description: "",
    type: guessType(tab.url ?? "", ""),
  };
  if (tab.id === undefined || !isSavable(tab.url)) return info;

  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: readPage,
      args: [
        tab.favIconUrl && /^https?:|^data:/.test(tab.favIconUrl)
          ? tab.favIconUrl
          : null,
        otherServers,
      ],
    });
    const page = result?.result as PageRead | undefined;
    if (page) {
      info.title = page.title || info.title;
      info.description = page.description;
      info.type = guessType(page.canonical || tab.url, page.ogType);
      if (wantCovers) {
        info.favicon = page.favicon;
        info.cover =
          page.cover ?? (await screenshot(tab.windowId)) ?? undefined;
      }
    }
  } catch {
    // Not scriptable. A screenshot may still be allowed.
    if (wantCovers) info.cover = (await screenshot(tab.windowId)) ?? undefined;
  }
  return info;
}
