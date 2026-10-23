import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultView, type Bookmark, type SortKey, type ViewSettings } from '../bookmark-model';
import { bookmarksFor, buildTree, reorder, type Selection } from '../browse';
import type { Layout } from '../settings';
import { send } from './api';
import { Banners } from './Banners';
import { BookmarkList } from './BookmarkList';
import { BookmarkDialog } from './Dialogs';
import { I } from './Icon';
import { useIconsFor } from './icon-library';
import { DuplicatesDialog, ExportDialog, ImportDialog } from './ImportExport';
import { FolderSelect, errorText } from './parts';
import { SettingsPanel } from './SettingsPanel';
import { Shell, type PageContext } from './Shell';
import { Sidebar } from './Sidebar';
import { TagDialog } from './TagDialog';

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
  { value: 'manual', label: 'Manual (drag to reorder)' },
];

const VIEW_KEY = 'bookpass.view';
const everything: Selection = { kind: 'all' };
/** How often an open manager looks for changes made to the vault file elsewhere. */
const CHECK_EVERY_MS = 30_000;

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

/** A bookmark handed over by the right click menu while the vault was locked. */
function takeSavedLink(): { url: string; title: string } | undefined {
  const match = /^#save=(.+)$/.exec(location.hash);
  if (!match) return undefined;
  history.replaceState(null, '', location.pathname);
  try {
    return JSON.parse(decodeURIComponent(match[1]!)) as { url: string; title: string };
  } catch {
    return undefined;
  }
}

type Tool = 'import' | 'export' | 'duplicates' | 'tags';

function Manager({ status, snapshot, refreshStatus }: PageContext) {
  const [page, setPage] = useState<'bookmarks' | 'settings'>(
    location.hash === '#settings' ? 'settings' : 'bookmarks',
  );
  const [chosen, setSelection] = useState<Selection>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<
    { bookmark?: Bookmark; initial?: { url: string; title: string } } | undefined
  >(() => {
    const saved = takeSavedLink();
    return saved ? { initial: saved } : undefined;
  });
  const [tool, setTool] = useState<Tool>();
  const [bulkTag, setBulkTag] = useState('');
  const [error, setError] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const [localView, updateLocalView] = useLocalView(status.settings.defaultLayout);
  useIconsFor(snapshot.folders.map((f) => f.icon));

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
      ? void send('updateFolder', {
          id: folder.id,
          patch: { view: { ...folder.view, ...patch } },
        })
      : updateLocalView(patch);

  const searching = query.trim() !== '';
  const list = useMemo(
    () => bookmarksFor(snapshot, selection, view, query),
    [snapshot, selection, view, query],
  );
  const tree = useMemo(() => buildTree(snapshot.folders, snapshot.bookmarks), [snapshot]);

  // Changes made to the vault file by another computer, a sync tool or KeePassXC.
  useEffect(() => {
    const check = () => void send('checkFile', undefined).catch(() => {});
    check();
    const timer = setInterval(
      () => document.visibilityState === 'visible' && check(),
      CHECK_EVERY_MS,
    );
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      removeEventListener('focus', check);
    };
  }, []);

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
  const attempt = (job: Promise<unknown>) => job.then(afterBulk, (e) => setError(errorText(e)));

  function open(next: Selection) {
    setSelection(next);
    setQuery('');
    setPicked(new Set()); // picks only make sense for the list on screen
    setPage('bookmarks');
  }

  const save = status.saveState;
  const manual = view.sort === 'manual' && !searching && selection.kind !== 'trash';

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
        <span
          className={`save-state ${save === 'error' ? 'error' : ''}`}
          title={status.saveError}
          role="status"
        >
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
        <details className="menu">
          <summary className="btn ghost square" title="Tools" aria-label="Tools">
            <I n="ellipsis" />
          </summary>
          <div className="menu-list">
            {(
              [
                ['import', 'Import bookmarks…'],
                ['export', 'Export bookmarks…'],
                ['duplicates', 'Find duplicates…'],
                ['tags', 'Manage tags…'],
              ] as [Tool, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={(e) => {
                  setTool(value);
                  e.currentTarget.closest('details')?.removeAttribute('open');
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </details>
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
        <Banners status={status} />
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
                <details className="menu">
                  <summary className="btn square" title="What to show" aria-label="What to show">
                    <I n="sliders" />
                  </summary>
                  <div className="menu-list">
                    {(
                      [
                        ['showCover', 'Cover pictures'],
                        ['showNote', 'Notes'],
                        ['showTags', 'Tags'],
                      ] as ['showCover' | 'showNote' | 'showTags', string][]
                    ).map(([key, label]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={view[key]}
                          onChange={(e) => updateView({ [key]: e.target.checked })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            </div>

            {error && (
              <div className="callout error" role="alert" style={{ marginBottom: 12 }}>
                {error}
              </div>
            )}

            {picked.size > 0 && (
              <div className="bulkbar">
                <strong>{picked.size} selected</strong>
                <span className="grow" />
                {inTrash ? (
                  <>
                    <button
                      className="btn"
                      onClick={() => void attempt(send('restoreBookmarks', { ids }))}
                    >
                      <I n="rotate-left" /> Restore
                    </button>
                    <button
                      className="btn"
                      onClick={() => void attempt(send('deleteForever', { ids }))}
                    >
                      <I n="trash" /> Delete forever
                    </button>
                  </>
                ) : (
                  <>
                    <form
                      className="row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const tags = bulkTag
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean);
                        if (tags.length)
                          void attempt(send('addTags', { ids, tags })).then(() => setBulkTag(''));
                      }}
                    >
                      <input
                        className="input"
                        style={{ width: 150, padding: '5px 8px' }}
                        placeholder="Add a tag"
                        value={bulkTag}
                        onChange={(e) => setBulkTag(e.target.value)}
                        aria-label="Tag to add to the selection"
                      />
                      <button className="btn">
                        <I n="tag" /> Tag
                      </button>
                    </form>
                    <FolderSelect
                      tree={tree}
                      value={null}
                      topLabel="Move to…"
                      onChange={(id) => void attempt(send('moveBookmarks', { ids, folderId: id }))}
                    />
                    <button
                      className="btn"
                      onClick={() => void attempt(send('trashBookmarks', { ids }))}
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
                onReorder={
                  manual
                    ? (dragged, target, before) => {
                        const orders = reorder(list, dragged, target, before, view.sortDir);
                        if (orders.length)
                          void send('setOrder', { orders }).catch((e) => setError(errorText(e)));
                      }
                    : undefined
                }
              />
            )}
          </>
        )}
      </main>

      {dialog && (
        <BookmarkDialog
          snapshot={snapshot}
          bookmark={dialog.bookmark}
          initial={dialog.initial}
          folderId={selection.kind === 'folder' ? selection.id : null}
          onClose={() => setDialog(undefined)}
        />
      )}
      {tool === 'import' && <ImportDialog snapshot={snapshot} onClose={() => setTool(undefined)} />}
      {tool === 'export' && <ExportDialog snapshot={snapshot} onClose={() => setTool(undefined)} />}
      {tool === 'duplicates' && (
        <DuplicatesDialog snapshot={snapshot} onClose={() => setTool(undefined)} />
      )}
      {tool === 'tags' && <TagDialog snapshot={snapshot} onClose={() => setTool(undefined)} />}
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
        <span>
          Try fewer words, or use #tag, domain:example.com, is:fav, type:video or has:note.
        </span>
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
        Save the page you are on from the BookPass button in the toolbar, import your bookmarks from
        the menu, or add an address by hand.
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
