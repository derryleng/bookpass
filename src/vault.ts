// The vault service. It lives in the background, owns the open vault and the unlock key,
// and is the only code that reads or writes the vault file (through the helper).
import { browser } from "wxt/browser";
import { fromBase64, toBase64 } from "./base64";
import * as model from "./bookmark-model";
import * as helper from "./helper-client";
import { restoreVersion } from "./history";
import { clearKey, loadKey, removeDiskCopy, saveKey } from "./key-store";
import {
  changePassword,
  createKeyFile,
  credentialsFromKey,
  credentialsFromPassword,
  findEditConflicts,
  keyOf,
  mergeRemote,
  newDatabase,
  openDatabase,
  saveDatabase,
  type Kdbx,
} from "./kdbx";
import {
  AppError,
  type CaptureData,
  type FolderPatchMessage,
  type SaveState,
  type Secret,
  type SnapshotReply,
  type Status,
  type VaultPathCheck,
  type VersionConflict,
} from "./messages";
import { defaultSettings, normalizeSettings, type Settings } from "./settings";
import { readTagColors } from "./tags";

/** Saves are batched: edits within this time of each other become one write of the file. */
const SAVE_DELAY_MS = 1500;
const MAX_MERGE_ATTEMPTS = 3;

type Listener = (event: "changed" | "status") => void;
type Creds = ReturnType<typeof credentialsFromKey>;

export class Vault {
  private db?: Kdbx;
  private creds?: Creds;
  /** Hash of the file as we last read or wrote it. Empty when the file does not exist. */
  private fileHash = "";
  /** When BookPass and the file last agreed (ms since 1970). Edits after this are unsaved or unseen. */
  private lastSync = 0;
  private rev = 0;
  /** Counts edits, so a save can tell whether more arrived while it ran. */
  private edits = 0;
  private saveState: SaveState = "saved";
  private saveError?: string;
  private saveTimer?: ReturnType<typeof setTimeout>;
  /** Everything that reads or writes the file runs one at a time. */
  private queue: Promise<unknown> = Promise.resolve();
  private opening?: Promise<Kdbx>;
  private lockReason?: string;
  private versionConflicts: VersionConflict[] = [];
  private listeners: Listener[] = [];
  settings: Settings = defaultSettings;

  onEvent(listener: Listener) {
    this.listeners.push(listener);
  }

  private emit(event: "changed" | "status") {
    for (const listener of this.listeners) listener(event);
  }

  private exclusive<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.catch(() => {}).then(job);
    this.queue = run;
    return run;
  }

  // Settings

  async loadSettings(): Promise<Settings> {
    const stored = (await browser.storage.local.get("settings")).settings as
      Partial<Settings> | undefined;
    this.settings = normalizeSettings(stored);
    await removeDiskCopy();
    return this.settings;
  }

  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    await browser.storage.local.set({ settings: this.settings });
    this.emit("status");
    return this.settings;
  }

  // Status

  async status(): Promise<Status> {
    const base: Status = {
      helper: "ok",
      saveState: this.saveState,
      saveError: this.saveError,
      settings: this.settings,
      backupCount: 5,
      vaultPath: "",
      defaultPath: "",
      vaultExists: false,
      vaultBytes: 0,
      locked: true,
      lockReason: this.lockReason,
      conflictCopies: [],
      versionConflicts: this.versionConflicts,
    };
    try {
      await helper.hello();
      const [config, info, key] = await Promise.all([
        helper.getConfig(),
        helper.vaultInfo(),
        loadKey(),
      ]);
      return {
        ...base,
        vaultPath: config.vaultPath,
        defaultPath: config.defaultPath,
        backupCount: config.backupCount,
        vaultExists: info.exists,
        vaultBytes: info.size,
        locked: !key,
        conflictCopies:
          key && info.exists ? await helper.findConflictCopies() : [],
      };
    } catch (e) {
      if (e instanceof helper.HelperOutdatedError) {
        return { ...base, helper: "outdated", helperMessage: e.message };
      }
      if (e instanceof AppError && e.code === "helper") {
        return { ...base, helper: "missing", helperMessage: e.message };
      }
      throw e;
    }
  }

  /** Size of the vault file, 0 if there is none. */
  async sizeBytes(): Promise<number> {
    return (await helper.vaultInfo()).size;
  }

  async setVaultPath(vaultPath: string): Promise<Status> {
    await this.lock();
    await helper.setConfig({ vaultPath });
    return this.status();
  }

  async pickVaultFolder(): Promise<{ path: string; unavailable: boolean }> {
    try {
      return { path: await helper.pickFolder(), unavailable: false };
    } catch (e) {
      if (e instanceof AppError && e.code === "unavailable")
        return { path: "", unavailable: true };
      throw e;
    }
  }

  checkVaultPath(vaultPath: string): Promise<VaultPathCheck> {
    return helper.checkPath(vaultPath);
  }

  /** The vault is the same bytes in a new place, so it can stay unlocked. */
  async moveVault(vaultPath: string): Promise<Status> {
    await helper.moveVault(vaultPath);
    return this.status();
  }

  async setBackupCount(count: number): Promise<Status> {
    await helper.setConfig({ backupCount: count });
    return this.status();
  }

  // Create, unlock, lock

  private credentials(secret: Secret) {
    return credentialsFromPassword(
      secret.password,
      secret.keyFile ? fromBase64(secret.keyFile) : undefined,
    );
  }

  async newKeyFile(): Promise<string> {
    return toBase64(await createKeyFile());
  }

  async createVault(secret: Secret): Promise<Status> {
    if (secret.password.length < 1)
      throw new AppError("Choose a master password.");
    if ((await helper.vaultInfo()).exists) {
      throw new AppError(
        "A vault file already exists at that path.",
        "vault-exists",
      );
    }
    const creds = await this.credentials(secret);
    const db = newDatabase(creds);
    this.fileHash = "";
    this.adopt(db, creds);
    await this.saveNow(); // the first write creates the file; a conflict here means someone else made it meanwhile
    await saveKey(keyOf(creds));
    this.emit("status");
    return this.status();
  }

  async unlock(secret: Secret): Promise<Status> {
    const file = await helper.readVault();
    if (!file)
      throw new AppError(
        "There is no vault file at that path yet.",
        "no-vault",
      );
    const creds = await this.credentials(secret);
    const { db, upgraded } = await this.open(file.bytes, creds);
    this.fileHash = file.sha256;
    this.lockReason = undefined;
    this.adopt(db, creds);
    await saveKey(keyOf(creds));
    if (upgraded) this.markDirty();
    this.emit("status");
    return this.status();
  }

  private async open(bytes: Uint8Array<ArrayBuffer>, creds: Creds) {
    try {
      return await openDatabase(bytes, creds);
    } catch (e) {
      if ((e as { code?: string }).code === "InvalidKey") {
        throw new AppError(
          "Wrong master password, or the wrong key file.",
          "wrong-password",
        );
      }
      throw e;
    }
  }

  private adopt(db: Kdbx, creds: Creds) {
    this.db = db;
    this.creds = creds;
    this.lastSync = Date.now();
    this.versionConflicts = [];
    this.rev++;
    this.emit("changed");
  }

  /** Writes any pending changes, then forgets the vault and the key. */
  async lock(): Promise<Status> {
    let lost: string | undefined;
    if (this.db && this.saveState !== "saved") {
      try {
        await this.saveNow();
      } catch (e) {
        // Locking must still work, so the key is dropped anyway, but the unlock screen says what was lost.
        lost = `Changes could not be saved and were lost: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    await this.forget(lost);
    return this.status();
  }

  /** Locks without saving, for when the file can no longer be written with the key we hold. */
  private async forget(reason?: string) {
    clearTimeout(this.saveTimer);
    this.db = this.creds = undefined;
    this.opening = undefined;
    this.saveState = "saved";
    this.saveError = undefined;
    this.versionConflicts = [];
    this.lockReason = reason;
    await clearKey();
    this.rev++;
    this.emit("status");
    this.emit("changed");
  }

  /** The open vault. After the background restarts it is reopened from the file with the stored key. */
  private async ensureOpen(): Promise<Kdbx> {
    if (this.db) return this.db;
    this.opening ??= (async () => {
      const key = await loadKey();
      if (!key) throw new AppError("The vault is locked.", "locked");
      const file = await helper.readVault();
      if (!file) throw new AppError("The vault file is missing.", "no-vault");
      const creds = credentialsFromKey(key);
      const { db } = await this.open(file.bytes, creds);
      this.fileHash = file.sha256;
      this.lastSync = Date.now();
      this.db = db;
      this.creds = creds;
      return db;
    })().finally(() => (this.opening = undefined));
    return this.opening;
  }

  // Reading and editing

  async snapshot(): Promise<SnapshotReply> {
    const db = await this.ensureOpen();
    return {
      rev: this.rev,
      ...model.readSnapshot(db),
      tagColors: readTagColors(db),
    };
  }

  async image(kind: "cover" | "icon", id: string) {
    const db = await this.ensureOpen();
    return kind === "cover" ? model.getCover(db, id) : model.getIcon(db, id);
  }

  /** Runs an edit, then schedules a save. */
  async edit<T>(change: (db: Kdbx) => T | Promise<T>): Promise<T> {
    const db = await this.ensureOpen();
    const result = await change(db);
    this.markDirty();
    return result;
  }

  /** Reads without changing anything. */
  async read<T>(look: (db: Kdbx) => T): Promise<T> {
    return look(await this.ensureOpen());
  }

  static capture(data: CaptureData | undefined): model.Capture {
    return {
      cover: data?.cover ? fromBase64(data.cover) : undefined,
      favicon: data?.favicon
        ? {
            site: data.favicon.site,
            png: fromBase64(data.favicon.png),
            replace: data.favicon.replace,
          }
        : undefined,
      clear: data?.clear,
    };
  }

  static folderPatch(
    patch: FolderPatchMessage | undefined,
  ): model.FolderPatch | undefined {
    if (!patch) return undefined;
    const { iconImage, ...rest } = patch;
    return iconImage
      ? {
          ...rest,
          iconImage: { name: iconImage.name, png: fromBase64(iconImage.png) },
        }
      : rest;
  }

  private markDirty() {
    this.rev++;
    this.edits++;
    this.saveState = "dirty";
    this.saveError = undefined;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(
      () => void this.saveNow().catch(() => {}),
      SAVE_DELAY_MS,
    );
    this.emit("changed");
    this.emit("status");
  }

  // Saving

  /** Writes the vault now. Saves never overlap, and one that arrives meanwhile waits its turn. */
  saveNow(): Promise<void> {
    clearTimeout(this.saveTimer);
    return this.exclusive(() => this.write());
  }

  private async write() {
    const db = this.db;
    if (!db) return;
    const editsAtStart = this.edits;
    this.saveState = "saving";
    this.emit("status");
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          const bytes = (await saveDatabase(db)) as Uint8Array<ArrayBuffer>;
          this.fileHash = await helper.writeVault(bytes, this.fileHash);
          this.lastSync = Date.now();
          break;
        } catch (e) {
          if (
            !(e instanceof AppError) ||
            e.code !== "conflict" ||
            attempt >= MAX_MERGE_ATTEMPTS
          ) {
            throw e;
          }
          await this.mergeFromDisk(db);
        }
      }
      // Edits made while the write ran leave the vault dirty again.
      this.saveState = this.edits === editsAtStart ? "saved" : "dirty";
      this.saveError = undefined;
    } catch (e) {
      this.saveState = "error";
      this.saveError = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.emit("status");
    }
  }

  // Changes made outside BookPass

  /**
   * Looks at the file for changes made by another computer, a sync tool or KeePassXC.
   * Unsaved edits are merged with them. With none, the new file simply replaces what is open.
   */
  checkForChanges(): Promise<void> {
    return this.exclusive(async () => {
      if (!this.db || this.saveState === "saving") return;
      // Pages also learn about new conflict copies from the status, so tell them to look again.
      this.emit("status");
      const now = await helper.statVault();
      if (!now.exists || now.sha256 === this.fileHash) return;
      try {
        if (this.saveState === "saved") {
          const editsBefore = this.edits;
          const file = await helper.readVault();
          if (!file) return;
          const { db } = await this.open(file.bytes, this.creds!);
          if (!this.db) return; // locked while the file was loading
          this.fileHash = file.sha256;
          if (this.edits !== editsBefore) {
            // Edited while the file loaded, so keep those edits and merge the new file into them.
            this.mergeIn(this.db, db);
            return;
          }
          this.db = db;
          this.lastSync = Date.now();
          this.rev++;
          this.emit("changed");
        } else {
          await this.mergeFromDisk(this.db);
        }
      } catch (e) {
        if (e instanceof AppError && e.code === "wrong-password") {
          await this.forget(
            "The master password was changed on another computer. Enter the new one.",
          );
          return;
        }
        throw e;
      }
    });
  }

  /** Merges the file on disk into the open vault. */
  private async mergeFromDisk(db: Kdbx) {
    const file = await helper.readVault();
    if (!file) {
      this.fileHash = "";
      return;
    }
    const { db: remote } = await this.open(file.bytes, this.creds!);
    this.mergeIn(db, remote);
    this.fileHash = file.sha256;
  }

  /** Merges another copy in and notes the bookmarks that were edited on both sides. */
  private mergeIn(db: Kdbx, remote: Kdbx) {
    const conflicts = findEditConflicts(db, remote, this.lastSync);
    mergeRemote(db, remote);
    for (const c of conflicts) {
      const kept =
        c.remoteTime > c.localTime ? "the other copy" : "this computer";
      this.versionConflicts = [
        ...this.versionConflicts.filter((v) => v.id !== c.id),
        {
          id: c.id,
          title: c.title,
          kept,
          lostTime: kept === "this computer" ? c.remoteTime : c.localTime,
        },
      ];
    }
    this.lastSync = Date.now();
    this.rev++;
    this.emit("changed");
    this.emit("status");
  }

  /** Merges a copy a sync tool left next to the vault, then moves it out of the way. */
  mergeConflictCopy(name: string): Promise<void> {
    return this.exclusive(async () => {
      const db = await this.ensureOpen();
      const file = await helper.readVault({ source: "conflict", name });
      if (!file) throw new AppError("That copy has gone.");
      let remote: Kdbx;
      try {
        remote = (await this.open(file.bytes, this.creds!)).db;
      } catch (e) {
        if (e instanceof AppError && e.code === "wrong-password") {
          throw new AppError(
            "That copy uses a different master password. Open it in KeePassXC to merge it by hand.",
          );
        }
        throw e;
      }
      this.mergeIn(db, remote);
      this.edits++;
      await this.write();
      await helper.archiveConflictCopy(name);
      this.emit("status");
    });
  }

  resolveConflict(id: string, action: "restore" | "dismiss"): Promise<void> {
    const conflict = this.versionConflicts.find((c) => c.id === id);
    this.versionConflicts = this.versionConflicts.filter((c) => c.id !== id);
    this.emit("status");
    if (action === "restore" && conflict) {
      return this.edit((db) => restoreVersion(db, id, conflict.lostTime));
    }
    return Promise.resolve();
  }

  // Backups and the master password

  listBackups() {
    return helper.listBackups();
  }

  /** Replaces the open vault with one of the helper's backups. The vault as it is now becomes a backup in turn. */
  restoreBackup(name: string, secret?: Secret): Promise<void> {
    return this.exclusive(async () => {
      await this.ensureOpen();
      const file = await helper.readVault({ source: "backup", name });
      if (!file) throw new AppError("That backup has gone.");
      const creds = secret ? await this.credentials(secret) : this.creds!;
      let restored: Kdbx;
      try {
        restored = (await this.open(file.bytes, creds)).db;
      } catch (e) {
        if (e instanceof AppError && e.code === "wrong-password") {
          throw new AppError(
            "That backup uses a different master password or key file. Enter the ones it was saved with.",
            "wrong-password",
          );
        }
        throw e;
      }
      this.db = restored;
      this.creds = creds;
      await saveKey(keyOf(creds));
      this.edits++;
      this.versionConflicts = [];
      this.rev++;
      await this.write();
      this.emit("changed");
    });
  }

  changePassword(current: string, next: string): Promise<void> {
    return this.exclusive(async () => {
      const db = await this.ensureOpen();
      if (next.length < 1) throw new AppError("Choose a new master password.");
      const check = await credentialsFromPassword(current);
      const same = (a: Creds) => toBase64(a.passwordHash!.getBinary());
      if (same(check) !== same(this.creds!)) {
        throw new AppError("The current password is wrong.", "wrong-password");
      }
      this.creds = await changePassword(db, next);
      await saveKey(keyOf(this.creds));
      this.edits++;
      await this.write();
    });
  }
}
