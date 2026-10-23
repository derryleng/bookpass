import { useState } from 'react';
import type { Status } from '../messages';
import {
  idleChoices,
  lockModes,
  type Layout,
  type LockMode,
  type Settings,
  type Theme,
} from '../settings';
import { send } from './api';
import { VaultLocation } from './Gates';
import { I } from './Icon';
import { errorText } from './parts';

function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function MinutesSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const choices = idleChoices.includes(value)
    ? idleChoices
    : [...idleChoices, value].sort((a, b) => a - b);
  return (
    <select
      className="select"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Minutes"
    >
      {choices.map((m) => (
        <option key={m} value={m}>
          {minutesLabel(m)}
        </option>
      ))}
    </select>
  );
}

export function SettingsPanel({ status, onChanged }: { status: Status; onChanged: () => void }) {
  const { settings } = status;
  const [error, setError] = useState<string>();

  async function change(patch: Partial<Settings>) {
    try {
      await send('setSettings', patch);
      setError(undefined);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="settings">
      <h1>Settings</h1>
      {error && (
        <div className="callout error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <section className="panel stack">
        <div>
          <h2>Locking</h2>
          <p className="hint" style={{ margin: 0 }}>
            When BookPass asks for your master password again. Choose what suits you: a long time
            means fewer prompts, a short time means more privacy.
          </p>
        </div>
        {lockModes.map((mode) => {
          const selected = settings.lockMode === mode.value;
          return (
            <label key={mode.value} className={`radio-card ${selected ? 'selected' : ''}`}>
              <input
                type="radio"
                name="lock-mode"
                checked={selected}
                onChange={() => void change({ lockMode: mode.value as LockMode })}
              />
              <div className="grow">
                <div className="title">{mode.label}</div>
                <div className="hint">{mode.help}</div>
                {selected && mode.value === 'idle' && (
                  <div className="inline">
                    <span>Lock after</span>
                    <MinutesSelect
                      value={settings.idleMinutes}
                      onChange={(m) => void change({ idleMinutes: m })}
                    />
                    <span>without use</span>
                  </div>
                )}
                {selected && mode.value === 'system-idle' && (
                  <div className="inline">
                    <span>Lock after</span>
                    <MinutesSelect
                      value={settings.systemIdleMinutes}
                      onChange={(m) => void change({ systemIdleMinutes: m })}
                    />
                    <span>of computer idle time</span>
                  </div>
                )}
              </div>
            </label>
          );
        })}
        {settings.lockMode === 'never' && (
          <div className="callout warn">
            <I n="triangle-exclamation" />
            <span>
              The unlock key is stored in your browser profile on this computer. Anyone who can read
              that profile, or malware running as you, can open your bookmarks without the password.
              Pick another option if that worries you.
            </span>
          </div>
        )}
        <div>
          <button className="btn" onClick={() => void send('lock', undefined)}>
            <I n="lock" /> Lock now
          </button>
        </div>
      </section>

      <section className="panel stack">
        <div>
          <h2>Vault file</h2>
          <p className="hint" style={{ margin: 0 }}>
            All your bookmarks live in this one encrypted KeePass file. Changing it locks the vault.
          </p>
        </div>
        <VaultLocation status={status} onChanged={onChanged} showLabel={false} />
        <label className="field" style={{ maxWidth: 300 }}>
          <span>Backups to keep</span>
          <select
            className="select"
            value={status.backupCount}
            onChange={(e) =>
              void send('setBackupCount', { count: Number(e.target.value) }).then(onChanged)
            }
          >
            {[0, 1, 3, 5, 10, 20]
              .concat(status.backupCount)
              .filter((v, i, a) => a.indexOf(v) === i)
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'None' : n}
                </option>
              ))}
          </select>
          <span className="hint" style={{ fontWeight: 400 }}>
            Before every save the helper copies the old file into a backups folder next to the
            vault. Each backup is a full copy.
          </span>
        </label>
      </section>

      <section className="panel stack">
        <h2>Appearance</h2>
        <div className="row">
          <label className="field grow">
            <span>Theme</span>
            <select
              className="select"
              value={settings.theme}
              onChange={(e) => void change({ theme: e.target.value as Theme })}
            >
              <option value="auto">Match the system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="field grow">
            <span>Default layout</span>
            <select
              className="select"
              value={settings.defaultLayout}
              onChange={(e) => void change({ defaultLayout: e.target.value as Layout })}
            >
              <option value="list">List</option>
              <option value="grid">Grid</option>
              <option value="headlines">Headlines</option>
              <option value="masonry">Masonry</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel stack">
        <h2>Saving pages</h2>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.captureCovers}
            onChange={(e) => void change({ captureCovers: e.target.checked })}
          />
          <div>
            <div className="title" style={{ fontWeight: 600 }}>
              Save a cover picture and site icon
            </div>
            <div className="hint">
              When you save a page, BookPass looks at that one page for its icon and preview image,
              or takes a small screenshot of the tab. Both are stored inside the vault. Nothing is
              fetched in the background.
            </div>
          </div>
        </label>
      </section>

      <section className="panel stack">
        <h2>About</h2>
        <p style={{ margin: 0 }}>
          BookPass keeps bookmarks in an encrypted KeePass file on your own disk. It makes no
          network requests and sends nothing anywhere.
        </p>
        <p className="hint" style={{ margin: 0 }}>
          Icons by{' '}
          <a href="https://fontawesome.com" target="_blank" rel="noreferrer noopener">
            Font Awesome
          </a>
          , licensed{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer noopener"
          >
            CC BY 4.0
          </a>
          .
        </p>
      </section>
    </div>
  );
}
