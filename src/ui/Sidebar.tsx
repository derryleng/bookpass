import { useMemo, useState, type DragEvent } from "react";
import type { Bookmark, Folder } from "../bookmark-model";
import {
  buildTree,
  descendantIds,
  tagCounts,
  type Selection,
  type TreeNode,
} from "../browse";
import type { SnapshotReply } from "../messages";
import { send } from "./api";
import { FolderDialog, TagDialog } from "./Dialogs";
import { isOurs, readDrag, startDrag, type DragPayload } from "./dnd";
import {
  btn,
  dropTarget,
  hint,
  navItem,
  countLabel,
  sectionTitle,
} from "./cls";
import { I, Icon } from "./Icon";

interface Props {
  snapshot: SnapshotReply;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onFetchPictures: (scope: string, bookmarks: Bookmark[]) => void;
}

function same(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "folder" && b.kind === "folder") return a.id === b.id;
  if (a.kind === "tag" && b.kind === "tag") return a.tag === b.tag;
  return true;
}

/** Makes an element accept dropped bookmarks and folders. `folderId` null means the top level. */
function useDropTarget(folderId: string | null, tree: TreeNode[]) {
  const [over, setOver] = useState(false);
  return {
    className: over ? dropTarget : "",
    onDragOver: (e: DragEvent) => {
      if (!isOurs(e)) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      setOver(false);
      const payload: DragPayload | undefined = readDrag(e);
      if (!payload) return;
      e.preventDefault();
      if (payload.kind === "bookmarks")
        void send("moveBookmarks", { ids: payload.ids, folderId });
      // A folder cannot move into itself or something inside it.
      else if (
        folderId === null ||
        !descendantIds(tree, payload.id).has(folderId)
      ) {
        void send("moveFolder", { id: payload.id, parentId: folderId });
      }
    },
  };
}

export function Sidebar({
  snapshot,
  selection,
  onSelect,
  onFetchPictures,
}: Props) {
  const [dialog, setDialog] = useState<{
    folder?: Folder;
    parentId?: string | null;
  }>();
  const [tagDialog, setTagDialog] = useState(false);
  const tree = useMemo(
    () => buildTree(snapshot.folders, snapshot.bookmarks),
    [snapshot],
  );
  const tags = useMemo(
    () => tagCounts(snapshot.bookmarks).slice(0, 30),
    [snapshot],
  );
  const unsorted = snapshot.bookmarks.filter((b) => b.folderId === null).length;
  const favorites = snapshot.bookmarks.filter((b) => b.favorite).length;
  const topDrop = useDropTarget(null, tree);

  function item(
    kind: Selection,
    icon: string,
    label: string,
    count?: number,
    drop?: ReturnType<typeof useDropTarget>,
  ) {
    return (
      <button
        className={`${navItem(same(selection, kind))} ${drop?.className ?? ""}`}
        onClick={() => onSelect(kind)}
        onDragOver={drop?.onDragOver}
        onDragLeave={drop?.onDragLeave}
        onDrop={drop?.onDrop}
      >
        <I n={icon} />
        <span className="min-w-0 flex-1">{label}</span>
        {count !== undefined && <span className={countLabel}>{count}</span>}
      </button>
    );
  }

  return (
    <nav
      className="overflow-y-auto border-r border-line px-2.5 pt-3.5 pb-6 max-[800px]:max-h-47 max-[800px]:border-r-0 max-[800px]:border-b"
      aria-label="Collections"
    >
      {item(
        { kind: "all" },
        "layer-group",
        "All bookmarks",
        snapshot.bookmarks.length,
      )}
      {item({ kind: "unsorted" }, "inbox", "Unsorted", unsorted, topDrop)}
      {item({ kind: "favorites" }, "star", "Favorites", favorites)}

      <div className={sectionTitle}>
        <span>Folders</span>
        <button
          className={btn("quiet tiny")}
          onClick={() => setDialog({ parentId: null })}
          aria-label="New folder"
        >
          <I n="plus" />
        </button>
      </div>
      {tree.length === 0 && <p className={`${hint} mx-2.5`}>No folders yet.</p>}
      {tree.map((node) => (
        <FolderRow
          key={node.folder.id}
          node={node}
          tree={tree}
          depth={0}
          selection={selection}
          onSelect={onSelect}
          onEdit={setDialog}
        />
      ))}

      {tags.length > 0 && (
        <>
          <div className={sectionTitle}>
            <span>Tags</span>
            <button
              className={btn("quiet tiny")}
              onClick={() => setTagDialog(true)}
              aria-label="Manage tags"
              title="Manage tags"
            >
              <I n="pen" />
            </button>
          </div>
          {tags.map(({ tag, count }) => (
            <button
              key={tag}
              className={navItem(same(selection, { kind: "tag", tag }))}
              onClick={() => onSelect({ kind: "tag", tag })}
            >
              <I n="tag" />
              <span
                className="min-w-0 flex-1"
                style={
                  snapshot.tagColors[tag]
                    ? { color: snapshot.tagColors[tag] }
                    : undefined
                }
              >
                {tag}
              </span>
              <span className={countLabel}>{count}</span>
            </button>
          ))}
        </>
      )}

      <div className={sectionTitle} />
      {item({ kind: "trash" }, "trash", "Trash", snapshot.trash.length)}

      {dialog && (
        <FolderDialog
          snapshot={snapshot}
          folder={dialog.folder}
          parentId={dialog.parentId}
          onClose={() => setDialog(undefined)}
          onFetchPictures={onFetchPictures}
          onDeleted={() =>
            selection.kind === "folder" &&
            selection.id === dialog.folder?.id &&
            onSelect({ kind: "all" })
          }
        />
      )}
      {tagDialog && (
        <TagDialog snapshot={snapshot} onClose={() => setTagDialog(false)} />
      )}
    </nav>
  );
}

function FolderRow({
  node,
  tree,
  depth,
  selection,
  onSelect,
  onEdit,
}: {
  node: TreeNode;
  tree: TreeNode[];
  depth: number;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onEdit: (dialog: { folder?: Folder; parentId?: string | null }) => void;
}) {
  const { folder } = node;
  const active = selection.kind === "folder" && selection.id === folder.id;
  const open = folder.expanded;
  const toggle = () =>
    void send("updateFolder", { id: folder.id, patch: { expanded: !open } });
  const drop = useDropTarget(folder.id, tree);

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        className={`group/row ${navItem(active)} ${drop.className}`}
        style={{ paddingLeft: 6 + depth * 16 }}
        draggable
        onDragStart={(e) => startDrag(e, { kind: "folder", id: folder.id })}
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
        onClick={() => onSelect({ kind: "folder", id: folder.id })}
        onKeyDown={(e) =>
          e.key === "Enter" && onSelect({ kind: "folder", id: folder.id })
        }
      >
        <button
          className={`-mr-1 grid size-4.5 cursor-pointer place-items-center rounded-sm p-0 text-[10px] text-muted hover:bg-line ${node.children.length ? "" : "invisible"}`}
          onClick={(e) => (e.stopPropagation(), toggle())}
          aria-label={open ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          <I n={open ? "chevron-down" : "chevron-right"} />
        </button>
        <Icon
          name={folder.icon}
          className={`w-[1.1em] ${folder.color || active ? "" : "text-muted"}`}
          style={{ color: folder.color || undefined }}
        />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {folder.name}
        </span>
        <span className="ml-auto hidden gap-0.5 group-focus-within/row:flex group-hover/row:flex">
          <button
            className={btn("quiet tiny")}
            aria-label={`New folder in ${folder.name}`}
            onClick={(e) => (
              e.stopPropagation(),
              onEdit({ parentId: folder.id })
            )}
          >
            <I n="folder-plus" />
          </button>
          <button
            className={btn("quiet tiny")}
            aria-label={`Edit ${folder.name}`}
            onClick={(e) => (e.stopPropagation(), onEdit({ folder }))}
          >
            <I n="pen" />
          </button>
        </span>
        <span
          className={`${countLabel} group-focus-within/row:hidden group-hover/row:hidden`}
        >
          {node.total || ""}
        </span>
      </div>
      {open &&
        node.children.map((child) => (
          <FolderRow
            key={child.folder.id}
            node={child}
            tree={tree}
            depth={depth + 1}
            selection={selection}
            onSelect={onSelect}
            onEdit={onEdit}
          />
        ))}
    </div>
  );
}
