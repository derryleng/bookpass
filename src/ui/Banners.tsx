// Notices above the bookmark list: things that need a decision or deserve a heads up.
import { useState } from "react";
import { stopCoversVaultBytes, warnVaultBytes } from "../constants";
import type { Status } from "../messages";
import { send } from "./api";
import { btn, callout, path } from "./cls";
import { I } from "./Icon";
import { errorText } from "./parts";

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

export function Banners({ status }: { status: Status }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState<string>();
  const hide = (key: string) =>
    setHidden((current) => new Set(current).add(key));

  async function run(key: string, job: () => Promise<unknown>) {
    setWorking(key);
    try {
      await job();
      setError(undefined);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setWorking(undefined);
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-2" aria-live="polite">
      {status.conflictCopies
        .filter((name) => !hidden.has(name))
        .map((name) => (
          <div className={callout("warn")} key={name}>
            <I n="triangle-exclamation" />
            <span className="min-w-0 flex-1">
              Conflicting vault copy detected:{" "}
              <span className={path}>{name}</span>.
            </span>
            <button
              className={btn("small")}
              disabled={working === name}
              onClick={() =>
                void run(name, () => send("mergeConflictCopy", { name }))
              }
            >
              {working === name ? <I n="spinner" spin /> : "Merge"}
            </button>
            <button className={btn("small")} onClick={() => hide(name)}>
              Not now
            </button>
          </div>
        ))}

      {status.versionConflicts.map((c) => (
        <div className={callout()} key={c.id}>
          <I n="circle-exclamation" />
          <span className="min-w-0 flex-1">
            Conflicting edits to <strong>{c.title}</strong>. The edit from{" "}
            {c.kept} was kept. The other is in the bookmark history.
          </span>
          <button
            className={btn("small")}
            onClick={() =>
              void run(c.id, () =>
                send("resolveConflict", { id: c.id, action: "restore" }),
              )
            }
          >
            Use other edit
          </button>
          <button
            className={btn("small")}
            onClick={() =>
              void run(c.id, () =>
                send("resolveConflict", { id: c.id, action: "dismiss" }),
              )
            }
          >
            Dismiss
          </button>
        </div>
      ))}

      {status.vaultBytes > warnVaultBytes && !hidden.has("size") && (
        <div className={callout("warn")}>
          <I n="triangle-exclamation" />
          <span className="min-w-0 flex-1">
            The vault is {megabytes(status.vaultBytes)}. Reading and saving may
            be slow.{" "}
            {status.vaultBytes > stopCoversVaultBytes
              ? "New cover pictures are paused."
              : `Cover pictures stop at ${megabytes(stopCoversVaultBytes)}.`}
          </span>
          <button className={btn("small")} onClick={() => hide("size")}>
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className={callout("error")} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
