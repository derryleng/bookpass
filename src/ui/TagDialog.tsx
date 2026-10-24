import { useState } from "react";
import { tagCounts } from "../browse";
import type { SnapshotReply } from "../messages";
import { send } from "./api";
import { Dialog } from "./Dialog";
import { I } from "./Icon";
import { folderColors } from "./icons";
import { errorText } from "./parts";

/** Rename, merge, color and delete tags. Renaming a tag to the name of another one merges the two. */
export function TagDialog({
  snapshot,
  onClose,
}: {
  snapshot: SnapshotReply;
  onClose: () => void;
}) {
  const tags = tagCounts(snapshot.bookmarks);
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();

  async function run(job: () => Promise<unknown>) {
    try {
      await job();
      setEditing(undefined);
      setError(undefined);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Dialog title="Tags" onClose={onClose}>
      {tags.length === 0 && <p className="muted">No bookmark has a tag yet.</p>}
      <ul className="tag-list">
        {tags.map(({ tag, count }) => (
          <li key={tag}>
            {editing === tag ? (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => send("renameTag", { from: tag, to: name }));
                }}
              >
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  aria-label={`New name for ${tag}`}
                />
                <button className="btn primary small">Rename</button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => setEditing(undefined)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="row">
                <span
                  className="grow"
                  style={{ color: snapshot.tagColors[tag] }}
                >
                  {tag}
                </span>
                <span className="count">{count}</span>
                <select
                  className="select"
                  style={{ width: "auto" }}
                  value={snapshot.tagColors[tag] ?? ""}
                  onChange={(e) =>
                    void run(() =>
                      send("setTagColor", { tag, color: e.target.value }),
                    )
                  }
                  aria-label={`Color of ${tag}`}
                >
                  {folderColors.map((c) => (
                    <option key={c} value={c}>
                      {c ? c : "No color"}
                    </option>
                  ))}
                </select>
                <button
                  className="btn ghost square"
                  title="Rename or merge"
                  aria-label={`Rename ${tag}`}
                  onClick={() => (setEditing(tag), setName(tag))}
                >
                  <I n="pen" />
                </button>
                <button
                  className="btn ghost square"
                  title="Delete the tag from every bookmark"
                  aria-label={`Delete ${tag}`}
                  onClick={() =>
                    confirm(
                      `Remove the tag "${tag}" from ${count} bookmark${count === 1 ? "" : "s"}?`,
                    ) && void run(() => send("deleteTag", { tag }))
                  }
                >
                  <I n="trash" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <div className="callout error" role="alert">
          {error}
        </div>
      )}
    </Dialog>
  );
}
