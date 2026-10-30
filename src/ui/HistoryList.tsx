import { useEffect, useState } from "react";
import type { Version } from "../history";
import { send } from "./api";
import { btn, callout, hint } from "./cls";
import { errorText } from "./parts";

/** Earlier versions of a bookmark, each with a button to bring it back. */
export function HistoryList({
  id,
  onRestored,
}: {
  id: string;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<Version[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    send("history", { id }).then(
      (v) => live && setVersions(v),
      (e) => live && setError(errorText(e)),
    );
    return () => {
      live = false;
    };
  }, [id]);

  if (error) return <p className={callout("error")}>{error}</p>;
  if (!versions) return <p className={hint}>Loading…</p>;
  if (versions.length === 0) {
    return (
      <p className={hint}>
        No earlier versions. They appear here when you edit.
      </p>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {versions.map((v) => (
        <li key={v.time} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate">{v.title}</div>
            <div className={hint}>{new Date(v.time).toLocaleString()}</div>
          </div>
          <button
            className={btn("small")}
            onClick={() =>
              void send("restoreVersion", { id, time: v.time }).then(
                onRestored,
                (e) => setError(errorText(e)),
              )
            }
          >
            Restore
          </button>
        </li>
      ))}
    </ul>
  );
}
