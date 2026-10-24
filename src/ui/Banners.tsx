// Notices above the bookmark list: things that need a decision or deserve a heads up.
import { useState } from "react";
import { stopCoversVaultBytes, warnVaultBytes } from "../constants";
import type { Status } from "../messages";
import { send } from "./api";
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
    <div
      className="stack"
      style={{ gap: 8, marginBottom: 16 }}
      aria-live="polite"
    >
      {status.conflictCopies
        .filter((name) => !hidden.has(name))
        .map((name) => (
          <div className="callout warn" key={name}>
            <I n="triangle-exclamation" />
            <span className="grow">
              Your sync tool left a separate copy of the vault,{" "}
              <span className="path">{name}</span>, because two computers saved
              at once. Merge it to keep the changes from both.
            </span>
            <button
              className="btn small"
              disabled={working === name}
              onClick={() =>
                void run(name, () => send("mergeConflictCopy", { name }))
              }
            >
              {working === name ? <I n="spinner" spin /> : "Merge it"}
            </button>
            <button className="btn small" onClick={() => hide(name)}>
              Not now
            </button>
          </div>
        ))}

      {status.versionConflicts.map((c) => (
        <div className="callout" key={c.id}>
          <I n="circle-exclamation" />
          <span className="grow">
            <strong>{c.title}</strong> was changed here and on another computer.
            BookPass kept the edit from {c.kept}. The other one is saved in the
            bookmark's history.
          </span>
          <button
            className="btn small"
            onClick={() =>
              void run(c.id, () =>
                send("resolveConflict", { id: c.id, action: "restore" }),
              )
            }
          >
            Use the other edit instead
          </button>
          <button
            className="btn small"
            onClick={() =>
              void run(c.id, () =>
                send("resolveConflict", { id: c.id, action: "dismiss" }),
              )
            }
          >
            Fine as it is
          </button>
        </div>
      ))}

      {status.vaultBytes > warnVaultBytes && !hidden.has("size") && (
        <div className="callout warn">
          <I n="triangle-exclamation" />
          <span className="grow">
            Your vault is {megabytes(status.vaultBytes)}. It is read and saved
            as a whole, so it may feel slow.{" "}
            {status.vaultBytes > stopCoversVaultBytes
              ? "New cover pictures are paused until it is smaller."
              : `Cover pictures stop being saved at ${megabytes(stopCoversVaultBytes)}.`}
          </span>
          <button className="btn small" onClick={() => hide("size")}>
            Got it
          </button>
        </div>
      )}

      {error && (
        <div className="callout error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
