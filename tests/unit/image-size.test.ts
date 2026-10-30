// Reading picture sizes from file headers, so a huge declared size is refused before decoding.
import { describe, expect, it } from "vitest";
import { imageSize, isTooLarge, maxImagePixels } from "../../src/image-size";

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) =>
      typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p,
    ),
  );
const be32 = (n: number) => [
  n >>> 24,
  (n >> 16) & 255,
  (n >> 8) & 255,
  n & 255,
];
const le16 = (n: number) => [n & 255, n >> 8];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, n >> 16];
const zeros = (n: number) => new Array<number>(n).fill(0);

const png = (w: number, h: number) =>
  bytes(
    [0x89],
    "PNG\r\n\x1a\n",
    be32(13),
    "IHDR",
    be32(w),
    be32(h),
    [8, 6, 0, 0, 0],
  );

describe("imageSize", () => {
  it("reads a PNG", () => {
    expect(imageSize(png(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it("reads a GIF", () => {
    expect(imageSize(bytes("GIF89a", le16(300), le16(200), [0, 0, 0]))).toEqual(
      { width: 300, height: 200 },
    );
  });

  it("reads a BMP", () => {
    const bmp = bytes(
      "BM",
      zeros(16),
      [...le24(50), 0],
      [...le24(30), 0],
      zeros(4),
    );
    expect(imageSize(bmp)).toEqual({ width: 50, height: 30 });
  });

  it("reads the three kinds of WebP", () => {
    const riff = (chunk: string, body: number[]) =>
      bytes("RIFF", zeros(4), "WEBP", chunk, zeros(4), body);
    expect(
      imageSize(riff("VP8X", [...zeros(4), ...le24(1999), ...le24(999), 0, 0])),
    ).toEqual({ width: 2000, height: 1000 });
    expect(
      imageSize(
        riff("VP8 ", [
          ...zeros(3),
          0x9d,
          0x01,
          0x2a,
          ...le16(640),
          ...le16(480),
        ]),
      ),
    ).toEqual({ width: 640, height: 480 });
    // 14 bit sizes, minus one: width 100 is 99, height 50 is 49.
    const w = 99;
    const h = 49;
    expect(
      imageSize(
        riff("VP8L", [
          0x2f,
          w & 255,
          (w >> 8) | ((h & 3) << 6),
          (h >> 2) & 255,
          h >> 10,
          ...zeros(8),
        ]),
      ),
    ).toEqual({ width: 100, height: 50 });
  });

  it("finds a JPEG's size after other segments", () => {
    const jpeg = bytes(
      [0xff, 0xd8],
      [0xff, 0xe1, 0, 8, 1, 2, 3, 4, 5, 6], // metadata
      [0xff, 0xff], // padding
      [0xff, 0xc4, 0, 4, 1, 2], // a table, which looks like a frame but is not
      [0xff, 0xc2, 0, 17, 8, 0x0b, 0xb8, 0x07, 0xd0, 3], // progressive, 2000 high, 3000 wide
      zeros(8),
    );
    expect(imageSize(jpeg)).toEqual({ width: 2000, height: 3000 });
  });

  it("gives up on formats and files it does not know", () => {
    expect(imageSize(bytes("<svg xmlns='x'></svg>"))).toBeUndefined();
    expect(imageSize(new Uint8Array(0))).toBeUndefined();
    expect(imageSize(bytes([0xff, 0xd8, 0xff]))).toBeUndefined();
    expect(imageSize(bytes([0x89], "PNG"))).toBeUndefined();
  });
});

describe("isTooLarge", () => {
  it("lets ordinary pictures through", () => {
    expect(isTooLarge(png(4000, 3000))).toBe(false);
    expect(isTooLarge(bytes("not a picture"))).toBe(false);
  });

  it("refuses a small file that declares an enormous picture", () => {
    expect(isTooLarge(png(65535, 65535))).toBe(true);
    expect(isTooLarge(png(100_000, 10))).toBe(false);
    expect(
      isTooLarge(
        png(
          Math.ceil(Math.sqrt(maxImagePixels)) + 1,
          Math.ceil(Math.sqrt(maxImagePixels)) + 1,
        ),
      ),
    ).toBe(true);
  });
});
