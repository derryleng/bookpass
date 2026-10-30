// Reading a picture's size from its first bytes, before the browser is asked to decode it. A file of a few kilobytes
// can declare a width and height in the tens of thousands, and decoding that takes gigabytes of memory.

/** Pictures with more pixels than this are not decoded. 6,000 by 6,000 is far more than a cover or an icon needs. */
export const maxImagePixels = 36_000_000;

const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u24le = (b: Uint8Array, at: number) => u16le(b, at) | (b[at + 2]! << 16);
const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u32be = (b: Uint8Array, at: number) =>
  u16be(b, at) * 65536 + u16be(b, at + 2);
const i32le = (b: Uint8Array, at: number) =>
  b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24);
const ascii = (b: Uint8Array, at: number, text: string) =>
  [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

export interface ImageSize {
  width: number;
  height: number;
}

/** PNG, JPEG, GIF, WebP and BMP. Anything else (SVG, ICO, AVIF) gives undefined, and the browser decides. */
export function imageSize(b: Uint8Array): ImageSize | undefined {
  if (b.length >= 24 && ascii(b, 1, "PNG\r\n\x1a\n")) {
    return { width: u32be(b, 16), height: u32be(b, 20) };
  }
  if (b.length >= 10 && ascii(b, 0, "GIF8")) {
    return { width: u16le(b, 6), height: u16le(b, 8) };
  }
  if (b.length >= 26 && ascii(b, 0, "BM")) {
    return { width: Math.abs(i32le(b, 18)), height: Math.abs(i32le(b, 22)) };
  }
  if (b.length >= 30 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) {
    if (ascii(b, 12, "VP8X"))
      return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    if (ascii(b, 12, "VP8L") && b[20] === 0x2f) {
      return {
        width: 1 + (b[21]! | ((b[22]! & 0x3f) << 8)),
        height: 1 + ((b[22]! >> 6) | (b[23]! << 2) | ((b[24]! & 0x0f) << 10)),
      };
    }
    if (
      ascii(b, 12, "VP8 ") &&
      b[23] === 0x9d &&
      b[24] === 0x01 &&
      b[25] === 0x2a
    )
      return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    return undefined;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return jpegSize(b);
  return undefined;
}

/** A JPEG is a list of segments. The size is in the "start of frame" one, which follows any thumbnails and metadata. */
function jpegSize(b: Uint8Array): ImageSize | undefined {
  let at = 2;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) return undefined;
    const marker = b[at + 1]!;
    if (marker === 0xff) {
      at++; // padding
      continue;
    }
    const startOfFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (startOfFrame) {
      return at + 9 <= b.length
        ? { width: u16be(b, at + 7), height: u16be(b, at + 5) }
        : undefined;
    }
    if (marker === 0xda || marker === 0xd9) return undefined; // the picture data starts without a size
    at += 2 + u16be(b, at + 2);
  }
  return undefined;
}

/** Whether decoding this picture would take more memory than BookPass allows. Pictures of unknown size pass. */
export function isTooLarge(bytes: Uint8Array): boolean {
  const size = imageSize(bytes);
  return !!size && size.width * size.height > maxImagePixels;
}
