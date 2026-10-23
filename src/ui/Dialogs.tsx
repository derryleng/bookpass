// The dialogs for editing a bookmark or a folder.
import { useState, type FormEvent } from 'react';
import type { Bookmark, BookmarkType, Folder } from '../bookmark-model';
import { bookmarkTypes } from '../bookmark-model';
import { buildTree, descendantIds } from '../browse';
import type { SnapshotReply } from '../messages';
import { send } from './api';
import { Dialog } from './Dialog';
import { I, Icon } from './Icon';
import { folderColors, folderIconChoices } from './icons';
import { errorText, FolderSelect, TagInput } from './parts';

interface BookmarkDialogProps {
  snapshot: SnapshotReply;
  /** The bookmark being edited, or undefined for a new one. */
  bookmark?: Bookmark;
  /** Folder to start in for a new bookmark. */
  folderId?: string | null;
  onClose: () => void;
}

export function BookmarkDialog({
  snapshot,
  bookmark,
  folderId = null,
  onClose,
}: BookmarkDialogProps) {
  const tree = buildTree(snapshot.folders, snapshot.bookmarks);
  const [url, setUrl] = useState(bookmark?.url ?? '');
  const [title, setTitle] = useState(bookmark?.title ?? '');
  const [folder, setFolder] = useState<string | null>(bookmark ? bookmark.folderId : folderId);
  const [tags, setTags] = useState(bookmark?.tags ?? []);
  const [note, setNote] = useState(bookmark?.note ?? '');
  const [type, setType] = useState<BookmarkType>(bookmark?.type ?? 'link');
  const [favorite, setFavorite] = useState(bookmark?.favorite ?? false);
  const [error, setError] = useState<string>();
  const allTags = [...new Set(snapshot.bookmarks.flatMap((b) => b.tags))].sort();

  async function save(e: FormEvent) {
    e.preventDefault();
    const input = {
      folderId: folder,
      title: title.trim() || url,
      url: url.trim(),
      note,
      type,
      favorite,
      tags,
    };
    try {
      if (bookmark) await send('updateBookmark', { id: bookmark.id, patch: input });
      else await send('addBookmark', { input });
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove() {
    if (!bookmark) return;
    try {
      await send('trashBookmarks', { ids: [bookmark.id] });
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Dialog title={bookmark ? 'Edit bookmark' : 'Add bookmark'} onClose={onClose}>
      <form id="bookmark-form" className="stack" onSubmit={save}>
        <label className="field">
          <span>Address</span>
          <input
            className="input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            required
            autoFocus={!bookmark}
          />
        </label>
        <label className="field">
          <span>Title</span>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Page title"
          />
        </label>
        <div className="row">
          <label className="field grow">
            <span>Folder</span>
            <FolderSelect tree={tree} value={folder} onChange={setFolder} />
          </label>
          <label className="field">
            <span>Type</span>
            <select
              className="select"
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
        <div className="field">
          <span>Tags</span>
          <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
        </div>
        <label className="field">
          <span>Note</span>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
          />
          <span>Favorite</span>
        </label>
        {error && <div className="callout error">{error}</div>}
      </form>
      <div className="modal-foot" style={{ padding: '4px 0 0' }}>
        {bookmark && (
          <button type="button" className="btn danger" onClick={remove}>
            <I n="trash" /> Move to trash
          </button>
        )}
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" form="bookmark-form">
          Save
        </button>
      </div>
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
}

export function FolderDialog({
  snapshot,
  folder,
  parentId = null,
  onClose,
  onDeleted,
}: FolderDialogProps) {
  const tree = buildTree(snapshot.folders, snapshot.bookmarks);
  const [name, setName] = useState(folder?.name ?? '');
  const [icon, setIcon] = useState(folder?.icon ?? 'fa-solid:folder');
  const [color, setColor] = useState(folder?.color ?? '');
  const [parent, setParent] = useState<string | null>(folder ? folder.parentId : parentId);
  const [error, setError] = useState<string>();

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      if (folder) {
        await send('updateFolder', { id: folder.id, patch: { name: name.trim(), icon, color } });
        if (parent !== folder.parentId)
          await send('moveFolder', { id: folder.id, parentId: parent });
      } else {
        await send('createFolder', { parentId: parent, name: name.trim(), patch: { icon, color } });
      }
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove() {
    if (!folder) return;
    try {
      await send('trashFolder', { id: folder.id });
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Dialog title={folder ? 'Edit folder' : 'New folder'} onClose={onClose}>
      <form id="folder-form" className="stack" onSubmit={save}>
        <label className="field">
          <span>Name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Inside</span>
          <FolderSelect
            tree={tree}
            value={parent}
            onChange={setParent}
            exclude={folder ? descendantIds(tree, folder.id) : undefined}
            topLabel="Top level"
          />
        </label>
        <div className="field">
          <span>Icon</span>
          <div className="icon-grid">
            {folderIconChoices.map((key) => (
              <button
                type="button"
                key={key}
                className={`icon-choice ${key === icon ? 'active' : ''}`}
                onClick={() => setIcon(key)}
                aria-label={key.split(':')[1]}
                style={{ color: key === icon ? undefined : color || undefined }}
              >
                <Icon name={key} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Color</span>
          <div className="swatches">
            {folderColors.map((c) => (
              <button
                type="button"
                key={c || 'none'}
                className={`swatch ${c === color ? 'active' : ''}`}
                style={{ ['--c' as string]: c || 'var(--muted)' }}
                onClick={() => setColor(c)}
                aria-label={c || 'No color'}
              />
            ))}
          </div>
        </div>
        {error && <div className="callout error">{error}</div>}
      </form>
      <div className="modal-foot" style={{ padding: '4px 0 0' }}>
        {folder && (
          <button type="button" className="btn danger" onClick={remove}>
            <I n="trash" /> Move to trash
          </button>
        )}
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" form="folder-form">
          Save
        </button>
      </div>
    </Dialog>
  );
}
