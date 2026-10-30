import { useEffect, useState, type FormEvent } from "react";
import type { BackupInfo } from "../helper-client";
import type { SnapshotReply, Status } from "../messages";
import {
  coverWidths,
  idleChoices,
  lockModes,
  type Layout,
  type LockMode,
  type Settings,
} from "../settings";
import { send } from "./api";
import { FetchMissingDialog } from "./FetchMissing";
import { KeyFileField, VaultLocation } from "./Gates";
import { I } from "./Icon";
import { MoveVaultDialog } from "./MoveVault";
import { errorText } from "./parts";
import { btn, callout, field, hint, input, panel } from "./cls";
import { themeNames } from "../themes";
import { ThemeToggle } from "./ThemeToggle";

function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
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
      className={input}
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

export function SettingsPanel({
  status,
  snapshot,
  onChanged,
}: {
  status: Status;
  /** The bookmarks, for the tools that work on them. */
  snapshot?: SnapshotReply;
  onChanged: () => void;
}) {
  const { settings } = status;
  const [fetching, setFetching] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string>();

  async function change(patch: Partial<Settings>) {
    try {
      await send("setSettings", patch);
      setError(undefined);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="flex max-w-190 flex-col gap-4.5">
      <h1 className="text-[22px] leading-tight font-bold">Settings</h1>
      {error && <div className={callout("error")}>{error}</div>}

      <section className={`${panel} flex flex-col gap-3`}>
        <div>
          <h2 className="text-base font-semibold">Locking</h2>
          <p className={hint}>
            When BookPass asks for your master password again. Choose what suits
            you: a long time means fewer prompts, a short time means more
            privacy.
          </p>
        </div>
        {lockModes.map((mode) => {
          const selected = settings.lockMode === mode.value;
          return (
            <label
              key={mode.value}
              className={`flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3 ${selected ? "border-accent bg-accent-soft" : "border-line hover:bg-raised"}`}
            >
              <input
                className="mt-1"
                type="radio"
                name="lock-mode"
                checked={selected}
                onChange={() =>
                  void change({ lockMode: mode.value as LockMode })
                }
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{mode.label}</div>
                <div className={hint}>{mode.help}</div>
                {selected && mode.value === "idle" && (
                  <div className="mt-2 flex items-center gap-2">
                    <span>Lock after</span>
                    <MinutesSelect
                      value={settings.idleMinutes}
                      onChange={(m) => void change({ idleMinutes: m })}
                    />
                    <span>without use</span>
                  </div>
                )}
                {selected && mode.value === "system-idle" && (
                  <div className="mt-2 flex items-center gap-2">
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
        <div>
          <button
            className={btn()}
            onClick={() => void send("lock", undefined)}
          >
            <I n="lock" /> Lock now
          </button>
        </div>
      </section>

      <section className={`${panel} flex flex-col gap-3`}>
        <div>
          <h2 className="text-base font-semibold">Vault file</h2>
          <p className={hint}>
            All your bookmarks live in this one encrypted KeePass file. Changing
            it locks the vault.
          </p>
        </div>
        <VaultLocation
          status={status}
          onChanged={onChanged}
          showLabel={false}
          onMove={() => setMoving(true)}
        />
        {moving && (
          <MoveVaultDialog
            status={status}
            onChanged={onChanged}
            onClose={() => setMoving(false)}
          />
        )}
        <label className={`${field} max-w-75`}>
          <span>Backups to keep</span>
          <select
            className={input}
            value={status.backupCount}
            onChange={(e) =>
              void send("setBackupCount", {
                count: Number(e.target.value),
              }).then(onChanged)
            }
          >
            {[0, 1, 3, 5, 10, 20]
              .concat(status.backupCount)
              .filter((v, i, a) => a.indexOf(v) === i)
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "None" : n}
                </option>
              ))}
          </select>
          <span className={`${hint} font-normal!`}>
            Before every save the helper copies the old file into a backups
            folder next to the vault. Each backup is a full copy.
          </span>
        </label>
      </section>

      <section className={`${panel} flex flex-col gap-3`}>
        <h2 className="text-base font-semibold">Appearance</h2>
        <div className={field}>
          <span>Theme</span>
          <ThemeToggle
            mode={settings.theme}
            onChange={(theme) => void change({ theme })}
            showLabels
          />
        </div>
        <div className="flex items-center gap-2">
          <label className={`${field} min-w-0 flex-1`}>
            <span>Light theme</span>
            <select
              className={input}
              value={settings.lightTheme}
              onChange={(e) => void change({ lightTheme: e.target.value })}
            >
              {themeNames.light.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className={`${field} min-w-0 flex-1`}>
            <span>Dark theme</span>
            <select
              className={input}
              value={settings.darkTheme}
              onChange={(e) => void change({ darkTheme: e.target.value })}
            >
              {themeNames.dark.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label className={`${field} min-w-0 flex-1`}>
            <span>Default layout</span>
            <select
              className={input}
              value={settings.defaultLayout}
              onChange={(e) =>
                void change({ defaultLayout: e.target.value as Layout })
              }
            >
              <option value="list">List</option>
              <option value="grid">Grid</option>
              <option value="headlines">Headlines</option>
              <option value="masonry">Masonry</option>
            </select>
          </label>
        </div>
      </section>

      <section className={`${panel} flex flex-col gap-3`}>
        <div>
          <h2 className="text-base font-semibold">Pictures</h2>
          <p className={hint}>
            The site icon and cover picture shown for each bookmark. Both are
            stored inside the vault. BookPass never asks a service about your
            bookmarks: pictures come from the page you are on, from the
            bookmarked site itself, or from files you choose.
          </p>
        </div>
        <label className="flex items-start gap-3">
          <input
            className="mt-1"
            type="checkbox"
            checked={settings.captureCovers}
            onChange={(e) => void change({ captureCovers: e.target.checked })}
          />
          <div>
            <div className="font-semibold">
              Save a cover picture and site icon when I save a page
            </div>
            <div className={hint}>
              BookPass looks at that one page for its icon and preview image, or
              takes a small screenshot of the tab. The screenshot never leaves
              this computer. Nothing is fetched in the background.
            </div>
          </div>
        </label>
        <label className="flex items-start gap-3">
          <input
            className="mt-1"
            type="checkbox"
            checked={settings.coversFromOtherServers}
            onChange={(e) =>
              void change({ coversFromOtherServers: e.target.checked })
            }
          />
          <div>
            <div className="font-semibold">
              Also read preview images that sit on another server
            </div>
            <div className={hint}>
              Many sites keep their preview image on a separate image server.
              Reading it makes a request there that the page you are on did not
              make, so it is off by default and BookPass uses a screenshot
              instead. This applies to saving a page and to fetching pictures
              below.
            </div>
          </div>
        </label>
        <label className={`${field} max-w-75`}>
          <span>Cover picture width</span>
          <select
            className={input}
            value={settings.coverWidth}
            onChange={(e) =>
              void change({ coverWidth: Number(e.target.value) })
            }
          >
            {coverWidths.map((w) => (
              <option key={w} value={w}>
                {w} pixels{w === 256 ? " (recommended)" : ""}
              </option>
            ))}
          </select>
          <span className={`${hint} font-normal!`}>
            Wider covers look sharper and make the vault bigger. Each one is
            squeezed to at most 20 KB.
          </span>
        </label>
        <div className={field}>
          <span>Bookmarks without pictures</span>
          <div className="flex items-center gap-2">
            <button
              className={btn()}
              disabled={!snapshot}
              onClick={() => setFetching(true)}
            >
              <I n="globe" /> Fetch missing pictures…
            </button>
          </div>
          <span className={`${hint} font-normal!`}>
            For bookmarks that were typed in, imported or saved from a link. You
            can also fetch, choose or remove the pictures of a single bookmark
            when you edit it.
          </span>
        </div>
        {fetching && snapshot && (
          <FetchMissingDialog
            bookmarks={snapshot.bookmarks}
            scope="all your bookmarks"
            settings={settings}
            vaultBytes={status.vaultBytes}
            onClose={() => setFetching(false)}
          />
        )}
      </section>

      <PasswordPanel />
      <BackupsPanel />

      <section className={`${panel} flex flex-col gap-3`}>
        <h2 className="text-base font-semibold">About</h2>
        <p>
          BookPass keeps bookmarks in an encrypted KeePass file on your own
          disk. It sends nothing anywhere. It only contacts a bookmarked site
          when you ask it to fetch that site’s pictures.
        </p>
        <p className={hint}>
          Icons by{" "}
          <a
            href="https://fontawesome.com"
            target="_blank"
            rel="noreferrer noopener"
          >
            Font Awesome
          </a>
          , licensed{" "}
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

function PasswordPanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);

  async function change(e: FormEvent) {
    e.preventDefault();
    if (next !== again)
      return setMessage({
        ok: false,
        text: "The two new passwords do not match.",
      });
    setBusy(true);
    try {
      await send("changePassword", { current, next });
      setCurrent("");
      setNext("");
      setAgain("");
      setMessage({
        ok: true,
        text: "Master password changed. Other computers that use this vault will ask for the new one the next time they open it.",
      });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`${panel} flex flex-col gap-3`} onSubmit={change}>
      <div>
        <h2 className="text-base font-semibold">Master password</h2>
        <p className={hint}>
          Changing it re-encrypts the vault. If you use a key file, it stays the
          same.
        </p>
      </div>
      <label className={`${field} max-w-90`}>
        <span>Current password</span>
        <input
          className={input}
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </label>
      <label className={`${field} max-w-90`}>
        <span>New password</span>
        <input
          className={input}
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </label>
      <label className={`${field} max-w-90`}>
        <span>Repeat the new password</span>
        <input
          className={input}
          type="password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          required
        />
      </label>
      {message && (
        <div
          className={`callout ${message.ok ? "" : "error"}`}
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </div>
      )}
      <div>
        <button className={btn()} disabled={busy}>
          {busy ? <I n="spinner" spin /> : <I n="key" />} Change password
        </button>
      </div>
    </form>
  );
}

function BackupsPanel() {
  const [backups, setBackups] = useState<BackupInfo[]>();
  const [asking, setAsking] = useState<string>();
  const [password, setPassword] = useState("");
  const [keyFile, setKeyFile] = useState<{ name: string; base64: string }>();
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();

  useEffect(() => {
    let live = true;
    send("listBackups", undefined).then(
      (list) => live && setBackups(list),
      (e) => live && setMessage({ ok: false, text: errorText(e) }),
    );
    return () => {
      live = false;
    };
  }, []);

  async function restore(name: string, withPassword: boolean) {
    if (
      !confirm(
        "Replace the vault with this backup? The vault as it is now is kept as a backup too.",
      )
    )
      return;
    try {
      await send("restoreBackup", {
        name,
        password: withPassword ? password : undefined,
        keyFile: withPassword ? keyFile?.base64 : undefined,
      });
      setAsking(undefined);
      setMessage({ ok: true, text: "Backup restored." });
    } catch (e) {
      // A backup made with another password needs that password.
      if ((e as { code?: string }).code === "wrong-password") setAsking(name);
      setMessage({ ok: false, text: errorText(e) });
    }
  }

  return (
    <section className={`${panel} flex flex-col gap-3`}>
      <div>
        <h2 className="text-base font-semibold">Backups</h2>
        <p className={hint}>
          The helper keeps these next to the vault file. Restoring one replaces
          what you have now.
        </p>
      </div>
      {!backups && !message && (
        <span className="text-muted">
          <I n="spinner" spin /> Looking…
        </span>
      )}
      {backups?.length === 0 && (
        <p className="text-muted">
          No backups yet. The first appears after the second save.
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {backups?.map((b) => (
          <li key={b.name}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                {new Date(b.modified).toLocaleString()}{" "}
                <span className={hint}>
                  {Math.max(1, Math.round(b.size / 1024))} KB
                </span>
              </span>
              <button
                className={btn("small")}
                onClick={() => void restore(b.name, false)}
              >
                Restore
              </button>
            </div>
            {asking === b.name && (
              <form
                className="mt-2 flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void restore(b.name, true);
                }}
              >
                <label className={`${field} max-w-90`}>
                  <span>Password this backup was saved with</span>
                  <input
                    className={input}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                  />
                </label>
                <KeyFileField value={keyFile} onChange={setKeyFile} />
                <div>
                  <button className={btn("primary small")}>
                    Restore with these
                  </button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
      {message && (
        <div
          className={`callout ${message.ok ? "" : "error"}`}
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </div>
      )}
    </section>
  );
}
