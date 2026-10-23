import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import type { BookmarkType } from '../bookmark-model';
import { buildTree, domainOf, normalizeUrl } from '../browse';
import { inspectTab, isSavable, shrinkCover, type PageInfo } from '../capture';
import { stopCoversVaultBytes } from '../constants';
import type { ParsedImport } from '../formats';
import type { CaptureData } from '../messages';
import { send } from './api';
import { I } from './Icon';
import { errorText, FolderSelect, TagInput } from './parts';
import { Shell, type PageContext } from './Shell';

const LAST_FOLDER = 'bookpass.lastFolder';

function rememberedFolder(): string | null {
  try {
    return localStorage.getItem(LAST_FOLDER) || null;
  } catch {
    return null;
  }
}

function Popup({ status, snapshot }: PageContext) {
  const [page, setPage] = useState<PageInfo>();
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState<string | null>(rememberedFolder);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [keepCover, setKeepCover] = useState(true);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [busy, setBusy] = useState(false);

  const tree = useMemo(() => buildTree(snapshot.folders, snapshot.bookmarks), [snapshot]);
  const allTags = useMemo(
    () => [...new Set(snapshot.bookmarks.flatMap((b) => b.tags))].sort(),
    [snapshot],
  );

  // Past a certain size the vault stops taking new cover pictures.
  const wantCovers = status.settings.captureCovers && status.vaultBytes < stopCoversVaultBytes;

  // Look at the page the popup was opened on.
  useEffect(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) return setError('There is no page to save.');
      const info = await inspectTab(tab, wantCovers);
      setPage(info);
      setTitle(info.title);
    })().catch((e) => setError(errorText(e)));
  }, [wantCovers]);

  const existing =
    page && snapshot.bookmarks.find((b) => normalizeUrl(b.url) === normalizeUrl(page.url));
  // Start from what is already saved for this page, once.
  const [seededFrom, setSeededFrom] = useState<string>();
  if (existing && seededFrom !== existing.id) {
    setSeededFrom(existing.id);
    setTitle(existing.title);
    setFolder(existing.folderId);
    setTags(existing.tags);
    setNote(existing.note);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!page) return;
    setBusy(true);
    try {
      const capture: CaptureData = {};
      // An existing cover is kept: saving again should not replace it with a screenshot of whatever is on screen now.
      if (keepCover && page.cover && !existing?.hasCover)
        capture.cover = await shrinkCover(page.cover, status.settings.coverWidth);
      if (page.favicon) {
        capture.favicon = {
          site: new URL(page.url).origin,
          png: page.favicon.replace(/^data:image\/png;base64,/, ''),
        };
      }
      const input = {
        folderId: folder,
        title: title.trim() || page.url,
        url: page.url,
        note,
        excerpt: page.description,
        type: page.type as BookmarkType,
        tags,
      };
      if (existing)
        await send('updateBookmark', {
          id: existing.id,
          patch: { ...input, excerpt: undefined },
          capture,
        });
      else await send('addBookmark', { input, capture });
      try {
        if (folder) localStorage.setItem(LAST_FOLDER, folder);
        else localStorage.removeItem(LAST_FOLDER);
      } catch {
        /* the folder just will not be remembered */
      }
      setDone(existing ? 'Bookmark updated' : 'Bookmark saved');
      setTimeout(() => window.close(), 900);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const openManager = (hash = '') => {
    void browser.tabs.create({ url: browser.runtime.getURL('/manager.html') + hash });
    window.close();
  };

  const savable = page ? isSavable(page.url) : true;
  const coverPreview = keepCover ? page?.cover : undefined;

  return (
    <>
      <div className="popup-head">
        <h1 className="brand">
          <span className="logo">
            <I n="bookmark" />
          </span>
          BookPass
        </h1>
        <button
          className="btn ghost square"
          title="Open manager"
          aria-label="Open manager"
          onClick={() => openManager()}
        >
          <I n="arrow-up-right-from-square" />
        </button>
        <button
          className="btn ghost square"
          title="Settings"
          aria-label="Settings"
          onClick={() => openManager('#settings')}
        >
          <I n="gear" />
        </button>
        <button
          className="btn ghost square"
          title="Lock"
          aria-label="Lock"
          onClick={() => void send('lock', undefined)}
        >
          <I n="lock" />
        </button>
      </div>

      {done ? (
        <div className="popup-body">
          <div className="empty" style={{ padding: '30px 10px' }}>
            <I n="circle-check" />
            <strong>{done}</strong>
          </div>
        </div>
      ) : !page ? (
        <div className="popup-body">
          {error ? (
            <div className="callout error">{error}</div>
          ) : (
            <span className="muted">
              <I n="spinner" spin /> Reading the page…
            </span>
          )}
        </div>
      ) : !savable ? (
        <div className="popup-body stack">
          <div className="callout warn">
            <I n="triangle-exclamation" />
            <span>BookPass can only save web pages (addresses starting with http or https).</span>
          </div>
          <button className="btn" onClick={() => openManager()}>
            Open manager
          </button>
        </div>
      ) : (
        <form onSubmit={save}>
          <div className="popup-body stack">
            {existing && (
              <div className="callout">
                <I n="circle-check" />
                <span>You saved this page before. Saving again updates that bookmark.</span>
              </div>
            )}
            <div className="popup-preview">
              <div
                className="popup-cover"
                style={coverPreview ? { backgroundImage: `url(${coverPreview})` } : undefined}
              >
                {!coverPreview && (page.cover ? <span>No cover</span> : <I n="image" />)}
              </div>
              <div className="grow stack" style={{ gap: 6 }}>
                <label className="field">
                  <span>Title</span>
                  <input
                    className="input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    autoFocus
                  />
                </label>
                <span
                  className="hint"
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={page.url}
                >
                  {domainOf(page.url)}
                </span>
              </div>
            </div>
            {page.cover && !existing?.hasCover && (
              <label className="row hint">
                <input
                  type="checkbox"
                  checked={keepCover}
                  onChange={(e) => setKeepCover(e.target.checked)}
                />
                <span>Save this cover picture</span>
              </label>
            )}
            <label className="field">
              <span>Folder</span>
              <FolderSelect tree={tree} value={folder} onChange={setFolder} />
            </label>
            <div className="field">
              <span>Tags</span>
              <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
            </div>
            <label className="field">
              <span>Note</span>
              <textarea
                className="textarea"
                style={{ minHeight: 52 }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {error && <div className="callout error">{error}</div>}
          </div>
          <SaveTabs folder={folder} onDone={setDone} onError={setError} />
          <div className="popup-foot">
            <button className="btn primary" disabled={busy}>
              {busy ? <I n="spinner" spin /> : <I n="bookmark" />}{' '}
              {existing ? 'Update bookmark' : 'Save bookmark'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

export function PopupApp() {
  return (
    <div className="popup">
      <Shell>{(context) => <Popup {...context} />}</Shell>
    </div>
  );
}

/**
 * Saves the tabs of this window, or just the ones you selected, into a new folder. Reading the title and address of
 * tabs other than the one you are on needs the `tabs` permission, which is asked for the first time you use this.
 */
function SaveTabs({
  folder,
  onDone,
  onError,
}: {
  folder: string | null;
  onDone: (text: string) => void;
  onError: (text: string) => void;
}) {
  async function save(selectedOnly: boolean) {
    try {
      if (!(await browser.permissions.request({ permissions: ['tabs'] }))) {
        return onError('Saving several tabs needs permission to read their titles and addresses.');
      }
      const tabs = await browser.tabs.query(
        selectedOnly ? { currentWindow: true, highlighted: true } : { currentWindow: true },
      );
      const parsed: ParsedImport = {
        bookmarks: tabs
          .filter((t) => isSavable(t.url))
          .map((t) => ({
            folderPath: [],
            title: t.title || t.url!,
            url: t.url!,
            note: '',
            excerpt: '',
            tags: [],
            favorite: false,
          })),
        emptyFolders: [],
      };
      if (parsed.bookmarks.length === 0)
        return onError('None of those tabs are web pages BookPass can save.');
      const result = await send('importBookmarks', {
        parsed,
        parentId: folder,
        wrapper: `Tabs ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        skipDuplicates: false,
      });
      onDone(`Saved ${result.added} tab${result.added === 1 ? '' : 's'}`);
      setTimeout(() => window.close(), 1200);
    } catch (e) {
      onError(errorText(e));
    }
  }

  return (
    <details className="history" style={{ padding: '0 12px 10px' }}>
      <summary>Save several tabs…</summary>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn small" onClick={() => void save(false)}>
          All tabs in this window
        </button>
        <button type="button" className="btn small" onClick={() => void save(true)}>
          Selected tabs
        </button>
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>
        They go into a new folder. Hold Ctrl or Shift and click tabs to select several.
      </p>
    </details>
  );
}
