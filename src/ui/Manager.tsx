import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultView, type Bookmark, type SortKey, type ViewSettings } from '../bookmark-model';
import { bookmarksFor, buildTree, type Selection } from '../browse';
import type { Layout } from '../settings';
import { send } from './api';
import { BookmarkList } from './BookmarkList';
import { BookmarkDialog } from './Dialogs';
import { I } from './Icon';
import { FolderSelect } from './parts';
import { SettingsPanel } from './SettingsPanel';
import { Shell, type PageContext } from './Shell';
import { Sidebar } from './Sidebar';

const layouts: { value: Layout; icon: string; label: string }[] = [
  { value: 'list', icon: 'list', label: 'List' },
  { value: 'grid', icon: 'table-cells-large', label: 'Grid' },
  { value: 'headlines', icon: 'bars', label: 'Headlines' },
  { value: 'masonry', icon: 'border-all', label: 'Masonry' },
];

const sorts: { value: SortKey; label: string }[] = [
  { value: 'added', label: 'Date added' },
  { value: 'edited', label: 'Date edited' },
  { value: 'title', label: 'Title' },
  { value: 'domain', label: 'Website' },
];

const VIEW_KEY = 'bookpass.view';
const everything: Selection = { kind: 'all' };

/** The view for places that are not a folder (All, Unsorted, tags...). It is remembered on this device. */
function useLocalView(
  initialLayout: Layout,
): [ViewSettings, (patch: Partial<ViewSettings>) => void] {
  const [view, setView] = useState<ViewSettings>(() => {
    try {
      return {
        ...defaultView,
        layout: initialLayout,
        ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}'),
      };
    } catch {
      return { ...defaultView, layout: initialLayout };
    }
  });
  const update = (patch: Partial<ViewSettings>) =>
    setView((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify(next));
      } catch {
        /* storage may be unavailable; the choice just will not be remembered */
      }
      return next;
    });
  return [view, update];
}

function Manager({ status, snapshot, refreshStatus }: PageContext) {
  const [page, setPage] = useState<'bookmarks' | 'settings'>(
    location.hash === '#settings' ? 'settings' : 'bookmarks',
  );
  const [chosen, setSelection] = useState<Selection>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ bookmark?: Bookmark } | undefined>();
  const searchRef = useRef<HTMLInputElement>(null);
  const [localView, updateLocalView] = useLocalView(status.settings.defaultLayout);

  // A folder that was deleted or merged away elsewhere must not stay selected.
  const selection =
    chosen.kind === 'folder' && !snapshot.folders.some((f) => f.id === chosen.id)
      ? everything
      : chosen;
  const folder =
    selection.kind === 'folder' ? snapshot.folders.find((f) => f.id === selection.id) : undefined;
  const view = folder ? folder.view : localView;
  const updateView = (patch: Partial<ViewSettings>) =>
    folder
      ? void send('updateFolder', { id: folder.id, patch: { view: { ...folder.view, ...patch } } })
      : updateLocalView(patch);

  const searching = query.trim() !== '';
  const list = useMemo(
    () => bookmarksFor(snapshot, selection, view, query),
    [snapshot, selection, view, query],
  );
  const tree = useMemo(() => buildTree(snapshot.folders, snapshot.bookmarks), [snapshot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const inTrash = selection.kind === 'trash' && !searching;
  const title = searching
    ? 'Search results'
    : {
        all: 'All bookmarks',
        unsorted: 'Unsorted',
        favorites: 'Favorites',
        trash: 'Trash',
        search: 'Search results',
        folder: folder?.name ?? '',
        tag: selection.kind === 'tag' ? `Tag: ${selection.tag}` : '',
      }[selection.kind];

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const ids = [...picked];
  const afterBulk = () => setPicked(new Set());

  function open(next: Selection) {
    setSelection(next);
    setQuery('');
    setPicked(new Set()); // picks only make sense for the list on screen
    setPage('bookmarks');
  }

  const save = status.saveState;

  return (
    <div className="mgr">
      <header className="topbar">
        <div className="brand">
          <span className="logo">
            <I n="bookmark" />
          </span>
          <span>BookPass</span>
        </div>
        <div className="search">
          <I n="magnifying-glass" />
          <input
            ref={searchRef}
            className="input"
            placeholder="Search bookmarks   ( / )"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(new Set());
              setPage('bookmarks');
            }}
            aria-label="Search"
          />
        </div>
        <span className="grow" />
        <span className={`save-state ${save === 'error' ? 'error' : ''}`} title={status.saveError}>
          {save === 'saved' && (
            <>
              <I n="circle-check" /> Saved
            </>
          )}
          {(save === 'dirty' || save === 'saving') && (
            <>
              <I n="spinner" spin /> Saving…
            </>
          )}
          {save === 'error' && (
            <>
              <I n="triangle-exclamation" /> Not saved
              <button
                className="btn small"
                onClick={() => void send('saveNow', undefined).then(refreshStatus)}
              >
                Retry
              </button>
            </>
          )}
        </span>
        <button className="btn primary" onClick={() => setDialog({})}>
          <I n="plus" /> Add bookmark
        </button>
        <button
          className={`btn ghost square ${page === 'settings' ? 'active' : ''}`}
          onClick={() => setPage(page === 'settings' ? 'bookmarks' : 'settings')}
          title="Settings"
          aria-label="Settings"
        >
          <I n="gear" />
        </button>
        <button
          className="btn ghost square"
          onClick={() => void send('lock', undefined)}
          title="Lock"
          aria-label="Lock"
        >
          <I n="lock" />
        </button>
      </header>

      <Sidebar
        snapshot={snapshot}
        selection={page === 'bookmarks' ? selection : { kind: 'search' }}
        onSelect={open}
      />

      <main className="main">
        {page === 'settings' ? (
          <SettingsPanel status={status} onChanged={refreshStatus} />
        ) : (
          <>
            <div className="content-head">
              {folder && <I n="folder" />}
              <h1>{title}</h1>
              <span className="muted">{list.length}</span>
              <div className="view-controls">
                {inTrash && snapshot.trash.length > 0 && (
                  <button
                    className="btn danger small"
                    onClick={() =>
                      confirm('Delete everything in the trash for good?') &&
                      void send('emptyTrash', undefined)
                    }
                  >
                    Empty trash
                  </button>
                )}
                {folder && (
                  <button
                    className={`btn small ${view.subfolders ? 'active' : ''}`}
                    onClick={() => updateView({ subfolders: !view.subfolders })}
                    title="Also show bookmarks from subfolders"
                  >
                    <I n="folder-open" /> Subfolders
                  </button>
                )}
                <select
                  className="select"
                  value={view.sort}
                  onChange={(e) => updateView({ sort: e.target.value as SortKey })}
                  aria-label="Sort by"
                >
                  {sorts.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn square"
                  onClick={() => updateView({ sortDir: view.sortDir === 'asc' ? 'desc' : 'asc' })}
                  title={view.sortDir === 'asc' ? 'Ascending' : 'Descending'}
                  aria-label="Reverse sort order"
                >
                  <I n={view.sortDir === 'asc' ? 'arrow-up-wide-short' : 'arrow-down-short-wide'} />
                </button>
                <div className="segmented" role="group" aria-label="Layout">
                  {layouts.map((l) => (
                    <button
                      key={l.value}
                      className={`btn ${view.layout === l.value ? 'active' : ''}`}
                      onClick={() => updateView({ layout: l.value })}
                      title={l.label}
                      aria-label={l.label}
                      aria-pressed={view.layout === l.value}
                    >
                      <I n={l.icon} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {picked.size > 0 && (
              <div className="bulkbar">
                <strong>{picked.size} selected</strong>
                <span className="grow" />
                {inTrash ? (
                  <>
                    <button
                      className="btn"
                      onClick={() => void send('restoreBookmarks', { ids }).then(afterBulk)}
                    >
                      <I n="rotate-left" /> Restore
                    </button>
                    <button
                      className="btn"
                      onClick={() => void send('deleteForever', { ids }).then(afterBulk)}
                    >
                      <I n="trash" /> Delete forever
                    </button>
                  </>
                ) : (
                  <>
                    <FolderSelect
                      tree={tree}
                      value={null}
                      topLabel="Move to…"
                      onChange={(id) =>
                        void send('moveBookmarks', { ids, folderId: id }).then(afterBulk)
                      }
                    />
                    <button
                      className="btn"
                      onClick={() => void send('trashBookmarks', { ids }).then(afterBulk)}
                    >
                      <I n="trash" /> Trash
                    </button>
                  </>
                )}
                <button className="btn" onClick={afterBulk}>
                  Clear
                </button>
              </div>
            )}

            {list.length === 0 ? (
              <EmptyState searching={searching} selection={selection} onAdd={() => setDialog({})} />
            ) : (
              <BookmarkList
                bookmarks={list}
                view={view}
                selected={picked}
                inTrash={inTrash}
                onToggle={toggle}
                onEdit={(bookmark) => setDialog({ bookmark })}
                onTag={(tag) => open({ kind: 'tag', tag })}
              />
            )}
          </>
        )}
      </main>

      {dialog && (
        <BookmarkDialog
          snapshot={snapshot}
          bookmark={dialog.bookmark}
          folderId={selection.kind === 'folder' ? selection.id : null}
          onClose={() => setDialog(undefined)}
        />
      )}
    </div>
  );
}

function EmptyState({
  searching,
  selection,
  onAdd,
}: {
  searching: boolean;
  selection: Selection;
  onAdd: () => void;
}) {
  if (searching) {
    return (
      <div className="empty">
        <I n="magnifying-glass" />
        <strong>Nothing matches your search</strong>
        <span>Try fewer words, or use #tag and domain:example.com.</span>
      </div>
    );
  }
  if (selection.kind === 'trash') {
    return (
      <div className="empty">
        <I n="trash" />
        <strong>The trash is empty</strong>
      </div>
    );
  }
  return (
    <div className="empty">
      <I n="bookmark" />
      <strong>No bookmarks here yet</strong>
      <span>
        Save the page you are on from the BookPass button in the toolbar, or add an address by hand.
      </span>
      <button className="btn primary" onClick={onAdd}>
        <I n="plus" /> Add bookmark
      </button>
    </div>
  );
}

export function ManagerApp() {
  return <Shell>{(context) => <Manager {...context} />}</Shell>;
}
