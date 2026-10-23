// The screens shown before the bookmarks: helper missing, create a vault, unlock.
import { useState, type FormEvent } from 'react';
import type { Status } from '../messages';
import { send } from './api';
import { I } from './Icon';

function Logo() {
  return (
    <span className="logo">
      <I n="bookmark" />
    </span>
  );
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Shows the vault file location with a way to change it. */
export function VaultLocation({
  status,
  onChanged,
  showLabel = true,
}: {
  status: Status;
  onChanged: (s: Status) => void;
  showLabel?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [path, setPath] = useState(status.vaultPath);
  const [error, setError] = useState<string>();

  async function apply(e: FormEvent) {
    e.preventDefault();
    try {
      onChanged(await send('setVaultPath', { vaultPath: path }));
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
        <button
          type="button"
          className="btn small"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setEditing(true)}
        >
          Use a different file
        </button>
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
      <p className="hint" style={{ margin: 0 }}>
        Point this at an existing vault to open it, or at a new name to create one. A folder synced
        by Syncthing, OneDrive or Dropbox works for using the vault on several computers.
      </p>
      {error && <div className="callout error">{error}</div>}
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

export function HelperMissing({ status, onRetry }: { status: Status; onRetry: () => void }) {
  return (
    <div className="gate">
      <div className="gate-card stack">
        <Logo />
        <h1>
          {status.helper === 'outdated'
            ? 'Update the BookPass helper'
            : 'Install the BookPass helper'}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          BookPass keeps your bookmarks in an encrypted file on your computer. Browsers cannot write
          to a file themselves, so a small helper program does it. The helper only ever sees
          encrypted data and makes no network connections.
        </p>
        {status.helperMessage && <div className="callout warn">{status.helperMessage}</div>}
        <button className="btn primary" onClick={onRetry}>
          <I n="rotate-left" /> Check again
        </button>
      </div>
    </div>
  );
}

export function Setup({ status, onStatus }: { status: Status; onStatus: (s: Status) => void }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (password !== again) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      onStatus(await send('createVault', { password }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <form className="gate-card stack" onSubmit={create}>
        <Logo />
        <div>
          <h1>Create your vault</h1>
          <p className="muted" style={{ margin: 0 }}>
            Your bookmarks are stored in one encrypted file that KeePassXC and KeePass can open too.
          </p>
        </div>
        <VaultLocation status={status} onChanged={onStatus} />
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
        <div className="callout warn">
          <I n="triangle-exclamation" />
          <span>
            If you forget this password your bookmarks cannot be recovered. Nobody can reset it, not
            even us. The helper keeps your last {status.backupCount} versions next to the vault file
            as a safety net.
          </span>
        </div>
        {error && <div className="callout error">{error}</div>}
        <button className="btn primary" disabled={busy}>
          {busy ? <I n="spinner" spin /> : <I n="lock" />} Create vault
        </button>
      </form>
    </div>
  );
}

export function Unlock({ status, onStatus }: { status: Status; onStatus: (s: Status) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      onStatus(await send('unlock', { password }));
    } catch (err) {
      setError(errorText(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <form className="gate-card stack" onSubmit={unlock}>
        <Logo />
        <div>
          <h1>Unlock BookPass</h1>
          <p className="muted" style={{ margin: 0 }}>
            Enter your master password to open your bookmarks.
          </p>
        </div>
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
        {error && <div className="callout error">{error}</div>}
        <button className="btn primary" disabled={busy}>
          {busy ? <I n="spinner" spin /> : <I n="lock-open" />} {busy ? 'Opening…' : 'Unlock'}
        </button>
        <VaultLocation status={status} onChanged={onStatus} />
      </form>
    </div>
  );
}
