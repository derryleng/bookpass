// The screens shown before the bookmarks: helper missing, create a vault, unlock.
import { useState, type FormEvent } from "react";
import { toBase64 } from "../base64";
import { helperDownloadUrl } from "../constants";
import type { Status } from "../messages";
import { send } from "./api";
import { I } from "./Icon";
import { errorText } from "./parts";

function Logo() {
  return (
    <span className="logo">
      <I n="bookmark" />
    </span>
  );
}

/** Shows the vault file location with a way to change it. */
export function VaultLocation({
  status,
  onChanged,
  showLabel = true,
  onMove,
}: {
  status: Status;
  onChanged: (s: Status) => void;
  showLabel?: boolean;
  /** Offers to move the vault file, once there is one. */
  onMove?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [path, setPath] = useState(status.vaultPath);
  const [error, setError] = useState<string>();

  async function apply(e: FormEvent) {
    e.preventDefault();
    try {
      onChanged(await send("setVaultPath", { vaultPath: path }));
      setEditing(false);
      setError(undefined);
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!editing) {
    return (
      <div className="stack" style={{ gap: 4 }}>
        {showLabel && <span className="label">Vault file</span>}
        <span className="path">{status.vaultPath}</span>
        <div className="row">
          {onMove && (
            <button type="button" className="btn small" onClick={onMove}>
              <I n="folder-open" /> Move vault…
            </button>
          )}
          <button
            type="button"
            className="btn small"
            onClick={() => setEditing(true)}
          >
            Use a different file
          </button>
        </div>
      </div>
    );
  }
  return (
    <form className="stack" style={{ gap: 8 }} onSubmit={apply}>
      <label className="field">
        <span>Vault file (full path, ending in .kdbx)</span>
        <input
          className="input path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          autoFocus
        />
      </label>
      {error && (
        <div className="callout error" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button className="btn primary small">Use this file</button>
        <button
          type="button"
          className="btn small"
          onClick={() => (setEditing(false), setPath(status.vaultPath))}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Picks a key file from disk and hands it over as base64. Offered as an optional second factor. */
export function KeyFileField({
  value,
  onChange,
  allowCreate,
}: {
  value: { name: string; base64: string } | undefined;
  onChange: (file: { name: string; base64: string } | undefined) => void;
  allowCreate?: boolean;
}) {
  const [error, setError] = useState<string>();

  async function pick(file: File | undefined) {
    if (!file) return;
    onChange({
      name: file.name,
      base64: toBase64(new Uint8Array(await file.arrayBuffer())),
    });
  }

  async function create() {
    try {
      const base64 = await send("newKeyFile", undefined);
      const blob = new Blob([atob(base64)], { type: "application/xml" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "bookpass.keyx";
      link.click();
      URL.revokeObjectURL(link.href);
      onChange({
        name: "bookpass.keyx (just saved to your downloads)",
        base64,
      });
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      {value ? (
        <div className="row">
          <I n="key" />
          <span className="grow path">{value.name}</span>
          <button
            type="button"
            className="btn small"
            onClick={() => onChange(undefined)}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="row">
          <label className="btn small">
            <I n="key" /> Choose key file
            <input
              type="file"
              hidden
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
          {allowCreate && (
            <button
              type="button"
              className="btn small"
              onClick={() => void create()}
            >
              Make a new key file
            </button>
          )}
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

export function HelperMissing({
  status,
  onRetry,
}: {
  status: Status;
  onRetry: () => void;
}) {
  const system = /Mac/i.test(navigator.userAgent)
    ? "macOS"
    : /Linux|X11/i.test(navigator.userAgent)
      ? "Linux"
      : "Windows";
  return (
    <main className="gate">
      <div className="gate-card stack">
        <Logo />
        <h1>
          {status.helper === "outdated"
            ? "Update the BookPass helper"
            : "Install the BookPass helper"}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          BookPass keeps your bookmarks in an encrypted file on your computer.
          Browsers cannot write to a file themselves, so a small helper program
          does it. The helper only ever sees encrypted data and makes no network
          connections.
        </p>
        <ol className="steps">
          <li>
            <a
              href={helperDownloadUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Download the helper for {system}
            </a>
            .
          </li>
          <li>
            Run it once: double click it on Windows, or run{" "}
            <span className="path">./bookpass-helper</span> in a terminal on
            macOS and Linux. It installs itself for your user only.
          </li>
          <li>Come back here and press the button below.</li>
        </ol>
        {status.helperMessage && (
          <div className="callout warn" role="alert">
            {status.helperMessage}
          </div>
        )}
        <button className="btn primary" onClick={onRetry}>
          <I n="rotate-left" /> Check again
        </button>
      </div>
    </main>
  );
}

/** The create and unlock screens in one card, switched by tabs. */
export function Gate({
  status,
  onStatus,
}: {
  status: Status;
  onStatus: (s: Status) => void;
}) {
  const [creating, setCreating] = useState(!status.vaultExists);
  const [path, setPath] = useState(status.vaultPath);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [keyFile, setKeyFile] = useState<{ name: string; base64: string }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (creating && password !== again)
      return setError("The two passwords do not match.");
    setBusy(true);
    setError(undefined);
    try {
      if (path !== status.vaultPath)
        onStatus(await send("setVaultPath", { vaultPath: path }));
      onStatus(
        await send(creating ? "createVault" : "unlock", {
          password,
          keyFile: keyFile?.base64,
        }),
      );
    } catch (err) {
      setError(errorText(err));
      setPassword("");
      setAgain("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <form className="gate-card stack" onSubmit={submit}>
        <div className="row">
          <Logo />
          <h1 style={{ margin: 0 }}>
            {creating ? "Create your vault" : "Unlock BookPass"}
          </h1>
        </div>
        <div className="segmented" role="group" aria-label="Vault">
          {[
            { creating: true, label: "Create new" },
            { creating: false, label: "Use existing vault" },
          ].map((tab) => (
            <button
              type="button"
              key={tab.label}
              className={`btn ${creating === tab.creating ? "active" : ""}`}
              aria-pressed={creating === tab.creating}
              onClick={() => (setCreating(tab.creating), setError(undefined))}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Vault file (full path, ending in .kdbx)</span>
          <input
            className="input path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Master password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        {creating && (
          <label className="field">
            <span>Repeat the password</span>
            <input
              className="input"
              type="password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              required
            />
          </label>
        )}
        <div className="field">
          <span>Key file (optional)</span>
          <KeyFileField
            value={keyFile}
            onChange={setKeyFile}
            allowCreate={creating}
          />
        </div>
        {!creating && status.lockReason && !error && (
          <div className="callout warn" role="status">
            <I n="triangle-exclamation" />
            <span>{status.lockReason}</span>
          </div>
        )}
        {error && (
          <div className="callout error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? (
            <I n="spinner" spin />
          ) : (
            <I n={creating ? "lock" : "lock-open"} />
          )}{" "}
          {creating ? "Create vault" : busy ? "Opening…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
