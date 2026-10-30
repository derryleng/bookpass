import { useState } from "react";
import { tagCounts } from "../browse";
import type { SnapshotReply } from "../messages";
import { send } from "./api";
import { Dialog } from "./Dialog";
import { btn, callout, countLabel, input, inputSmall } from "./cls";
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
      {tags.length === 0 && <p className="text-muted">No tags yet.</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {tags.map(({ tag, count }) => (
          <li key={tag}>
            {editing === tag ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => send("renameTag", { from: tag, to: name }));
                }}
              >
                <input
                  className={input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  aria-label={`New name for ${tag}`}
                />
                <button className={btn("primary small")}>Rename</button>
                <button
                  type="button"
                  className={btn("small")}
                  onClick={() => setEditing(undefined)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span
                  className="min-w-0 flex-1"
                  style={{ color: snapshot.tagColors[tag] }}
                >
                  {tag}
                </span>
                <span className={countLabel}>{count}</span>
                <select
                  className={inputSmall}
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
                  className={btn("ghost square")}
                  title="Rename or merge"
                  aria-label={`Rename ${tag}`}
                  onClick={() => (setEditing(tag), setName(tag))}
                >
                  <I n="pen" />
                </button>
                <button
                  className={btn("ghost square")}
                  title="Delete tag"
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
        <div className={callout("error")} role="alert">
          {error}
        </div>
      )}
    </Dialog>
  );
}
