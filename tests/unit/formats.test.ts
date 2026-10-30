import { describe, expect, it } from "vitest";
import {
  defaultView,
  type Bookmark,
  type Folder,
} from "../../src/bookmark-model";
import {
  fromBrowserTree,
  parseCsv,
  parseNetscape,
  parseRaindropCsv,
  toCsv,
  toNetscape,
  toRaindropCsv,
} from "../../src/formats";

const chromeExport = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://example.com/a?x=1&amp;y=2" ADD_DATE="1700000100" TAGS="one,two">Tom &amp; Jerry</A>
        <DD>A note about it
        <DT><H3>News</H3>
        <DL><p>
            <DT><A HREF="https://news.test/" ADD_DATE="1700000200">News</A>
        </DL><p>
        <DT><H3>Empty</H3>
        <DL><p>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://top.test/">Top level</A>
    <DT><A HREF="javascript:alert(1)">Bookmarklet</A>
</DL><p>`;

describe("Netscape bookmark files", () => {
  const parsed = parseNetscape(chromeExport);

  it("reads titles, addresses, tags, dates and notes", () => {
    const first = parsed.bookmarks[0]!;
    expect(first).toMatchObject({
      title: "Tom & Jerry",
      url: "https://example.com/a?x=1&y=2",
      tags: ["one", "two"],
      note: "A note about it",
      created: 1700000100 * 1000,
      folderPath: ["Bookmarks bar"],
    });
  });

  it("keeps the folder nesting and top level bookmarks", () => {
    expect(parsed.bookmarks.map((b) => b.folderPath.join("/"))).toEqual([
      "Bookmarks bar",
      "Bookmarks bar/News",
      "",
    ]);
  });

  it("skips bookmarklets and creates folders that are empty", () => {
    expect(parsed.bookmarks.some((b) => b.url.startsWith("javascript"))).toBe(
      false,
    );
    expect(parsed.emptyFolders).toEqual([["Bookmarks bar", "Empty"]]);
  });

  it("keeps only web addresses, however the scheme is written", () => {
    const anchors = [
      "javascript:alert(1)",
      "java\tscript:alert(1)",
      "  JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "vbscript:x",
      "place:sort=8",
      "about:blank",
      "mailto:me@example.org",
      "/relative/path",
      "ftp://files.example.org/a",
      "https://ok.example.org/",
    ].map((href) => `<DT><A HREF="${href}">link</A>`);
    const parsed = parseNetscape(`<DL><p>${anchors.join("\n")}</DL><p>`);
    expect(parsed.bookmarks.map((b) => b.url)).toEqual([
      "ftp://files.example.org/a",
      "https://ok.example.org/",
    ]);
  });

  it("reads a file of unclosed tags in linear time", () => {
    // Every search for a closing tag used to run to the end of the file. 40,000 of them took about 8 seconds.
    const unclosed = "<DL>" + '<DT><A HREF="https://x.test/">'.repeat(40_000);
    const noTagEnd = "<a".repeat(300_000);
    const started = Date.now();
    expect(parseNetscape(unclosed).bookmarks).toHaveLength(40_000);
    expect(parseNetscape(noTagEnd).bookmarks).toEqual([]);
    expect(parseNetscape("<h3>".repeat(40_000)).bookmarks).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("keeps a note at the end of a cut off file", () => {
    const parsed = parseNetscape(
      '<DL><DT><A HREF="https://x.test/">x</A>\n<DD>last note\n<DT><A HREF="htt',
    );
    expect(parsed.bookmarks).toHaveLength(1);
    expect(parsed.bookmarks[0]!.note).toBe("last note");
    expect(
      parseNetscape('<DT><A HREF="https://x.test/">x</A><DD>no tag after me')
        .bookmarks[0]!.note,
    ).toBe("no tag after me");
  });

  it("survives an empty or broken file", () => {
    expect(parseNetscape("").bookmarks).toEqual([]);
    expect(() =>
      parseNetscape('<DL><DT><A HREF="https://x.test/">Never closed'),
    ).not.toThrow();
  });
});

describe("CSV", () => {
  it("reads quotes, commas and line breaks inside fields", () => {
    const rows = parseCsv('a,"b, c","say ""hi""","line\nbreak"\r\n1,2,3,4\r\n');
    expect(rows).toEqual([
      ["a", "b, c", 'say "hi"', "line\nbreak"],
      ["1", "2", "3", "4"],
    ]);
  });

  it("writes what it reads", () => {
    const rows = [["a", "b,c", 'say "hi"', "x\ny"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("puts a quote before cells a spreadsheet would run as a formula", () => {
    const rows = [
      [
        '=HYPERLINK("http://evil.test")',
        "+1",
        "-2",
        "@SUM(A1)",
        "\tx",
        "plain",
        "a=b",
      ],
    ];
    expect(toCsv(rows)).toBe(
      `"'=HYPERLINK(""http://evil.test"")",'+1,'-2,'@SUM(A1),'\tx,plain,a=b\r\n`,
    );
  });

  it("skips rows whose address is not a web address", () => {
    const csv =
      "title,url\r\na,javascript:alert(1)\r\nb,file:///etc/passwd\r\nc,https://ok.test/\r\n";
    expect(parseRaindropCsv(csv).bookmarks.map((b) => b.url)).toEqual([
      "https://ok.test/",
    ]);
  });

  it("reads a Raindrop export", () => {
    const csv =
      "id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite\r\n" +
      '1,"Rust, the book","my note","about rust",https://doc.rust-lang.org/,Dev/Languages,"rust, books",2024-05-01T10:00:00.000Z,,,true\r\n' +
      "2,,,,https://plain.test/,Unsorted,,,,,false\r\n";
    const { bookmarks } = parseRaindropCsv(csv);
    expect(bookmarks).toHaveLength(2);
    expect(bookmarks[0]).toMatchObject({
      title: "Rust, the book",
      note: "my note",
      excerpt: "about rust",
      folderPath: ["Dev", "Languages"],
      tags: ["rust", "books"],
      favorite: true,
      created: Date.parse("2024-05-01T10:00:00.000Z"),
    });
    expect(bookmarks[1]).toMatchObject({
      title: "https://plain.test/",
      favorite: false,
    });
  });

  it("refuses a CSV that is not bookmarks", () => {
    expect(() => parseRaindropCsv("name,age\r\nann,3\r\n")).toThrow(
      /URL column/,
    );
  });
});

describe("browser bookmark trees", () => {
  it("flattens the tree, skipping the invisible root and non web addresses", () => {
    const { bookmarks, emptyFolders } = fromBrowserTree([
      {
        title: "",
        children: [
          {
            title: "Bookmarks bar",
            children: [
              { title: "Site", url: "https://site.test/", dateAdded: 5 },
              { title: "Settings", url: "chrome://settings" },
              { title: "Nothing here", children: [] },
            ],
          },
        ],
      },
    ]);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]).toMatchObject({
      folderPath: ["Bookmarks bar"],
      created: 5,
    });
    expect(emptyFolders).toEqual([["Bookmarks bar", "Nothing here"]]);
  });
});

describe("export", () => {
  const folder = (
    id: string,
    parentId: string | null,
    name: string,
  ): Folder => ({
    id,
    parentId,
    name,
    note: "",
    icon: "fa-solid:folder",
    color: "",
    order: 0,
    view: defaultView,
    expanded: false,
  });
  const bookmark = (over: Partial<Bookmark>): Bookmark => ({
    id: "x",
    folderId: null,
    title: "T",
    url: "https://t.test/",
    note: "",
    excerpt: "",
    type: "link",
    favorite: false,
    tags: [],
    order: 0,
    created: 1700000000000,
    modified: 1700000000000,
    hasCover: false,
    iconId: null,
    ...over,
  });
  const folders = [folder("a", null, "A & B"), folder("c", "a", "Child")];
  const bookmarks = [
    bookmark({
      folderId: "c",
      title: 'Tom & "Jerry"',
      url: "https://x.test/?a=1&b=2",
      tags: ["t1", "t2"],
      note: "n",
    }),
    bookmark({ title: "Loose" }),
  ];

  it("gives a Raindrop file back what it wrote, formula quotes and all", () => {
    const risky = [bookmark({ title: "=1+1", note: "-note", excerpt: "@x" })];
    const back = parseRaindropCsv(toRaindropCsv([], risky)).bookmarks;
    expect(back[0]).toMatchObject({
      title: "=1+1",
      note: "-note",
      excerpt: "@x",
    });
  });

  it("writes Netscape HTML that reads back the same", () => {
    const back = parseNetscape(toNetscape(folders, bookmarks));
    expect(back.bookmarks).toHaveLength(2);
    const nested = back.bookmarks.find((b) => b.folderPath.length)!;
    expect(nested).toMatchObject({
      title: 'Tom & "Jerry"',
      url: "https://x.test/?a=1&b=2",
      tags: ["t1", "t2"],
      note: "n",
      folderPath: ["A & B", "Child"],
      created: 1700000000000,
    });
  });

  it("writes a Raindrop style CSV that reads back the same", () => {
    const back = parseRaindropCsv(toRaindropCsv(folders, bookmarks)).bookmarks;
    expect(back.find((b) => b.title === "Loose")?.folderPath).toEqual([
      "Unsorted",
    ]);
    expect(back.find((b) => b.tags.length)).toMatchObject({
      folderPath: ["A & B", "Child"],
      tags: ["t1", "t2"],
    });
  });
});
