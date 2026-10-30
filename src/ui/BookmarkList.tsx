import { useEffect, useRef, useState } from "react";
import type { Bookmark, ViewSettings } from "../bookmark-model";
import { domainOf, type BookmarkGroup } from "../browse";
import { isWebUrl } from "../web-url";
import { send, useImage } from "./api";
import { btn } from "./cls";
import { isOurs, readDrag, startDrag } from "./dnd";
import { I } from "./Icon";
import { Favicon, SelectAll } from "./parts";

/** Bookmarks drawn this many at a time, adding more as the page is scrolled. */
const PAGE = 60;

// What differs between the four layouts. The class names starting with bm- are kept for the end to end tests.
const cardBase =
  "group/bm relative flex gap-3 rounded-[10px] border border-line bg-surface [&[draggable=true]]:cursor-grab";
const tile = "flex-col gap-0 overflow-hidden";
const tileActions =
  "absolute top-1.5 right-1.5 rounded-lg bg-surface p-0.5 shadow-card";
const tileTitle = "line-clamp-2 font-semibold";
const rowTitle = "block truncate font-semibold";
const layoutClass = {
  list: {
    wrap: "flex flex-col gap-2",
    item: "items-center py-2.5 pr-3 pl-3",
    cover: "h-17.5 w-28 shrink-0 rounded-[7px]",
    body: "min-w-0 flex-1",
    check: "static m-0 shrink-0",
    actions: "",
    title: rowTitle,
    meta: "",
  },
  headlines: {
    wrap: "flex flex-col rounded-[10px] border border-line bg-surface",
    item: "items-center rounded-none border-0 border-b py-1.5 pr-3 pl-3 last:border-b-0",
    cover: "",
    body: "flex min-w-0 flex-1 items-center gap-3.5",
    check: "static m-0 shrink-0",
    actions: "",
    title: "block min-w-0 truncate font-semibold",
    meta: "min-w-0 flex-1",
  },
  grid: {
    wrap: "grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4",
    item: tile,
    cover: "aspect-[16/10]",
    body: "px-3.5 pt-3 pb-3.5",
    check:
      "absolute top-2.5 left-2.5 box-content rounded-[5px] bg-surface p-0.5 shadow-card",
    actions: tileActions,
    title: tileTitle,
    meta: "mt-1.5",
  },
  masonry: {
    wrap: "columns-[230px] gap-x-4",
    item: `${tile} mb-4 break-inside-avoid`,
    cover: "aspect-[16/10] min-h-22.5",
    body: "px-3.5 pt-3 pb-3.5",
    check:
      "absolute top-2.5 left-2.5 box-content rounded-[5px] bg-surface p-0.5 shadow-card",
    actions: tileActions,
    title: tileTitle,
    meta: "mt-1.5",
  },
};

interface Props {
  /** The bookmarks in sections, or a single section with no title when they are not grouped. */
  groups: BookmarkGroup[];
  view: ViewSettings;
  selected: Set<string>;
  inTrash: boolean;
  onToggle: (id: string) => void;
  /** Picks or drops several at once, for the tick box of a section. */
  onPick: (ids: string[], on: boolean) => void;
  onEdit: (bookmark: Bookmark) => void;
  onTag: (tag: string) => void;
  /** Set when the list is in manual order, so dropping one bookmark on another reorders them. */
  onReorder?: (ids: string[], targetId: string, before: boolean) => void;
}

export function BookmarkList({
  groups,
  view,
  selected,
  inTrash,
  onToggle,
  onPick,
  onEdit,
  onTag,
  onReorder,
}: Props) {
  // How many are drawn. It starts over when the list is replaced by another one.
  const total = groups.reduce((n, g) => n + g.bookmarks.length, 0);
  const listKey = `${groups[0]?.bookmarks[0]?.id}:${view.layout}:${view.group}`;
  const [paging, setPaging] = useState({ listKey, shown: PAGE });
  const shown = paging.listKey === listKey ? paging.shown : PAGE;
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting))
          setPaging({ listKey, shown: shown + PAGE });
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [total, shown, listKey]);

  // The sections, with as many bookmarks drawn as have been scrolled to.
  const { visible } = groups.reduce(
    (acc, g) => {
      const part = g.bookmarks.slice(0, Math.max(0, shown - acc.used));
      if (part.length)
        acc.visible.push({ ...g, bookmarks: part, all: g.bookmarks });
      acc.used += g.bookmarks.length;
      return acc;
    },
    { visible: [] as (BookmarkGroup & { all: Bookmark[] })[], used: 0 },
  );

  return (
    <>
      {visible.map((group) => (
        <section
          className="mt-6.5 first:mt-0"
          key={group.key}
          aria-label={group.title || undefined}
        >
          {group.title && (
            <header className="group/head mb-3 flex items-center gap-2 border-b border-line pb-1.5">
              <SelectAll
                ids={group.all.map((b) => b.id)}
                picked={selected}
                onPick={onPick}
                label={`Select everything under ${group.title}`}
              />
              <h2 className="text-[15px] font-semibold">{group.title}</h2>
              <span className="text-muted">{group.all.length}</span>
            </header>
          )}
          <div className={layoutClass[view.layout].wrap}>
            {group.bookmarks.map((b) => (
              <BookmarkItem
                key={b.id}
                bookmark={b}
                view={view}
                selected={selected.has(b.id)}
                selecting={selected.size > 0}
                inTrash={inTrash}
                onToggle={() => onToggle(b.id)}
                onEdit={() => onEdit(b)}
                onTag={onTag}
                dragIds={selected.has(b.id) ? [...selected] : [b.id]}
                onReorder={onReorder}
              />
            ))}
          </div>
        </section>
      ))}
      {shown < total && (
        <div className="grid place-items-center p-6 text-muted" ref={sentinel}>
          <I n="spinner" spin />
        </div>
      )}
    </>
  );
}

function BookmarkItem({
  bookmark: b,
  view,
  selected,
  selecting,
  inTrash,
  onToggle,
  onEdit,
  onTag,
  dragIds,
  onReorder,
}: {
  dragIds: string[];
  onReorder?: Props["onReorder"];
  bookmark: Bookmark;
  view: ViewSettings;
  selected: boolean;
  /** Something in the list is picked, so every tick box shows. */
  selecting: boolean;
  inTrash: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onTag: (tag: string) => void;
}) {
  const wantsCover =
    view.showCover &&
    (view.layout === "grid" ||
      view.layout === "masonry" ||
      view.layout === "list");
  const cover = useImage(
    "cover",
    wantsCover && b.hasCover ? b.id : null,
    b.modified,
  );
  const domain = domainOf(b.url);
  const showCoverBox = wantsCover && (view.layout !== "list" || b.hasCover);
  const [dropMark, setDropMark] = useState<"before" | "after">();
  const c = layoutClass[view.layout];

  return (
    <article
      className={`${cardBase} ${c.item} ${selected ? "outline-2 outline-accent" : ""} ${
        dropMark === "before"
          ? "shadow-[0_-3px_0_var(--accent)]"
          : dropMark === "after"
            ? "shadow-[0_3px_0_var(--accent)]"
            : "hover:shadow-card"
      }`}
      draggable={!inTrash}
      onDragStart={(e) => startDrag(e, { kind: "bookmarks", ids: dragIds })}
      onDragOver={(e) => {
        if (!onReorder || !isOurs(e)) return;
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        setDropMark(e.clientY < box.top + box.height / 2 ? "before" : "after");
      }}
      onDragLeave={() => setDropMark(undefined)}
      onDrop={(e) => {
        const payload = readDrag(e);
        const before = dropMark === "before";
        setDropMark(undefined);
        if (onReorder && payload?.kind === "bookmarks") {
          e.preventDefault();
          onReorder(payload.ids, b.id, before);
        }
      }}
    >
      <input
        className={`z-1 size-4.5 cursor-pointer ${c.check} ${selecting || selected ? "opacity-100" : "opacity-0 group-hover/bm:opacity-100 focus-visible:opacity-100"}`}
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={`Select ${b.title}`}
      />
      {showCoverBox && (
        <div
          className={`grid place-items-center bg-raised bg-cover bg-center bg-no-repeat text-muted ${c.cover}`}
          role={cover ? "img" : undefined}
          aria-label={cover ? "Cover picture" : undefined}
          style={cover ? { backgroundImage: `url(${cover})` } : undefined}
        >
          {!cover && <Favicon iconId={b.iconId} url={b.url} />}
        </div>
      )}
      <div className={c.body}>
        {view.layout === "headlines" ? (
          <>
            <Favicon iconId={b.iconId} url={b.url} />
            <a
              className={`${c.title} text-fg no-underline hover:text-accent`}
              href={isWebUrl(b.url) ? b.url : undefined}
              target="_blank"
              rel="noreferrer noopener"
            >
              {b.title || b.url}
            </a>
            <span
              className={`flex items-center gap-2 text-xs text-muted ${c.meta}`}
            >
              <span className="truncate">{domain}</span>
            </span>
          </>
        ) : (
          <>
            <a
              className={`${c.title} text-fg no-underline hover:text-accent`}
              href={isWebUrl(b.url) ? b.url : undefined}
              target="_blank"
              rel="noreferrer noopener"
              title={b.title}
            >
              {b.title || b.url}
            </a>
            <div
              className={`flex items-center gap-2 text-xs text-muted ${c.meta}`}
            >
              <Favicon iconId={b.iconId} url={b.url} />
              <span className="truncate">{domain}</span>
              {b.favorite && <I n="star" className="text-star" />}
            </div>
            {view.showNote && (b.note || b.excerpt) && (
              <p className="mt-1 line-clamp-2 text-[13px] text-muted">
                {b.note || b.excerpt}
              </p>
            )}
            {view.showTags && b.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {b.tags.map((t) => (
                  <button
                    key={t}
                    className="cursor-pointer rounded-full bg-raised px-2 py-px text-xs text-muted hover:text-accent"
                    onClick={() => onTag(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div
        className={`hidden gap-0.5 group-focus-within/bm:flex group-hover/bm:flex ${c.actions}`}
      >
        {inTrash ? (
          <>
            <button
              className={btn("quiet square")}
              title="Restore"
              aria-label="Restore"
              onClick={() => void send("restoreBookmarks", { ids: [b.id] })}
            >
              <I n="rotate-left" />
            </button>
            <button
              className={btn("quiet square")}
              title="Delete forever"
              aria-label="Delete forever"
              onClick={() => void send("deleteForever", { ids: [b.id] })}
            >
              <I n="trash" />
            </button>
          </>
        ) : (
          <>
            <button
              className={btn(b.favorite ? "star square" : "quiet square")}
              title={b.favorite ? "Remove from favorites" : "Add to favorites"}
              aria-label="Toggle favorite"
              onClick={() =>
                void send("updateBookmark", {
                  id: b.id,
                  patch: { favorite: !b.favorite },
                })
              }
            >
              <I n="star" />
            </button>
            <button
              className={btn("quiet square")}
              title="Edit"
              aria-label="Edit"
              onClick={onEdit}
            >
              <I n="pen" />
            </button>
          </>
        )}
      </div>
    </article>
  );
}
