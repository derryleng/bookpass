import { useEffect, useMemo, useState, type FormEvent } from "react";
import { browser } from "wxt/browser";
import type { BookmarkType } from "../bookmark-model";
import { buildTree, domainOf, normalizeUrl } from "../browse";
import { inspectTab, isSavable, type PageInfo } from "../capture";
import { shrinkCover } from "../images";
import { stopCoversVaultBytes } from "../constants";
import type { ParsedImport } from "../formats";
import type { CaptureData } from "../messages";
import { send } from "./api";
import { I } from "./Icon";
import { errorText, FolderSelect, Logo, TagInput } from "./parts";
import { Shell, type PageContext } from "./Shell";
import { btn, callout, field, hint, input, summaryLabel } from "./cls";

const LAST_FOLDER = "bookpass.lastFolder";

function rememberedFolder(): string | null {
  try {
    return localStorage.getItem(LAST_FOLDER) || null;
  } catch {
    return null;
  }
}

function Popup({ status, snapshot }: PageContext) {
  const [page, setPage] = useState<PageInfo>();
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState<string | null>(rememberedFolder);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [keepCover, setKeepCover] = useState(true);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [busy, setBusy] = useState(false);

  const tree = useMemo(
    () => buildTree(snapshot.folders, snapshot.bookmarks),
    [snapshot],
  );
  const allTags = useMemo(
    () => [...new Set(snapshot.bookmarks.flatMap((b) => b.tags))].sort(),
    [snapshot],
  );

  // Past a certain size the vault stops taking new cover pictures.
  const wantCovers =
    status.settings.captureCovers && status.vaultBytes < stopCoversVaultBytes;
  const otherServers = status.settings.coversFromOtherServers;

  // Look at the page the popup was opened on.
  useEffect(() => {
    void (async () => {
      // The end to end build can name the tab to save, since its popup is opened in a tab of its own.
      const named = __E2E__
        ? new URLSearchParams(location.search).get("tab")
        : null;
      const tab = named
        ? await browser.tabs.get(Number(named))
        : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
      if (!tab) return setError("There is no page to save.");
      const info = await inspectTab(tab, wantCovers, otherServers);
      setPage(info);
      setTitle(info.title);
    })().catch((e) => setError(errorText(e)));
  }, [wantCovers, otherServers]);

  const existing =
    page &&
    snapshot.bookmarks.find(
      (b) => normalizeUrl(b.url) === normalizeUrl(page.url),
    );
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
        capture.cover = await shrinkCover(
          page.cover,
          status.settings.coverWidth,
        );
      if (page.favicon) {
        capture.favicon = {
          site: new URL(page.url).origin,
          png: page.favicon.replace(/^data:image\/png;base64,/, ""),
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
        await send("updateBookmark", {
          id: existing.id,
          patch: { ...input, excerpt: undefined },
          capture,
        });
      else await send("addBookmark", { input, capture });
      try {
        if (folder) localStorage.setItem(LAST_FOLDER, folder);
        else localStorage.removeItem(LAST_FOLDER);
      } catch {
        /* the folder just will not be remembered */
      }
      setDone(existing ? "Bookmark updated" : "Bookmark saved");
      setTimeout(() => window.close(), 900);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const openManager = (hash = "") => {
    void browser.tabs.create({
      url: browser.runtime.getURL("/manager.html") + hash,
    });
    window.close();
  };

  const savable = page ? isSavable(page.url) : true;
  const coverPreview = keepCover ? page?.cover : undefined;

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2.5">
        <h1 className="flex flex-1 items-center gap-2 text-[15px] font-bold">
          <Logo className="size-6.5 rounded-lg text-xs" />
          BookPass
        </h1>
        <button
          className={btn("ghost square")}
          title="Open manager"
          aria-label="Open manager"
          onClick={() => openManager()}
        >
          <I n="arrow-up-right-from-square" />
        </button>
        <button
          className={btn("ghost square")}
          title="Settings"
          aria-label="Settings"
          onClick={() => openManager("#settings")}
        >
          <I n="gear" />
        </button>
        <button
          className={btn("ghost square")}
          title="Lock"
          aria-label="Lock"
          onClick={() => void send("lock", undefined)}
        >
          <I n="lock" />
        </button>
      </div>

      {done ? (
        <div className="p-3">
          <div className="grid place-items-center gap-2 px-2.5 py-7.5 text-center text-muted [&>svg]:text-4xl [&>svg]:opacity-55">
            <I n="circle-check" />
            <strong>{done}</strong>
          </div>
        </div>
      ) : !page ? (
        <div className="p-3">
          {error ? (
            <div className={callout("error")}>{error}</div>
          ) : (
            <span className="text-muted">
              <I n="spinner" spin /> Reading the page…
            </span>
          )}
        </div>
      ) : !savable ? (
        <div className="flex flex-col gap-3 p-3">
          <div className={callout("warn")}>
            <I n="triangle-exclamation" />
            <span>Only http and https pages can be saved.</span>
          </div>
          <button className={btn()} onClick={() => openManager()}>
            Open manager
          </button>
        </div>
      ) : (
        <form onSubmit={save}>
          <div className="flex flex-col gap-3 p-3">
            {existing && (
              <div className={callout()}>
                <I n="circle-check" />
                <span>Already saved. Saving updates the bookmark.</span>
              </div>
            )}
            <div className="flex items-stretch gap-3">
              <div
                className="grid min-h-18.5 w-29.5 flex-none place-items-center rounded-lg bg-raised bg-cover bg-center bg-no-repeat text-center text-xs text-muted"
                style={
                  coverPreview
                    ? { backgroundImage: `url(${coverPreview})` }
                    : undefined
                }
              >
                {!coverPreview &&
                  (page.cover ? <span>No cover</span> : <I n="image" />)}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <label className={field}>
                  <span>Title</span>
                  <input
                    className={input}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    autoFocus
                  />
                </label>
                <span
                  className={`flex items-center gap-2 ${hint}`}
                  title={page.url}
                >
                  {page.favicon ? (
                    <img
                      className="size-5 shrink-0 rounded-[5px] object-contain"
                      src={page.favicon}
                      alt="Site icon"
                    />
                  ) : (
                    <span
                      className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-raised text-[11px] font-bold text-muted uppercase"
                      title="No site icon could be read"
                    >
                      {(domainOf(page.url) || "?").charAt(0)}
                    </span>
                  )}
                  <span className="truncate">{domainOf(page.url)}</span>
                </span>
              </div>
            </div>
            {page.cover && !existing?.hasCover && (
              <label className={`flex items-center gap-2 ${hint}`}>
                <input
                  type="checkbox"
                  checked={keepCover}
                  onChange={(e) => setKeepCover(e.target.checked)}
                />
                <span>Save this cover picture</span>
              </label>
            )}
            <label className={field}>
              <span>Folder</span>
              <FolderSelect tree={tree} value={folder} onChange={setFolder} />
            </label>
            <div className={field}>
              <span>Tags</span>
              <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
            </div>
            <label className={field}>
              <span>Note</span>
              <textarea
                className={`${input} min-h-13 resize-y`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {error && <div className={callout("error")}>{error}</div>}
          </div>
          <SaveTabs folder={folder} onDone={setDone} onError={setError} />
          <div className="flex gap-2 px-3 pb-3">
            <button className={`${btn("primary")} flex-1`} disabled={busy}>
              {busy ? <I n="spinner" spin /> : <I n="bookmark" />}{" "}
              {existing ? "Update bookmark" : "Save bookmark"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

export function PopupApp() {
  return (
    <div className="min-h-50 w-95 bg-canvas">
      <Shell popup>{(context) => <Popup {...context} />}</Shell>
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
      if (!(await browser.permissions.request({ permissions: ["tabs"] }))) {
        return onError("Saving several tabs needs the tabs permission.");
      }
      const tabs = await browser.tabs.query(
        selectedOnly
          ? { currentWindow: true, highlighted: true }
          : { currentWindow: true },
      );
      const parsed: ParsedImport = {
        bookmarks: tabs
          .filter((t) => isSavable(t.url))
          .map((t) => ({
            folderPath: [],
            title: t.title || t.url!,
            url: t.url!,
            note: "",
            excerpt: "",
            tags: [],
            favorite: false,
          })),
        emptyFolders: [],
      };
      if (parsed.bookmarks.length === 0)
        return onError("None of those tabs can be saved.");
      const result = await send("importBookmarks", {
        parsed,
        parentId: folder,
        wrapper: `Tabs ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        skipDuplicates: false,
      });
      onDone(`Saved ${result.added} tab${result.added === 1 ? "" : "s"}`);
      setTimeout(() => window.close(), 1200);
    } catch (e) {
      onError(errorText(e));
    }
  }

  return (
    <details className="px-3 pb-2.5">
      <summary className={summaryLabel}>Save several tabs…</summary>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className={btn("small")}
          onClick={() => void save(false)}
        >
          All tabs in this window
        </button>
        <button
          type="button"
          className={btn("small")}
          onClick={() => void save(true)}
        >
          Selected tabs
        </button>
      </div>
      <p className={`${hint} mt-1.5`}>
        Saved to a new folder. Ctrl or Shift click to select tabs.
      </p>
    </details>
  );
}
