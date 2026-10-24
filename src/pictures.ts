// Finding the pictures a web page points to, in its HTML. Pure text in, addresses out.
import { parseAttributes } from './formats';

export interface PictureLinks {
  /** Site icons, best first. */
  icons: string[];
  /** Cover pictures, best first. */
  covers: string[];
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href.trim(), base);
    return /^https?:$/.test(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Lower is better. A scalable icon or one near 64 pixels needs the least shrinking, a huge one the most. */
function rank(href: string, type: string | undefined, sizes: string | undefined): number {
  if (/svg/i.test(type ?? '') || /\.svg(\?|$)/i.test(href)) return 0;
  const size = parseInt(sizes ?? '', 10);
  if (!size) return 150; // unknown size, such as favicon.ico: after any icon of a good size
  if (size >= 32 && size <= 192) return Math.abs(size - 64);
  return 500 + Math.abs(size - 64);
}

export function findPictureLinks(html: string, base: string): PictureLinks {
  const icons: { href: string; rank: number }[] = [];
  const covers = new Map<string, number>();
  const coverOrder = ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'];

  for (const match of html.matchAll(/<(link|meta)\b([^>]*)>/gi)) {
    const tag = match[1]!.toLowerCase();
    const attrs = parseAttributes(match[2] ?? '');
    if (tag === 'link') {
      const rels = (attrs.rel ?? '').toLowerCase().split(/\s+/);
      const wanted = rels.includes('icon') || rels.some((r) => r.startsWith('apple-touch-icon'));
      const href = absolute(attrs.href, base);
      if (wanted && href && !rels.includes('mask-icon')) {
        icons.push({ href, rank: rank(href, attrs.type, attrs.sizes) });
      } else if (rels.includes('image_src') && href) {
        covers.set(href, coverOrder.length);
      }
    } else {
      const name = (attrs.property ?? attrs.name ?? '').toLowerCase();
      const at = coverOrder.indexOf(name);
      const href = absolute(attrs.content, base);
      if (at >= 0 && href && !covers.has(href)) covers.set(href, at);
    }
  }

  return {
    icons: [...new Map(icons.sort((a, b) => a.rank - b.rank).map((i) => [i.href, i])).keys()],
    covers: [...covers].sort((a, b) => a[1] - b[1]).map(([href]) => href),
  };
}
