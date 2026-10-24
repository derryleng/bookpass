import { describe, expect, it } from "vitest";
import {
  defaultView,
  type Bookmark,
  type Folder,
  type Snapshot,
} from "../../src/bookmark-model";
import {
  bookmarksFor,
  buildTree,
  descendantIds,
  domainOf,
  folderOptions,
  groupBookmarks,
  matchesQuery,
  reorder,
  normalizeUrl,
  sortBookmarks,
  tagCounts,
} from "../../src/browse";

const bookmark = (over: Partial<Bookmark>): Bookmark => ({
  id: "b" + Math.random(),
  folderId: null,
  title: "Title",
  url: "https://example.com/",
  note: "",
  excerpt: "",
  type: "link",
  favorite: false,
  tags: [],
  order: 0,
  created: 0,
  modified: 0,
  hasCover: false,
  iconId: null,
  ...over,
});

const folder = (
  id: string,
  parentId: string | null,
  name = id,
  order = 0,
): Folder => ({
  id,
  parentId,
  name,
  note: "",
  icon: "fa-solid:folder",
  color: "",
  order,
  view: defaultView,
  expanded: false,
});

describe("urls", () => {
  it("finds the site name", () => {
    expect(domainOf("https://www.example.com/a/b?c=d")).toBe("example.com");
    expect(domainOf("not a url")).toBe("");
  });

  it("treats fragments and trailing slashes as the same page", () => {
    expect(normalizeUrl("https://Example.com/page/#top")).toBe(
      normalizeUrl("https://example.com/page"),
    );
    expect(normalizeUrl("https://example.com/a")).not.toBe(
      normalizeUrl("https://example.com/b"),
    );
  });
});

describe("folder tree", () => {
  const folders = [
    folder("b", null, "B"),
    folder("a", null, "A"),
    folder("a1", "a", "A1"),
    folder("a2", "a", "A2"),
    folder("a11", "a1"),
  ];
  const bookmarks = [
    bookmark({ folderId: "a" }),
    bookmark({ folderId: "a1" }),
    bookmark({ folderId: "a11" }),
    bookmark({ folderId: "a11" }),
  ];
  const tree = buildTree(folders, bookmarks);

  it("nests folders and sorts siblings by name", () => {
    expect(tree.map((n) => n.folder.id)).toEqual(["a", "b"]);
    expect(tree[0]!.children.map((n) => n.folder.id)).toEqual(["a1", "a2"]);
  });

  it("counts bookmarks directly and with subfolders", () => {
    expect(tree[0]).toMatchObject({ own: 1, total: 4 });
    expect(tree[1]).toMatchObject({ own: 0, total: 0 });
  });

  it("lists a folder with everything below it", () => {
    expect([...descendantIds(tree, "a1")].sort()).toEqual(["a1", "a11"]);
  });

  it("builds a picker that can hide a folder and its children", () => {
    const options = folderOptions(tree, descendantIds(tree, "a1"));
    expect(options.map((o) => `${o.depth}${o.id}`)).toEqual([
      "0a",
      "1a2",
      "0b",
    ]);
  });

  it("keeps a folder whose parent is missing", () => {
    expect(
      buildTree([folder("x", "gone")], []).map((n) => n.folder.id),
    ).toEqual(["x"]);
  });
});

describe("search", () => {
  const b = bookmark({
    title: "Rust Book",
    url: "https://doc.rust-lang.org/book/",
    note: "learn ownership",
    tags: ["Rust", "learning"],
    favorite: true,
  });

  it("matches words anywhere, case insensitively, all of them", () => {
    expect(matchesQuery(b, "rust ownership")).toBe(true);
    expect(matchesQuery(b, "rust python")).toBe(false);
  });

  it("understands tags, domains and favorites", () => {
    expect(matchesQuery(b, "#rust")).toBe(true);
    expect(matchesQuery(b, "#go")).toBe(false);
    expect(matchesQuery(b, "domain:rust-lang")).toBe(true);
    expect(matchesQuery(b, "is:fav")).toBe(true);
    expect(matchesQuery(bookmark({}), "is:fav")).toBe(false);
  });
});

describe("sorting and selections", () => {
  const list = [
    bookmark({ id: "1", title: "banana", created: 1, url: "https://b.test/" }),
    bookmark({ id: "2", title: "Apple", created: 3, url: "https://c.test/" }),
    bookmark({ id: "3", title: "cherry", created: 2, url: "https://a.test/" }),
  ];
  const ids = (l: Bookmark[]) => l.map((b) => b.id).join("");

  it("sorts by each key in both directions", () => {
    expect(ids(sortBookmarks(list, { sort: "title", sortDir: "asc" }))).toBe(
      "213",
    );
    expect(ids(sortBookmarks(list, { sort: "added", sortDir: "desc" }))).toBe(
      "231",
    );
    expect(ids(sortBookmarks(list, { sort: "domain", sortDir: "asc" }))).toBe(
      "312",
    );
  });

  const snapshot: Snapshot = {
    folders: [folder("f", null), folder("g", "f")],
    bookmarks: [
      bookmark({ id: "loose" }),
      bookmark({ id: "in-f", folderId: "f", tags: ["x"], favorite: true }),
      bookmark({ id: "in-g", folderId: "g" }),
    ],
    trash: [bookmark({ id: "gone" })],
  };
  const show = (
    selection: Parameters<typeof bookmarksFor>[1],
    over = {},
    query = "",
  ) =>
    bookmarksFor(
      snapshot,
      selection,
      { ...defaultView, sort: "title", ...over },
      query,
    )
      .map((b) => b.id)
      .sort();

  it("picks bookmarks for each part of the sidebar", () => {
    expect(show({ kind: "all" })).toEqual(["in-f", "in-g", "loose"]);
    expect(show({ kind: "unsorted" })).toEqual(["loose"]);
    expect(show({ kind: "favorites" })).toEqual(["in-f"]);
    expect(show({ kind: "tag", tag: "x" })).toEqual(["in-f"]);
    expect(show({ kind: "trash" })).toEqual(["gone"]);
  });

  it("shows subfolder bookmarks only when asked", () => {
    expect(show({ kind: "folder", id: "f" })).toEqual(["in-f"]);
    expect(show({ kind: "folder", id: "f" }, { subfolders: true })).toEqual([
      "in-f",
      "in-g",
    ]);
  });

  it("searches everything, whatever is selected", () => {
    expect(show({ kind: "trash" }, {}, "title")).toEqual([
      "in-f",
      "in-g",
      "loose",
    ]);
  });

  it("counts tags, most used first", () => {
    const tags = tagCounts([
      bookmark({ tags: ["a", "b"] }),
      bookmark({ tags: ["b"] }),
    ]);
    expect(tags).toEqual([
      { tag: "b", count: 2 },
      { tag: "a", count: 1 },
    ]);
  });
});

describe("manual order", () => {
  const list = (...orders: number[]) =>
    orders.map((order, i) =>
      bookmark({
        id: String.fromCharCode(97 + i),
        order,
        title: String.fromCharCode(97 + i),
      }),
    );
  const apply = (items: Bookmark[], updates: { id: string; order: number }[]) =>
    sortBookmarks(
      items.map((b) => ({
        ...b,
        order: updates.find((u) => u.id === b.id)?.order ?? b.order,
      })),
      { sort: "manual", sortDir: "asc" },
    )
      .map((b) => b.id)
      .join("");

  it("puts a dragged bookmark between two others, changing only its own value", () => {
    const items = list(10, 20, 30, 40); // a b c d
    const updates = reorder(items, ["d"], "a", false, "asc"); // after a
    expect(updates).toHaveLength(1);
    expect(apply(items, updates)).toBe("adbc");
  });

  it("can go first and last, and keeps several dragged items in order", () => {
    const items = list(10, 20, 30, 40);
    expect(apply(items, reorder(items, ["c"], "a", true, "asc"))).toBe("cabd");
    expect(apply(items, reorder(items, ["a"], "d", false, "asc"))).toBe("bcda");
    expect(apply(items, reorder(items, ["d", "c"], "a", true, "asc"))).toBe(
      "cdab",
    );
  });

  it("works when the list is shown in reverse", () => {
    const items = list(40, 30, 20, 10); // shown top to bottom: a b c d, with falling values
    const moved = apply(
      items,
      reorder(items, ["d"], "a", false, "desc"), // after a
    );
    // Read back in descending order to match what is on screen.
    const screen = sortBookmarks(
      items.map((b) => ({
        ...b,
        order:
          reorder(items, ["d"], "a", false, "desc").find((u) => u.id === b.id)
            ?.order ?? b.order,
      })),
      { sort: "manual", sortDir: "desc" },
    )
      .map((b) => b.id)
      .join("");
    expect(screen).toBe("adbc");
    expect(moved.length).toBe(4);
  });

  it("numbers everything again when neighbours share a value", () => {
    const items = list(0, 0, 0, 0);
    const updates = reorder(items, ["d"], "a", false, "asc"); // between a and b
    expect(updates).toHaveLength(4);
    expect(apply(items, updates)).toBe("adbc");
  });

  it("does nothing for a target that is not in the list", () => {
    expect(reorder(list(1, 2), ["a"], "zzz", true, "asc")).toEqual([]);
  });
});

describe("grouping", () => {
  const folders = [
    folder("r", null, "Recipes", 1),
    folder("b", "r", "Baking", 1),
    folder("d", "b", "Bread", 1),
    folder("w", null, "Work", 2),
  ];
  const day = (n: number) => new Date(2026, 9, n, 12).getTime();
  const list = [
    bookmark({
      id: "1",
      title: "Pasta",
      folderId: "r",
      url: "https://www.food.test/a",
      created: day(24),
    }),
    bookmark({
      id: "2",
      title: "Sourdough",
      folderId: "b",
      url: "https://bread.test/",
      created: day(3),
    }),
    bookmark({
      id: "3",
      title: "Baguette",
      folderId: "d",
      url: "https://bread.test/b",
      created: day(1),
    }),
    bookmark({
      id: "4",
      title: "Éclair",
      folderId: "b",
      url: "https://food.test/c",
      created: new Date(2026, 8, 5).getTime(),
    }),
    bookmark({
      id: "5",
      title: "2026 plan",
      folderId: "w",
      url: "https://work.test/",
      created: day(2),
    }),
    bookmark({
      id: "6",
      title: "Loose",
      folderId: null,
      url: "not a url",
      created: day(2),
    }),
  ];
  const titles = (groups: ReturnType<typeof groupBookmarks>) =>
    groups.map((g) => g.title);
  const ids = (groups: ReturnType<typeof groupBookmarks>) =>
    groups.map((g) => g.bookmarks.map((b) => b.id));

  it("leaves the list as one untitled section when not grouped", () => {
    const groups = groupBookmarks(list, "none", { folders }, { kind: "all" });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.title).toBe("");
    expect(groups[0]!.bookmarks).toEqual(list);
  });

  it("groups by folder with the whole path, in tree order, with unsorted last", () => {
    const groups = groupBookmarks(list, "folder", { folders }, { kind: "all" });
    expect(titles(groups)).toEqual([
      "Recipes",
      "Recipes / Baking",
      "Recipes / Baking / Bread",
      "Work",
      "Unsorted",
    ]);
    expect(ids(groups)).toEqual([["1"], ["2", "4"], ["3"], ["5"], ["6"]]);
  });

  it("names sections inside a folder from that folder down", () => {
    const inRecipes = groupBookmarks(
      list.filter((b) => b.folderId !== "w" && b.folderId),
      "folder",
      { folders },
      { kind: "folder", id: "r" },
    );
    expect(titles(inRecipes)).toEqual(["Recipes", "Baking", "Baking / Bread"]);
    const inBaking = groupBookmarks(
      list.filter((b) => ["b", "d"].includes(b.folderId ?? "")),
      "folder",
      { folders },
      { kind: "folder", id: "b" },
    );
    expect(titles(inBaking)).toEqual(["Baking", "Bread"]);
  });

  it("groups by first letter, ignoring accents, with other characters under #", () => {
    const groups = groupBookmarks(list, "title", { folders }, { kind: "all" });
    expect(titles(groups)).toEqual(["#", "B", "E", "L", "P", "S"]);
    expect(ids(groups)[0]).toEqual(["5"]);
  });

  it("groups by website without www, A to Z, with no website last", () => {
    const groups = groupBookmarks(
      list,
      "website",
      { folders },
      { kind: "all" },
    );
    expect(titles(groups)).toEqual([
      "bread.test",
      "food.test",
      "work.test",
      "No website",
    ]);
    expect(ids(groups)[1]).toEqual(["1", "4"]);
  });

  it("groups dates by month, newest month first, keeping the order within a month", () => {
    const groups = groupBookmarks(list, "added", { folders }, { kind: "all" });
    expect(groups).toHaveLength(2);
    expect(groups[0]!.key).toBe("2026-10");
    expect(groups[1]!.key).toBe("2026-09");
    expect(ids(groups)[0]).toEqual(["1", "2", "3", "5", "6"]);
  });
});
