import { useEffect, useRef, useState } from 'react';
import type { Bookmark, ViewSettings } from '../bookmark-model';
import { domainOf } from '../browse';
import { send, useImage } from './api';
import { I } from './Icon';
import { Favicon } from './parts';

/** Bookmarks drawn this many at a time, adding more as the page is scrolled. */
const PAGE = 60;

interface Props {
  bookmarks: Bookmark[];
  view: ViewSettings;
  selected: Set<string>;
  inTrash: boolean;
  onToggle: (id: string) => void;
  onEdit: (bookmark: Bookmark) => void;
  onTag: (tag: string) => void;
}

export function BookmarkList({
  bookmarks,
  view,
  selected,
  inTrash,
  onToggle,
  onEdit,
  onTag,
}: Props) {
  // How many are drawn. It starts over when the list is replaced by another one.
  const listKey = `${bookmarks[0]?.id}:${view.layout}`;
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
  }, [bookmarks.length, shown, listKey]);

  return (
    <>
      <div className={`layout-${view.layout} ${selected.size ? 'selecting' : ''}`}>
        {bookmarks.slice(0, shown).map((b) => (
          <BookmarkItem
            key={b.id}
            bookmark={b}
            view={view}
            selected={selected.has(b.id)}
            inTrash={inTrash}
            onToggle={() => onToggle(b.id)}
            onEdit={() => onEdit(b)}
            onTag={onTag}
          />
        ))}
      </div>
      {shown < bookmarks.length && (
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
}: {
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

  return (
    <article className={`bm ${selected ? 'selected' : ''}`}>
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
