// The rules for which addresses the picture fetcher will contact and trust.
import { afterEach, describe, expect, it, vi } from "vitest";
import { canFetch, fetchPictures, sameSite } from "../../src/fetch-pictures";

describe("canFetch", () => {
  it("allows http and https addresses", () => {
    expect(canFetch("https://example.org/page")).toBe(true);
    expect(canFetch("http://example.org/")).toBe(true);
    expect(canFetch("http://localhost:3000/")).toBe(true);
  });

  it("refuses anything that is not a web address", () => {
    expect(canFetch("ftp://example.org/")).toBe(false);
    expect(canFetch("javascript:alert(1)")).toBe(false);
    expect(canFetch("not a url")).toBe(false);
  });
});

describe("sameSite", () => {
  it("accepts www and other subdomains of the same site", () => {
    expect(sameSite("https://example.org/a", "https://www.example.org/b")).toBe(
      true,
    );
    expect(sameSite("https://www.example.org/", "https://example.org/")).toBe(
      true,
    );
    expect(sameSite("https://example.org/", "https://cdn.example.org/x")).toBe(
      true,
    );
  });

  it("refuses a different site, including one that only looks similar", () => {
    expect(
      sameSite("https://example.org/", "https://tracker.example.net/"),
    ).toBe(false);
    expect(sameSite("https://example.org/", "https://badexample.org/")).toBe(
      false,
    );
    expect(
      sameSite("https://example.org/", "https://example.org.evil.test/"),
    ).toBe(false);
  });
});

describe("fetchPictures and the local network", () => {
  const options = { otherServers: true, coverWidth: 256 };
  const asked: string[] = [];

  /** A web page that lists the given picture links, and nothing else on the web. */
  function serve(html: string) {
    asked.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        asked.push(url);
        return asked.length === 1
          ? new Response(html, { headers: { "content-type": "text/html" } })
          : new Response("", { status: 404 });
      }),
    );
  }
  afterEach(() => vi.unstubAllGlobals());

  it("does not contact a private address the page names", async () => {
    serve(
      `<link rel="icon" href="http://192.168.1.1/admin/icon.png">
       <link rel="icon" href="http://localhost:8080/icon.png">
       <meta property="og:image" content="http://10.0.0.5/cover.jpg">`,
    );
    const result = await fetchPictures(
      "https://example.org/",
      { icon: true, cover: true },
      options,
    );
    expect(
      asked.filter((url) => /192\.168|localhost|10\.0\.0/.test(url)),
    ).toEqual([]);
    expect(asked).toContain("https://example.org/favicon.ico");
    expect(result.problems.join(" ")).toMatch(/your own network/);
  });

  it("still fetches public icons next to a private one", async () => {
    serve(
      `<link rel="icon" href="http://192.168.1.1/icon.png">
       <link rel="icon" href="https://cdn.example.net/icon.png">`,
    );
    await fetchPictures(
      "https://example.org/",
      { icon: true, cover: false },
      options,
    );
    expect(asked).toContain("https://cdn.example.net/icon.png");
  });

  it("lets a bookmark on the local network use pictures from it", async () => {
    serve(`<link rel="icon" href="http://192.168.1.1/icon.png">`);
    await fetchPictures(
      "http://192.168.1.1/",
      { icon: true, cover: false },
      options,
    );
    expect(asked).toContain("http://192.168.1.1/icon.png");
  });
});
