import { describe, expect, it } from "vitest";
import { findPictureLinks } from "../../src/pictures";

const page = `<!doctype html><html><head>
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/favicon-16.png" sizes="16x16">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="48x48" href="https://cdn.example.com/icon-48.png">
<link rel="apple-touch-icon" sizes="180x180" href="apple-180.png">
<link rel="mask-icon" href="/mask.svg" color="#000">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<meta property="og:title" content="Hello &amp; goodbye">
<meta name="twitter:image" content="/twitter.jpg">
<meta property="og:image" content="//images.example.com/og.jpg?x=1&amp;y=2">
<meta property="og:image:secure_url" content="https://images.example.com/secure.jpg">
<meta property="og:image" content="javascript:alert(1)">
</head></html>`;

describe("findPictureLinks", () => {
  const found = findPictureLinks(page, "https://www.example.com/articles/one");

  it("puts scalable icons first, then the sizes nearest 64 pixels, and skips mask icons", () => {
    expect(found.icons).toEqual([
      "https://www.example.com/icon.svg",
      "https://cdn.example.com/icon-48.png",
      "https://www.example.com/articles/apple-180.png",
      "https://www.example.com/favicon.ico",
      "https://www.example.com/favicon-16.png",
    ]);
  });

  it("orders covers by how reliable the tag is and resolves addresses", () => {
    expect(found.covers).toEqual([
      "https://images.example.com/secure.jpg",
      "https://images.example.com/og.jpg?x=1&y=2",
      "https://www.example.com/twitter.jpg",
    ]);
  });

  it("only ever offers web addresses", () => {
    expect(
      [...found.icons, ...found.covers].every((href) =>
        /^https?:\/\//.test(href),
      ),
    ).toBe(true);
  });

  it("copes with a page that says nothing", () => {
    expect(
      findPictureLinks("<html><body>nothing</body></html>", "https://x.test/"),
    ).toEqual({
      icons: [],
      covers: [],
    });
    expect(findPictureLinks("", "not a base")).toEqual({
      icons: [],
      covers: [],
    });
  });
});
