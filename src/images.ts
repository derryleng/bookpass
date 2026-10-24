// Turning pictures into the small, fixed shapes the vault stores: a 64 pixel PNG icon and a WebP cover.
// Works in a page and in the background (which has no document), apart from drawing an SVG, which needs a page.
import { toBase64 } from "./base64";
import { maxCoverBytes } from "./constants";

type Source = Blob | string;

/** An image as pixels. A string is a data URL. */
async function decode(source: Source): Promise<ImageBitmap> {
  const blob =
    typeof source === "string" ? await (await fetch(source)).blob() : source;
  try {
    return await createImageBitmap(blob);
  } catch (error) {
    // Browsers will not make a bitmap from an SVG, but a page can draw one.
    if (typeof document === "undefined" || !/svg/i.test(blob.type)) throw error;
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const w = image.naturalWidth || 256;
      const h = image.naturalHeight || 256;
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext("2d")!.drawImage(image, 0, 0, w, h);
      return await createImageBitmap(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function encode(
  image: ImageBitmap,
  width: number,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, width / image.width);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d")!.drawImage(image, 0, 0, w, h);
  return canvas.convertToBlob({ type: "image/webp", quality });
}

/**
 * Shrinks a picture to a cover: no wider than `width`, as WebP, squeezed until it is no bigger than `maxBytes`
 * (smaller pictures first, then lower quality). A vault holds one per bookmark, so they must stay small.
 * Returns base64. The browser may fall back to PNG if it cannot make WebP, which is fine.
 */
export async function shrinkCover(
  source: Source,
  width = 256,
  maxBytes = maxCoverBytes,
): Promise<string> {
  const image = await decode(source);
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

/** Draws a picture as a square PNG icon, centered, with its shape kept. Returns base64. */
export async function toIconPng(source: Source, size = 64): Promise<string> {
  const image = await decode(source);
  const scale = Math.min(size / image.width, size / image.height);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const canvas = new OffscreenCanvas(size, size);
  canvas
    .getContext("2d")!
    .drawImage(
      image,
      Math.round((size - w) / 2),
      Math.round((size - h) / 2),
      w,
      h,
    );
  image.close();
  return toBase64(
    new Uint8Array(
      await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer(),
    ),
  );
}
