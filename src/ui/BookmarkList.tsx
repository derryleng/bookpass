import { useEffect, useRef, useState } from 'react';
import type { Bookmark, ViewSettings } from '../bookmark-model';
import { domainOf, type BookmarkGroup } from '../browse';
import { send, useImage } from './api';
import { isOurs, readDrag, startDrag } from './dnd';
import { I } from './Icon';
import { Favicon, SelectAll } from './parts';

/** Bookmarks drawn this many at a time, adding more as the page is scrolled. */
const PAGE = 60;

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
        if (entries.some((e) => e.isIntersecting)) setPaging({ listKey, shown: shown + PAGE });
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [total, shown, listKey]);

  // The sections, with as many bookmarks drawn as have been scrolled to.
  const { visible } = groups.reduce(
    (acc, g) => {
      const part = g.bookmarks.slice(0, Math.max(0, shown - acc.used));
      if (part.length) acc.visible.push({ ...g, bookmarks: part, all: g.bookmarks });
      acc.used += g.bookmarks.length;
      return acc;
    },
    { visible: [] as (BookmarkGroup & { all: Bookmark[] })[], used: 0 },
  );

  return (
    <>
      {visible.map((group) => (
        <section className="group" key={group.key} aria-label={group.title || undefined}>
          {group.title && (
            <header className="group-head">
              <SelectAll
                ids={group.all.map((b) => b.id)}
                picked={selected}
                onPick={onPick}
                label={`Select everything under ${group.title}`}
              />
              <h2>{group.title}</h2>
              <span className="muted">{group.all.length}</span>
            </header>
          )}
          <div className={`layout-${view.layout} ${selected.size ? 'selecting' : ''}`}>
            {group.bookmarks.map((b) => (
              <BookmarkItem
                key={b.id}
                bookmark={b}
                view={view}
                selected={selected.has(b.id)}
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
        <div className="more" ref={sentinel}>
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
  inTrash,
  onToggle,
  onEdit,
  onTag,
  dragIds,
  onReorder,
}: {
  dragIds: string[];
  onReorder?: Props['onReorder'];
  bookmark: Bookmark;
  view: ViewSettings;
  selected: boolean;
  inTrash: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onTag: (tag: string) => void;
}) {
  const wantsCover =
    view.showCover &&
    (view.layout === 'grid' || view.layout === 'masonry' || view.layout === 'list');
  const cover = useImage('cover', wantsCover && b.hasCover ? b.id : null, b.modified);
  const domain = domainOf(b.url);
  const showCoverBox = wantsCover && (view.layout !== 'list' || b.hasCover);
  const [dropMark, setDropMark] = useState<'before' | 'after'>();

  return (
    <article
      className={`bm ${selected ? 'selected' : ''} ${dropMark ? `drop-${dropMark}` : ''}`}
      draggable={!inTrash}
      onDragStart={(e) => startDrag(e, { kind: 'bookmarks', ids: dragIds })}
      onDragOver={(e) => {
        if (!onReorder || !isOurs(e)) return;
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        setDropMark(e.clientY < box.top + box.height / 2 ? 'before' : 'after');
      }}
      onDragLeave={() => setDropMark(undefined)}
      onDrop={(e) => {
        const payload = readDrag(e);
        const before = dropMark === 'before';
        setDropMark(undefined);
        if (onReorder && payload?.kind === 'bookmarks') {
          e.preventDefault();
          onReorder(payload.ids, b.id, before);
        }
      }}
    >
      <input
        className="bm-check"
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={`Select ${b.title}`}
      />
      {showCoverBox && (
        <div className="bm-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
          {!cover && <Favicon iconId={b.iconId} url={b.url} />}
        </div>
      )}
      <div className="bm-body">
        {view.layout === 'headlines' ? (
          <>
            <Favicon iconId={b.iconId} url={b.url} />
            <a className="bm-title" href={b.url} target="_blank" rel="noreferrer noopener">
              {b.title || b.url}
            </a>
            <span className="bm-meta grow">
              <span className="domain">{domain}</span>
            </span>
          </>
        ) : (
          <>
            <a
              className="bm-title"
              href={b.url}
              target="_blank"
              rel="noreferrer noopener"
              title={b.title}
            >
              {b.title || b.url}
            </a>
            <div className="bm-meta">
              <Favicon iconId={b.iconId} url={b.url} />
              <span className="domain">{domain}</span>
              {b.favorite && <I n="star" className="fav on" />}
            </div>
            {view.showNote && (b.note || b.excerpt) && (
              <p className="bm-note">{b.note || b.excerpt}</p>
            )}
            {view.showTags && b.tags.length > 0 && (
              <div className="bm-tags">
                {b.tags.map((t) => (
                  <button key={t} className="tag" onClick={() => onTag(t)}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="bm-actions">
        {inTrash ? (
          <>
            <button
              className="btn ghost square"
              title="Restore"
              aria-label="Restore"
              onClick={() => void send('restoreBookmarks', { ids: [b.id] })}
            >
              <I n="rotate-left" />
            </button>
            <button
              className="btn ghost square"
              title="Delete forever"
              aria-label="Delete forever"
              onClick={() => void send('deleteForever', { ids: [b.id] })}
            >
              <I n="trash" />
            </button>
          </>
        ) : (
          <>
            <button
              className={`btn ghost square fav ${b.favorite ? 'on' : ''}`}
              title={b.favorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-label="Toggle favorite"
              onClick={() =>
                void send('updateBookmark', { id: b.id, patch: { favorite: !b.favorite } })
              }
            >
              <I n="star" />
            </button>
            <button className="btn ghost square" title="Edit" aria-label="Edit" onClick={onEdit}>
              <I n="pen" />
            </button>
          </>
        )}
      </div>
    </article>
  );
}
