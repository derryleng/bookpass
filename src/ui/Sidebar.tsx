import { useMemo, useState } from 'react';
import type { Folder } from '../bookmark-model';
import { buildTree, tagCounts, type Selection, type TreeNode } from '../browse';
import type { SnapshotReply } from '../messages';
import { send } from './api';
import { FolderDialog } from './Dialogs';
import { I, Icon } from './Icon';

interface Props {
  snapshot: SnapshotReply;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

function same(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'folder' && b.kind === 'folder') return a.id === b.id;
  if (a.kind === 'tag' && b.kind === 'tag') return a.tag === b.tag;
  return true;
}

export function Sidebar({ snapshot, selection, onSelect }: Props) {
  const [dialog, setDialog] = useState<{ folder?: Folder; parentId?: string | null }>();
  const tree = useMemo(() => buildTree(snapshot.folders, snapshot.bookmarks), [snapshot]);
  const tags = useMemo(() => tagCounts(snapshot.bookmarks).slice(0, 30), [snapshot]);
  const unsorted = snapshot.bookmarks.filter((b) => b.folderId === null).length;
  const favorites = snapshot.bookmarks.filter((b) => b.favorite).length;

  function item(kind: Selection, icon: string, label: string, count?: number) {
    return (
      <button
        className={`nav-item ${same(selection, kind) ? 'active' : ''}`}
        onClick={() => onSelect(kind)}
      >
        <I n={icon} />
        <span className="grow">{label}</span>
        {count !== undefined && <span className="count">{count}</span>}
      </button>
    );
  }

  return (
    <nav className="sidebar" aria-label="Collections">
      {item({ kind: 'all' }, 'layer-group', 'All bookmarks', snapshot.bookmarks.length)}
      {item({ kind: 'unsorted' }, 'inbox', 'Unsorted', unsorted)}
      {item({ kind: 'favorites' }, 'star', 'Favorites', favorites)}

      <div className="section-title">
        <span>Folders</span>
        <button
          className="btn ghost small square"
          style={{ width: 24, height: 24 }}
          onClick={() => setDialog({ parentId: null })}
          aria-label="New folder"
        >
          <I n="plus" />
        </button>
      </div>
      {tree.length === 0 && (
        <p className="hint" style={{ margin: '0 9px' }}>
          No folders yet. Create one to organise your bookmarks.
        </p>
      )}
      {tree.map((node) => (
        <FolderRow
          key={node.folder.id}
          node={node}
          depth={0}
          selection={selection}
          onSelect={onSelect}
          onEdit={setDialog}
        />
      ))}

      {tags.length > 0 && (
        <>
          <div className="section-title">
            <span>Tags</span>
          </div>
          {tags.map(({ tag, count }) => (
            <button
              key={tag}
              className={`nav-item ${same(selection, { kind: 'tag', tag }) ? 'active' : ''}`}
              onClick={() => onSelect({ kind: 'tag', tag })}
            >
              <I n="tag" />
              <span className="grow">{tag}</span>
              <span className="count">{count}</span>
            </button>
          ))}
        </>
      )}

      <div className="section-title" />
      {item({ kind: 'trash' }, 'trash', 'Trash', snapshot.trash.length)}

      {dialog && (
        <FolderDialog
          snapshot={snapshot}
          folder={dialog.folder}
          parentId={dialog.parentId}
          onClose={() => setDialog(undefined)}
          onDeleted={() =>
            selection.kind === 'folder' &&
            selection.id === dialog.folder?.id &&
            onSelect({ kind: 'all' })
          }
        />
      )}
    </nav>
  );
}

function FolderRow({
  node,
  depth,
  selection,
  onSelect,
  onEdit,
}: {
  node: TreeNode;
  depth: number;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onEdit: (dialog: { folder?: Folder; parentId?: string | null }) => void;
}) {
  const { folder } = node;
  const active = selection.kind === 'folder' && selection.id === folder.id;
  const open = folder.expanded;
  const toggle = () => void send('updateFolder', { id: folder.id, patch: { expanded: !open } });

  return (
    <div className="tree-item">
      <div
        role="button"
        tabIndex={0}
        className={`tree-row ${active ? 'active' : ''}`}
        style={{
          paddingLeft: 6 + depth * 16,
          ['--folder-color' as string]: folder.color || undefined,
        }}
        onClick={() => onSelect({ kind: 'folder', id: folder.id })}
        onKeyDown={(e) => e.key === 'Enter' && onSelect({ kind: 'folder', id: folder.id })}
      >
        <button
          className={`tree-twisty ${node.children.length ? '' : 'leaf'}`}
          onClick={(e) => (e.stopPropagation(), toggle())}
          aria-label={open ? 'Collapse' : 'Expand'}
          tabIndex={-1}
        >
          <I n={open ? 'chevron-down' : 'chevron-right'} />
        </button>
        <Icon name={folder.icon} className="tree-icon" />
        <span
          className="grow"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {folder.name}
        </span>
        <span className="tree-actions">
          <button
            className="btn ghost"
            aria-label={`New folder in ${folder.name}`}
            onClick={(e) => (e.stopPropagation(), onEdit({ parentId: folder.id }))}
          >
            <I n="folder-plus" />
          </button>
          <button
            className="btn ghost"
            aria-label={`Edit ${folder.name}`}
            onClick={(e) => (e.stopPropagation(), onEdit({ folder }))}
          >
            <I n="pen" />
          </button>
        </span>
        <span className="count">{node.total || ''}</span>
      </div>
      {open &&
        node.children.map((child) => (
          <FolderRow
            key={child.folder.id}
            node={child}
            depth={depth + 1}
            selection={selection}
            onSelect={onSelect}
            onEdit={onEdit}
          />
        ))}
    </div>
  );
}
