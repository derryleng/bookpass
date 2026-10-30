// The dialogs for editing a bookmark or a folder.
export { TagDialog } from "./TagDialog";
import { useState, type FormEvent } from "react";
import type { Bookmark, BookmarkType, Folder } from "../bookmark-model";
import { bookmarkTypes } from "../bookmark-model";
import { buildTree, completeUrl, descendantIds } from "../browse";
import type { SnapshotReply } from "../messages";
import { send } from "./api";
import { Dialog } from "./Dialog";
import { I } from "./Icon";
import { toBase64 } from "../base64";
import type { Settings } from "../settings";
import { HistoryList } from "./HistoryList";
import {
  PicturesField,
  pendingToCapture,
  type PicturePending,
} from "./PicturesField";
import { IconPicker } from "./IconPicker";
import { renderIconPng, rememberIcon, useIconsFor } from "./icon-library";
import { errorText, FolderSelect, TagInput } from "./parts";
import { btn, callout, field, hint, input, summaryLabel } from "./cls";

interface BookmarkDialogProps {
  snapshot: SnapshotReply;
  /** The bookmark being edited, or undefined for a new one. */
  bookmark?: Bookmark;
  /** Folder to start in for a new bookmark. */
  folderId?: string | null;
  /** An address and title to start a new bookmark with. */
  initial?: { url: string; title: string };
  settings: Settings;
  onClose: () => void;
}

export function BookmarkDialog({
  snapshot,
  bookmark,
  folderId = null,
  initial,
  settings,
  onClose,
}: BookmarkDialogProps) {
  const tree = buildTree(snapshot.folders, snapshot.bookmarks);
  const [url, setUrl] = useState(bookmark?.url ?? initial?.url ?? "");
  const [title, setTitle] = useState(bookmark?.title ?? initial?.title ?? "");
  const [folder, setFolder] = useState<string | null>(
    bookmark ? bookmark.folderId : folderId,
  );
  const [tags, setTags] = useState(bookmark?.tags ?? []);
  const [note, setNote] = useState(bookmark?.note ?? "");
  const [type, setType] = useState<BookmarkType>(bookmark?.type ?? "link");
  const [favorite, setFavorite] = useState(bookmark?.favorite ?? false);
  const [pictures, setPictures] = useState<PicturePending>({});
  const [error, setError] = useState<string>();
  const allTags = [
    ...new Set(snapshot.bookmarks.flatMap((b) => b.tags)),
  ].sort();

  async function save(e: FormEvent) {
    e.preventDefault();
    const address = completeUrl(url);
    if (!URL.canParse(address)) return setError("That is not a web address.");
    const input = {
      folderId: folder,
      title: title.trim() || address,
      url: address,
      note,
      type,
      favorite,
      tags,
    };
    try {
      const capture = pendingToCapture(pictures);
      if (bookmark)
        await send("updateBookmark", {
          id: bookmark.id,
          patch: input,
          capture,
        });
      else await send("addBookmark", { input, capture });
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove() {
    if (!bookmark) return;
    try {
      await send("trashBookmarks", { ids: [bookmark.id] });
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Dialog
      title={bookmark ? "Edit bookmark" : "Add bookmark"}
      onClose={onClose}
      footer={
        <>
          {bookmark && (
            <button type="button" className={btn("danger")} onClick={remove}>
              <I n="trash" /> Move to trash
            </button>
          )}
          <span className="min-w-0 flex-1" />
          <button type="button" className={btn()} onClick={onClose}>
            Cancel
          </button>
          <button className={btn("primary")} form="bookmark-form">
            Save
          </button>
        </>
      }
    >
      <form
        id="bookmark-form"
        className="flex flex-col gap-3"
        onSubmit={save}
        noValidate
      >
        <label className={field}>
          <span>Address</span>
          <input
            className={input}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.com"
            required
            autoFocus={!bookmark}
          />
        </label>
        <label className={field}>
          <span>Title</span>
          <input
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Page title"
          />
        </label>
        <div className="flex items-center gap-2">
          <label className={`${field} min-w-0 flex-1`}>
            <span>Folder</span>
            <FolderSelect tree={tree} value={folder} onChange={setFolder} />
          </label>
          <label className={field}>
            <span>Type</span>
            <select
              className={input}
              value={type}
              onChange={(e) => setType(e.target.value as BookmarkType)}
            >
              {bookmarkTypes.map((t) => (
                <option key={t} value={t}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={field}>
          <span>Tags</span>
          <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
        </div>
        <label className={field}>
          <span>Note</span>
          <textarea
            className={`${input} min-h-18 resize-y`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <PicturesField
          bookmark={bookmark}
          url={completeUrl(url)}
          settings={settings}
          pending={pictures}
          onPending={setPictures}
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
          />
          <span>Favorite</span>
        </label>
        {error && <div className={callout("error")}>{error}</div>}
      </form>
      {bookmark && (
        <details className="mt-2.5">
          <summary className={summaryLabel}>Earlier versions</summary>
          <HistoryList id={bookmark.id} onRestored={onClose} />
        </details>
      )}
    </Dialog>
  );
}

interface FolderDialogProps {
  snapshot: SnapshotReply;
  /** The folder being edited, or undefined to create one. */
  folder?: Folder;
  /** Parent for a new folder. */
  parentId?: string | null;
  onClose: () => void;
  onDeleted?: () => void;
  /** Opens the tool that fetches missing pictures for some bookmarks. */
  onFetchPictures?: (scope: string, bookmarks: Bookmark[]) => void;
}

export function FolderDialog({
  snapshot,
  folder,
  parentId = null,
  onClose,
  onDeleted,
  onFetchPictures,
}: FolderDialogProps) {
  const tree = buildTree(snapshot.folders, snapshot.bookmarks);
  const [name, setName] = useState(folder?.name ?? "");
  const [icon, setIcon] = useState(folder?.icon ?? "fa-solid:folder");
  const [color, setColor] = useState(folder?.color ?? "");
  const [parent, setParent] = useState<string | null>(
    folder ? folder.parentId : parentId,
  );
  const [error, setError] = useState<string>();
  useIconsFor([icon]);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const iconImage =
        icon === "fa-solid:folder" && !color
          ? undefined
          : {
              name: `${icon}|${color}`,
              png: toBase64(await renderIconPng(icon, color)),
            };
      rememberIcon(icon);
      if (folder) {
        await send("updateFolder", {
          id: folder.id,
          patch: { name: name.trim(), icon, color, iconImage },
        });
        if (parent !== folder.parentId)
          await send("moveFolder", { id: folder.id, parentId: parent });
      } else {
        await send("createFolder", {
          parentId: parent,
          name: name.trim(),
          patch: { icon, color, iconImage },
        });
      }
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove() {
    if (!folder) return;
    try {
      await send("trashFolder", { id: folder.id });
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Dialog
      title={folder ? "Edit folder" : "New folder"}
      onClose={onClose}
      footer={
        <>
          {folder && (
            <button type="button" className={btn("danger")} onClick={remove}>
              <I n="trash" /> Move to trash
            </button>
          )}
          <span className="min-w-0 flex-1" />
          <button type="button" className={btn()} onClick={onClose}>
            Cancel
          </button>
          <button className={btn("primary")} form="folder-form">
            Save
          </button>
        </>
      }
    >
      <form id="folder-form" className="flex flex-col gap-3" onSubmit={save}>
        <label className={field}>
          <span>Name</span>
          <input
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className={field}>
          <span>Inside</span>
          <FolderSelect
            tree={tree}
            value={parent}
            onChange={setParent}
            exclude={folder ? descendantIds(tree, folder.id) : undefined}
            topLabel="Top level"
          />
        </label>
        <IconPicker
          icon={icon}
          color={color}
          onIcon={setIcon}
          onColor={setColor}
        />
        {folder && onFetchPictures && (
          <div className={field}>
            <span>Pictures</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={btn()}
                onClick={() => {
                  const inside = descendantIds(tree, folder.id);
                  onClose();
                  onFetchPictures(
                    `the folder ${folder.name}`,
                    snapshot.bookmarks.filter(
                      (b) => b.folderId !== null && inside.has(b.folderId),
                    ),
                  );
                }}
              >
                <I n="globe" /> Fetch missing pictures…
              </button>
            </div>
            <span className={`${hint} font-normal!`}>
              For the bookmarks in this folder and the folders inside it. You
              choose which sites to contact first.
            </span>
          </div>
        )}
        {error && <div className={callout("error")}>{error}</div>}
      </form>
    </Dialog>
  );
}
