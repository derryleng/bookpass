// Moves the vault file, and the backups kept beside it, to another folder. The folder comes from the system's own
// folder dialog when the computer has one, and from a typed path when it does not. The path is checked by the
// helper before anything moves, and a folder that does not exist yet is created.
import { useEffect, useState } from "react";
import type { Status, VaultPathCheck } from "../messages";
import { send } from "./api";
import { Dialog } from "./Dialog";
import { I } from "./Icon";
import { errorText } from "./parts";
import { btn, callout, field, hint, input, path } from "./cls";

const lastSeparator = /[\\/][^\\/]*$/;

/** Splits a path into its folder and file name, whichever kind of slash it uses. */
function split(path: string): {
  folder: string;
  name: string;
  separator: string;
} {
  const at = path.search(lastSeparator);
  const separator = path.includes("\\") ? "\\" : "/";
  return at < 0
    ? { folder: "", name: path, separator }
    : {
        folder: path.slice(0, at) || separator,
        name: path.slice(at + 1),
        separator,
      };
}

export function MoveVaultDialog({
  status,
  onChanged,
  onClose,
}: {
  status: Status;
  onChanged: (status: Status) => void;
  onClose: () => void;
}) {
  const current = split(status.vaultPath);
  const [folder, setFolder] = useState(current.folder);
  const [name, setName] = useState(current.name);
  const [noDialog, setNoDialog] = useState(false);
  // The helper's answer, with the path it was about, so an answer for older typing is never shown.
  const [answer, setAnswer] = useState<{
    target: string;
    result: VaultPathCheck;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const folderText = folder.trim();
  const target = folderText
    ? `${folderText.replace(/[\\/]+$/, "")}${current.separator}${name.trim()}`
    : "";

  // Ask the helper whether the path is usable once typing pauses, so the answer is there before pressing Move.
  useEffect(() => {
    if (!folderText || !name.trim()) return;
    let latest = true;
    const timer = setTimeout(() => {
      send("checkVaultPath", { vaultPath: target })
        .then((result) => latest && setAnswer({ target, result }))
        .catch(
          (e) =>
            latest &&
            setAnswer({
              target,
              result: { path: target, creates: "", problem: errorText(e) },
            }),
        );
    }, 350);
    return () => {
      latest = false;
      clearTimeout(timer);
    };
  }, [target, folderText, name]);

  async function browse() {
    setError(undefined);
    try {
      const picked = await send("pickVaultFolder", undefined);
      if (picked.unavailable) setNoDialog(true);
      else if (picked.path) setFolder(picked.path);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function move() {
    setBusy(true);
    setError(undefined);
    try {
      onChanged(await send("moveVault", { vaultPath: check?.path ?? target }));
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const check = answer?.target === target ? answer.result : undefined;
  const usable = !!check && check.problem === "";
  return (
    <Dialog
      title="Move your vault"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <span className="min-w-0 flex-1" />
          <button
            type="button"
            className={btn()}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={btn("primary")}
            disabled={!usable || busy}
            onClick={() => void move()}
          >
            {busy ? <I n="spinner" spin /> : <I n="folder-open" />} Move vault
          </button>
        </>
      }
    >
      <p className={hint}>
        The vault and its backups are moved to the new folder.
      </p>
      <div className={field}>
        <span>Now</span>
        <span className={path}>{status.vaultPath}</span>
      </div>
      <label className={field}>
        <span>New folder</span>
        <div className="flex items-center gap-2">
          <input
            className={`${input} min-w-0 flex-1 font-mono text-xs`}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            spellCheck={false}
            autoFocus
          />
          {!noDialog && (
            <button
              type="button"
              className={btn()}
              onClick={() => void browse()}
            >
              <I n="folder-open" /> Browse…
            </button>
          )}
        </div>
        {noDialog && (
          <span className={`${hint} font-normal!`}>
            No folder dialog is available. Enter the folder path.
          </span>
        )}
      </label>
      <label className={field}>
        <span>File name</span>
        <input
          className={`${input} font-mono text-xs`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
        />
      </label>
      {check?.problem && (
        <div className={callout("error")} role="alert">
          <I n="circle-exclamation" />
          <span>{check.problem}</span>
        </div>
      )}
      {usable && (
        <div className={callout()} role="status">
          <I n="circle-check" />
          <span>
            {check.creates ? (
              <>
                The folder <span className={path}>{check.creates}</span> will be
                created.
              </>
            ) : (
              "The folder is writable."
            )}{" "}
            If this folder is synced, other computers will pick up the vault
            from it.
          </span>
        </div>
      )}
      {error && (
        <div className={callout("error")} role="alert">
          {error}
        </div>
      )}
    </Dialog>
  );
}
