import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultView,
  type Bookmark,
  type ViewSettings,
} from "../bookmark-model";
import {
  bookmarksFor,
  buildTree,
  groupBookmarks,
  reorder,
  type Selection,
} from "../browse";
import type { Layout } from "../settings";
import { send } from "./api";
import { Banners } from "./Banners";
import { BookmarkList } from "./BookmarkList";
import { BookmarkDialog } from "./Dialogs";
import {
  btn,
  callout,
  inputSearch,
  inputSmall,
  menu,
  menuItem,
  menuList,
  menuTrigger,
  segment,
  segmented,
} from "./cls";
import { I, Icon } from "./Icon";
import { useIconsFor } from "./icon-library";
import { DuplicatesDialog, ExportDialog, ImportDialog } from "./ImportExport";
import { FetchMissingDialog } from "./FetchMissing";
import { FolderSelect, Logo, SelectAll, errorText } from "./parts";
import { SettingsPanel } from "./SettingsPanel";
import { Shell, type PageContext } from "./Shell";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { ViewMenu, viewSummary } from "./ViewMenu";
import { TagDialog } from "./TagDialog";

const layouts: { value: Layout; icon: string; label: string }[] = [
  { value: "list", icon: "list", label: "List" },
  { value: "grid", icon: "table-cells-large", label: "Grid" },
  { value: "headlines", icon: "bars", label: "Headlines" },
  { value: "masonry", icon: "border-all", label: "Masonry" },
];

const VIEW_KEY = "bookpass.view";
const everything: Selection = { kind: "all" };
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
        ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}"),
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
  history.replaceState(null, "", location.pathname);
  try {
    return JSON.parse(decodeURIComponent(match[1]!)) as {
      url: string;
      title: string;
    };
  } catch {
    return undefined;
  }
}

type Tool = "import" | "export" | "duplicates" | "tags";

function Manager({ status, snapshot, refreshStatus }: PageContext) {
  const [page, setPage] = useState<"bookmarks" | "settings">(
    location.hash === "#settings" ? "settings" : "bookmarks",
  );
  const [chosen, setSelection] = useState<Selection>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<
    | { bookmark?: Bookmark; initial?: { url: string; title: string } }
    | undefined
  >(() => {
    const saved = takeSavedLink();
    return saved ? { initial: saved } : undefined;
  });
  const [tool, setTool] = useState<Tool>();
  const [fetching, setFetching] = useState<{
    scope: string;
    bookmarks: Bookmark[];
  }>();
  const [bulkTag, setBulkTag] = useState("");
  const [error, setError] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const [localView, updateLocalView] = useLocalView(
    status.settings.defaultLayout,
  );
  useIconsFor(snapshot.folders.map((f) => f.icon));

  // A folder that was deleted or merged away elsewhere must not stay selected.
  const selection =
    chosen.kind === "folder" &&
    !snapshot.folders.some((f) => f.id === chosen.id)
      ? everything
      : chosen;
  const folder =
    selection.kind === "folder"
      ? snapshot.folders.find((f) => f.id === selection.id)
      : undefined;
  const view = folder ? folder.view : localView;
  const updateView = (patch: Partial<ViewSettings>) =>
    folder
      ? void send("updateFolder", {
          id: folder.id,
          patch: { view: { ...folder.view, ...patch } },
        })
      : updateLocalView(patch);

  const searching = query.trim() !== "";
  const list = useMemo(
    () => bookmarksFor(snapshot, selection, view, query),
    [snapshot, selection, view, query],
  );
  const tree = useMemo(
    () => buildTree(snapshot.folders, snapshot.bookmarks),
    [snapshot],
  );

  // Changes made to the vault file by another computer, a sync tool or KeePassXC.
  useEffect(() => {
    const check = () => void send("checkFile", undefined).catch(() => {});
    check();
    const timer = setInterval(
      () => document.visibilityState === "visible" && check(),
      CHECK_EVERY_MS,
    );
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      removeEventListener("focus", check);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const inTrash = selection.kind === "trash" && !searching;
  // Sections by subfolder need a folder with its subfolders on, and the trash has no folders to follow.
  const group =
    inTrash || (view.group === "folder" && folder && !view.subfolders)
      ? "none"
      : view.group;
  const groups = useMemo(
    () => groupBookmarks(list, group, snapshot, selection),
    [list, group, snapshot, selection],
  );
  const headIcon = folder ? (
    <Icon name={folder.icon} />
  ) : (
    <I
      n={
        {
          all: "layer-group",
          unsorted: "inbox",
          favorites: "star",
          trash: "trash",
          search: "magnifying-glass",
          folder: "folder",
          tag: "tag",
        }[searching ? "search" : selection.kind]
      }
    />
  );
  const title = searching
    ? "Search results"
    : {
        all: "All bookmarks",
        unsorted: "Unsorted",
        favorites: "Favorites",
        trash: "Trash",
        search: "Search results",
        folder: folder?.name ?? "",
        tag: selection.kind === "tag" ? `Tag: ${selection.tag}` : "",
      }[selection.kind];

  const pick = (pickIds: string[], on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      for (const id of pickIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const ids = [...picked];
  const afterBulk = () => setPicked(new Set());
  const attempt = (job: Promise<unknown>) =>
    job.then(afterBulk, (e) => setError(errorText(e)));

  function open(next: Selection) {
    setSelection(next);
    setQuery("");
    setPicked(new Set()); // picks only make sense for the list on screen
    setPage("bookmarks");
  }

  const save = status.saveState;
  const manual =
    view.sort === "manual" &&
    group === "none" &&
    !searching &&
    selection.kind !== "trash";

  return (
    <div className="grid h-full grid-cols-[270px_1fr] grid-rows-[56px_1fr] max-[800px]:grid-cols-1 max-[800px]:grid-rows-[56px_auto_1fr]">
      <header className="col-span-full flex items-center gap-3 border-b border-line bg-surface px-4">
        <div className="flex w-59.5 items-center gap-2.5 text-base font-bold max-[800px]:w-auto">
          <Logo className="size-7.5 rounded-[9px] text-sm" />
          <span className="max-[800px]:hidden">BookPass</span>
        </div>
        <div className="relative max-w-140 flex-1">
          <I
            n="magnifying-glass"
            className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
          />
          <input
            ref={searchRef}
            className={inputSearch}
            placeholder="Search bookmarks   ( / )"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(new Set());
              setPage("bookmarks");
            }}
            aria-label="Search"
          />
        </div>
        <span className="min-w-0 flex-1" />
        <span
          className={`inline-flex items-center gap-1.5 text-[13px] ${save === "error" ? "text-danger" : "text-muted"}`}
          title={status.saveError}
          role="status"
        >
          {save === "saved" && (
            <>
              <I n="circle-check" /> Saved
            </>
          )}
          {(save === "dirty" || save === "saving") && (
            <>
              <I n="spinner" spin /> Saving…
            </>
          )}
          {save === "error" && (
            <>
              <I n="triangle-exclamation" /> Not saved
              <button
                className={btn("small")}
                onClick={() =>
                  void send("saveNow", undefined).then(refreshStatus)
                }
              >
                Retry
              </button>
            </>
          )}
        </span>
        <button className={btn("primary")} onClick={() => setDialog({})}>
          <I n="plus" /> Add bookmark
        </button>
        <details className={menu}>
          <summary
            className={`${btn("ghost square")} ${menuTrigger}`}
            title="Tools"
            aria-label="Tools"
          >
            <I n="ellipsis" />
          </summary>
          <div className={menuList} role="menu">
            {(
              [
                ["import", "Import bookmarks…"],
                ["export", "Export bookmarks…"],
                ["duplicates", "Find duplicates…"],
                ["tags", "Manage tags…"],
              ] as [Tool, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                role="menuitem"
                className={menuItem}
                onClick={(e) => {
                  setTool(value);
                  e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                {label}
              </button>
            ))}
            <button
              role="menuitem"
              className={menuItem}
              onClick={(e) => {
                setFetching({
                  scope: "all your bookmarks",
                  bookmarks: snapshot.bookmarks,
                });
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              Fetch missing pictures…
            </button>
          </div>
        </details>
        <ThemeToggle
          mode={status.settings.theme}
          onChange={(theme) =>
            void send("setSettings", { theme }).then(refreshStatus)
          }
        />
        <button
          className={btn(
            page === "settings" ? "ghost square active" : "ghost square",
          )}
          onClick={() =>
            setPage(page === "settings" ? "bookmarks" : "settings")
          }
          title="Settings"
          aria-label="Settings"
        >
          <I n="gear" />
        </button>
        <button
          className={btn("ghost square")}
          onClick={() => void send("lock", undefined)}
          title="Lock"
          aria-label="Lock"
        >
          <I n="lock" />
        </button>
      </header>

      <Sidebar
        snapshot={snapshot}
        selection={page === "bookmarks" ? selection : { kind: "search" }}
        onSelect={open}
        onFetchPictures={(scope, bookmarks) =>
          setFetching({ scope, bookmarks })
        }
      />

      <main className="overflow-y-auto px-7 pt-5 pb-10 max-[800px]:p-4">
        <Banners status={status} />
        {page === "settings" ? (
          <SettingsPanel
            status={status}
            snapshot={snapshot}
            onChanged={refreshStatus}
          />
        ) : (
          <>
            <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
              <div className="flex min-w-0 items-center gap-3">
                {list.length > 0 && (
                  <SelectAll
                    ids={list.map((b) => b.id)}
                    picked={picked}
                    onPick={pick}
                    label={`Select all ${list.length} bookmarks here`}
                  >
                    <span
                      style={
                        folder?.color ? { color: folder.color } : undefined
                      }
                    >
                      {headIcon}
                    </span>
                  </SelectAll>
                )}
                <h1 className="text-[22px] leading-tight font-bold">{title}</h1>
                <span className="text-muted">{list.length}</span>
              </div>
              <span className="col-start-1 pl-9.5 text-xs text-muted">
                {viewSummary(view, !!folder)}
              </span>
              <div
                role="toolbar"
                aria-label="View"
                className="col-start-2 row-span-2 row-start-1 flex items-center gap-1.5 max-[900px]:col-span-full max-[900px]:col-start-1 max-[900px]:row-span-1 max-[900px]:row-start-3 max-[900px]:mt-2.5"
              >
                {inTrash && snapshot.trash.length > 0 && (
                  <button
                    className={btn("danger small")}
                    onClick={() =>
                      confirm("Delete everything in the trash for good?") &&
                      void send("emptyTrash", undefined)
                    }
                  >
                    Empty trash
                  </button>
                )}
                <ViewMenu
                  view={view}
                  inFolder={!!folder}
                  onChange={updateView}
                />
                <div
                  className={`${segmented} w-fit`}
                  role="group"
                  aria-label="Layout"
                >
                  {layouts.map((l) => (
                    <button
                      key={l.value}
                      className={segment(view.layout === l.value)}
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
            </header>

            {error && (
              <div className={`${callout("error")} mb-3`} role="alert">
                {error}
              </div>
            )}

            {picked.size > 0 && (
              <div
                role="toolbar"
                aria-label="Selection"
                className="sticky -top-5 z-2 -mt-1 mb-3.5 flex items-center gap-2 rounded-[10px] bg-accent px-3 py-2 text-on-accent shadow-card"
              >
                <strong>{picked.size} selected</strong>
                <span className="min-w-0 flex-1" />
                {inTrash ? (
                  <>
                    <button
                      className={btn("bulk")}
                      onClick={() =>
                        void attempt(send("restoreBookmarks", { ids }))
                      }
                    >
                      <I n="rotate-left" /> Restore
                    </button>
                    <button
                      className={btn("bulk")}
                      onClick={() =>
                        void attempt(send("deleteForever", { ids }))
                      }
                    >
                      <I n="trash" /> Delete forever
                    </button>
                  </>
                ) : (
                  <>
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const tags = bulkTag
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean);
                        if (tags.length)
                          void attempt(send("addTags", { ids, tags })).then(
                            () => setBulkTag(""),
                          );
                      }}
                    >
                      <input
                        className={`${inputSmall} w-38`}
                        placeholder="Add a tag"
                        value={bulkTag}
                        onChange={(e) => setBulkTag(e.target.value)}
                        aria-label="Tag to add to the selection"
                      />
                      <button className={btn("bulk small")}>
                        <I n="tag" /> Tag
                      </button>
                    </form>
                    <FolderSelect
                      className={inputSmall}
                      tree={tree}
                      value={null}
                      topLabel="Move to…"
                      onChange={(id) =>
                        void attempt(
                          send("moveBookmarks", { ids, folderId: id }),
                        )
                      }
                    />
                    <button
                      className={btn("bulk")}
                      onClick={() =>
                        void attempt(send("trashBookmarks", { ids }))
                      }
                    >
                      <I n="trash" /> Trash
                    </button>
                    <button
                      className={btn("bulk")}
                      onClick={() =>
                        setFetching({
                          scope: `the ${picked.size} selected bookmark${picked.size === 1 ? "" : "s"}`,
                          bookmarks: snapshot.bookmarks.filter((b) =>
                            picked.has(b.id),
                          ),
                        })
                      }
                    >
                      <I n="globe" /> Pictures…
                    </button>
                  </>
                )}
                <button className={btn("bulk")} onClick={afterBulk}>
                  Clear
                </button>
              </div>
            )}

            {list.length === 0 ? (
              <EmptyState
                searching={searching}
                selection={selection}
                onAdd={() => setDialog({})}
              />
            ) : (
              <BookmarkList
                groups={groups}
                view={view}
                selected={picked}
                inTrash={inTrash}
                onToggle={toggle}
                onPick={pick}
                onEdit={(bookmark) => setDialog({ bookmark })}
                onTag={(tag) => open({ kind: "tag", tag })}
                onReorder={
                  manual
                    ? (dragged, target, before) => {
                        const orders = reorder(
                          list,
                          dragged,
                          target,
                          before,
                          view.sortDir,
                        );
                        if (orders.length)
                          void send("setOrder", { orders }).catch((e) =>
                            setError(errorText(e)),
                          );
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
          settings={status.settings}
          folderId={selection.kind === "folder" ? selection.id : null}
          onClose={() => setDialog(undefined)}
        />
      )}
      {tool === "import" && (
        <ImportDialog snapshot={snapshot} onClose={() => setTool(undefined)} />
      )}
      {tool === "export" && (
        <ExportDialog snapshot={snapshot} onClose={() => setTool(undefined)} />
      )}
      {tool === "duplicates" && (
        <DuplicatesDialog
          snapshot={snapshot}
          onClose={() => setTool(undefined)}
        />
      )}
      {tool === "tags" && (
        <TagDialog snapshot={snapshot} onClose={() => setTool(undefined)} />
      )}
      {fetching && (
        <FetchMissingDialog
          bookmarks={fetching.bookmarks}
          scope={fetching.scope}
          settings={status.settings}
          vaultBytes={status.vaultBytes}
          onClose={() => setFetching(undefined)}
        />
      )}
    </div>
  );
}

const empty =
  "grid place-items-center gap-2 px-5 py-17 text-center text-muted [&>svg]:text-4xl [&>svg]:opacity-55";

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
      <div className={empty}>
        <I n="magnifying-glass" />
        <strong>Nothing matches your search</strong>
        <span>
          Try fewer words, or use #tag, domain:example.com, is:fav, type:video
          or has:note.
        </span>
      </div>
    );
  }
  if (selection.kind === "trash") {
    return (
      <div className={empty}>
        <I n="trash" />
        <strong>The trash is empty</strong>
      </div>
    );
  }
  return (
    <div className={empty}>
      <I n="bookmark" />
      <strong>No bookmarks here yet</strong>
      <span>
        Save the page you are on from the BookPass button in the toolbar, import
        your bookmarks from the menu, or add an address by hand.
      </span>
      <button className={btn("primary")} onClick={onAdd}>
        <I n="plus" /> Add bookmark
      </button>
    </div>
  );
}

export function ManagerApp() {
  return <Shell>{(context) => <Manager {...context} />}</Shell>;
}
