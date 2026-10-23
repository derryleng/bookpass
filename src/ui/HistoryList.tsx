import { useEffect, useState } from 'react';
import type { Version } from '../history';
import { send } from './api';
import { errorText } from './parts';

/** Earlier versions of a bookmark, each with a button to bring it back. */
export function HistoryList({ id, onRestored }: { id: string; onRestored: () => void }) {
  const [versions, setVersions] = useState<Version[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    send('history', { id }).then(
      (v) => live && setVersions(v),
      (e) => live && setError(errorText(e)),
    );
    return () => {
      live = false;
    };
  }, [id]);

  if (error) return <p className="callout error">{error}</p>;
  if (!versions) return <p className="hint">Loading…</p>;
  if (versions.length === 0) {
    return <p className="hint">No earlier versions. They appear here when you edit.</p>;
  }
  return (
    <ul className="tag-list">
      {versions.map((v) => (
        <li key={v.time} className="row">
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.title}
            </div>
            <div className="hint">{new Date(v.time).toLocaleString()}</div>
          </div>
          <button
            className="btn small"
            onClick={() =>
              void send('restoreVersion', { id, time: v.time }).then(onRestored, (e) =>
                setError(errorText(e)),
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
