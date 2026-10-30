// Moving bookmarks in from other places and out to files: import, export and the duplicate finder.
import { useMemo, useState } from "react";
import { browser } from "wxt/browser";
import { buildTree, normalizeUrl } from "../browse";
import {
  fromBrowserTree,
  parseNetscape,
  parseRaindropCsv,
  toJson,
  toNetscape,
  toRaindropCsv,
  type BrowserNode,
  type ParsedImport,
} from "../formats";
import type { ImportResult } from "../importing";
import type { SnapshotReply } from "../messages";
import { send } from "./api";
import { Dialog } from "./Dialog";
import { I } from "./Icon";
import { errorText, FolderSelect } from "./parts";
import { btn, callout, field, hint } from "./cls";

/** Works out the format from what the file contains, not what it is called. */
export function parseBookmarkFile(text: string): ParsedImport {
  if (/<a\s[^>]*href|netscape-bookmark-file/i.test(text.slice(0, 200_000)))
    return parseNetscape(text);
  return parseRaindropCsv(text);
}

export function ImportDialog({
  snapshot,
  onClose,
}: {
  snapshot: SnapshotReply;
  onClose: () => void;
}) {
  const tree = useMemo(
    () => buildTree(snapshot.folders, snapshot.bookmarks),
    [snapshot],
  );
  const [parsed, setParsed] = useState<ParsedImport>();
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<ImportResult>();
  const [done, setDone] = useState<ImportResult>();
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [parent, setParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const today = new Date().toISOString().slice(0, 10);

  async function load(next: ParsedImport, name: string, skip = skipDuplicates) {
    setParsed(next);
    setSource(name);
    setPreview(
      await send("importPreview", { parsed: next, skipDuplicates: skip }),
    );
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    try {
      await load(parseBookmarkFile(await file.text()), file.name);
    } catch (e) {
      setParsed(undefined);
      setPreview(undefined);
      setError(errorText(e));
    }
  }

  async function fromBrowser() {
    setError(undefined);
    try {
      if (
        !(await browser.permissions.request({ permissions: ["bookmarks"] }))
      ) {
        return setError(
          "BookPass needs the bookmarks permission to read your browser bookmarks.",
        );
      }
      const roots = (await browser.bookmarks.getTree()) as BrowserNode[];
      await load(fromBrowserTree(roots), "your browser bookmarks");
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function run() {
    if (!parsed) return;
    setBusy(true);
    try {
      setDone(
        await send("importBookmarks", {
          parsed,
          parentId: parent,
          wrapper: wrap ? `Imported ${today}` : undefined,
          skipDuplicates,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Import bookmarks" onClose={onClose}>
      {done ? (
        <>
          <div className={callout()} role="status">
            <I n="circle-check" />
            <span>
              Imported {done.added} bookmark{done.added === 1 ? "" : "s"} and{" "}
              {done.folders} folder
              {done.folders === 1 ? "" : "s"}.
              {done.skipped > 0 &&
                ` ${done.skipped} already in your vault were skipped.`}
            </span>
          </div>
          <footer className="flex items-center gap-2">
            <span className="min-w-0 flex-1" />
            <button className={btn("primary")} onClick={onClose}>
              Done
            </button>
          </footer>
        </>
      ) : (
        <>
          <p className={hint}>
            Bookmark files from Chrome, Firefox, Raindrop (HTML or CSV) and most
            other services work. The whole file is read here, on your computer.
          </p>
          <div className="flex items-center gap-2">
            <label className={btn()}>
              <I n="file-lines" /> Choose a file
              <input
                type="file"
                accept=".html,.htm,.csv,text/html,text/csv"
                hidden
                onChange={(e) => void chooseFile(e.target.files?.[0])}
              />
            </label>
            <button className={btn()} onClick={() => void fromBrowser()}>
              <I n="globe" /> My browser's bookmarks
            </button>
          </div>
          {preview && parsed && (
            <>
              <div className={callout()} role="status">
                <I n="circle-check" />
                <span>
                  {source}: {preview.added} bookmark
                  {preview.added === 1 ? "" : "s"} to import
                  {preview.skipped > 0 && `, ${preview.skipped} already here`}
                  {preview.folders > 0 &&
                    `, ${preview.folders} folder${preview.folders === 1 ? "" : "s"} to create`}
                  .
                </span>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => {
                    setSkipDuplicates(e.target.checked);
                    void load(parsed, source, e.target.checked);
                  }}
                />
                <span>
                  Skip bookmarks whose address is already in the vault
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={wrap}
                  onChange={(e) => setWrap(e.target.checked)}
                />
                <span>Put them in a new folder called Imported {today}</span>
              </label>
              <label className={field}>
                <span>Place it inside</span>
                <FolderSelect
                  tree={tree}
                  value={parent}
                  onChange={setParent}
                  topLabel="Top level"
                />
              </label>
            </>
          )}
          {error && (
            <div className={callout("error")} role="alert">
              {error}
            </div>
          )}
          <footer className="flex items-center gap-2">
            <span className="min-w-0 flex-1" />
            <button className={btn()} onClick={onClose}>
              Cancel
            </button>
            <button
              className={btn("primary")}
              disabled={!preview || preview.added === 0 || busy}
              onClick={() => void run()}
            >
              {busy ? <I n="spinner" spin /> : <I n="plus" />} Import
            </button>
          </footer>
        </>
      )}
    </Dialog>
  );
}

function download(name: string, type: string, text: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ExportDialog({
  snapshot,
  onClose,
}: {
  snapshot: SnapshotReply;
  onClose: () => void;
}) {
  const stamp = new Date().toISOString().slice(0, 10);
  const { folders, bookmarks } = snapshot;
  return (
    <Dialog title="Export bookmarks" onClose={onClose}>
      <div className={callout("warn")}>
        <I n="triangle-exclamation" />
        <span>
          Exported files are not encrypted. Anyone who gets a copy can read
          every address and note. Your vault file, which is encrypted, already
          opens in KeePassXC and is the better backup.
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <button
          className={btn()}
          onClick={() =>
            download(
              `bookpass-${stamp}.html`,
              "text/html",
              toNetscape(folders, bookmarks),
            )
          }
        >
          <I n="file-lines" /> HTML for browsers and most services
        </button>
        <button
          className={btn()}
          onClick={() =>
            download(
              `bookpass-${stamp}.csv`,
              "text/csv",
              toRaindropCsv(folders, bookmarks),
            )
          }
        >
          <I n="file-lines" /> CSV with folders, tags and notes
        </button>
        <button
          className={btn()}
          onClick={() =>
            download(
              `bookpass-${stamp}.json`,
              "application/json",
              toJson(folders, bookmarks),
            )
          }
        >
          <I n="file-lines" /> JSON with everything
        </button>
      </div>
      <p className={hint}>
        {bookmarks.length} bookmark{bookmarks.length === 1 ? "" : "s"} in{" "}
        {folders.length} folder
        {folders.length === 1 ? "" : "s"}. Cover pictures and icons stay in the
        vault.
      </p>
    </Dialog>
  );
}

export function DuplicatesDialog({
  snapshot,
  onClose,
}: {
  snapshot: SnapshotReply;
  onClose: () => void;
}) {
  const folderName = new Map(snapshot.folders.map((f) => [f.id, f.name]));
  const groups = useMemo(() => {
    const byUrl = new Map<string, typeof snapshot.bookmarks>();
    for (const b of snapshot.bookmarks) {
      const key = normalizeUrl(b.url);
      byUrl.set(key, [...(byUrl.get(key) ?? []), b]);
    }
    return [...byUrl.values()].filter((g) => g.length > 1);
  }, [snapshot]);
  const [error, setError] = useState<string>();

  const trash = (ids: string[]) =>
    void send("trashBookmarks", { ids }).catch((e) => setError(errorText(e)));
  const extras = groups.flatMap((g) =>
    [...g]
      .sort((a, b) => b.created - a.created)
      .slice(1)
      .map((b) => b.id),
  );

  return (
    <Dialog title="Duplicate bookmarks" onClose={onClose}>
      {groups.length === 0 ? (
        <div className={callout()} role="status">
          <I n="circle-check" />
          <span>No two bookmarks share an address.</span>
        </div>
      ) : (
        <>
          <p className={hint}>
            Addresses that differ only by a trailing slash or a #fragment count
            as the same page.
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {groups.map((group) => (
              <li
                key={group[0]!.id}
                className="rounded-[10px] border border-line bg-surface p-3"
              >
                <div className={`${hint} break-all`}>{group[0]!.url}</div>
                {group.map((b) => (
                  <div key={b.id} className="mt-1.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      {b.title}{" "}
                      <span className={hint}>
                        in{" "}
                        {b.folderId
                          ? (folderName.get(b.folderId) ?? "a folder")
                          : "Unsorted"}
                        , {new Date(b.created).toLocaleDateString()}
                      </span>
                    </span>
                    <button
                      className={btn("small")}
                      onClick={() =>
                        trash(
                          group.filter((x) => x.id !== b.id).map((x) => x.id),
                        )
                      }
                    >
                      Keep this one
                    </button>
                  </div>
                ))}
              </li>
            ))}
          </ul>
          <button className={btn()} onClick={() => trash(extras)}>
            <I n="trash" /> Keep only the newest of each ({extras.length} to
            trash)
          </button>
        </>
      )}
      {error && (
        <div className={callout("error")} role="alert">
          {error}
        </div>
      )}
    </Dialog>
  );
}
