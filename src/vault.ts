// The vault service. It lives in the background, owns the open vault and the unlock key,
// and is the only code that reads or writes the vault file (through the helper).
import { browser } from 'wxt/browser';
import * as model from './bookmark-model';
import { fromBase64 } from './base64';
import * as helper from './helper-client';
import {
  credentialsFromKey,
  credentialsFromPassword,
  keyOf,
  mergeRemote,
  newDatabase,
  openDatabase,
  saveDatabase,
  type Kdbx,
} from './kdbx';
import { clearKey, loadKey, saveKey, setDiskCopy } from './key-store';
import {
  AppError,
  type CaptureData,
  type SaveState,
  type SnapshotReply,
  type Status,
} from './messages';
import { keepsKeyOnDisk } from './lock';
import { defaultSettings, normalizeSettings, type Settings } from './settings';

/** Saves are batched: edits within this time of each other become one write of the file. */
const SAVE_DELAY_MS = 1500;
const MAX_MERGE_ATTEMPTS = 3;

type Listener = (event: 'changed' | 'status') => void;

export class Vault {
  private db?: Kdbx;
  private creds?: ReturnType<typeof credentialsFromKey>;
  /** Hash of the file as we last read or wrote it. Empty when the file does not exist. */
  private fileHash = '';
  private rev = 0;
  /** Counts edits, so a save can tell whether more arrived while it ran. */
  private edits = 0;
  private saveState: SaveState = 'saved';
  private saveError?: string;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private saving: Promise<void> = Promise.resolve();
  private opening?: Promise<Kdbx>;
  private listeners: Listener[] = [];
  settings: Settings = defaultSettings;

  onEvent(listener: Listener) {
    this.listeners.push(listener);
  }

  private emit(event: 'changed' | 'status') {
    for (const listener of this.listeners) listener(event);
  }

  // Settings

  async loadSettings(): Promise<Settings> {
    const stored = (await browser.storage.local.get('settings')).settings as
      Partial<Settings> | undefined;
    this.settings = normalizeSettings(stored);
    return this.settings;
  }

  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    await browser.storage.local.set({ settings: this.settings });
    // Moving into or out of "never lock" adds or removes the on disk copy of the key.
    const key = await loadKey();
    if (key) await setDiskCopy(keepsKeyOnDisk(this.settings) ? key : undefined);
    else if (!keepsKeyOnDisk(this.settings)) await setDiskCopy(undefined);
    this.emit('status');
    return this.settings;
  }

  // Status

  async status(): Promise<Status> {
    const base = {
      saveState: this.saveState,
      saveError: this.saveError,
      settings: this.settings,
      backupCount: 5,
      vaultPath: '',
      defaultPath: '',
      vaultExists: false,
      locked: true,
    };
    try {
      await helper.hello();
      const config = await helper.getConfig();
      const key = await loadKey();
      return {
        ...base,
        helper: 'ok',
        vaultPath: config.vaultPath,
        defaultPath: config.defaultPath,
        backupCount: config.backupCount,
        vaultExists: this.db ? true : await helper.vaultExists(),
        locked: !key,
      };
    } catch (e) {
      if (e instanceof helper.HelperOutdatedError)
        return { ...base, helper: 'outdated', helperMessage: e.message };
      if (e instanceof AppError && e.code === 'helper')
        return { ...base, helper: 'missing', helperMessage: e.message };
      throw e;
    }
  }

  async setVaultPath(vaultPath: string): Promise<Status> {
    await this.lock();
    await helper.setConfig({ vaultPath });
    return this.status();
  }

  async setBackupCount(count: number): Promise<Status> {
    await helper.setConfig({ backupCount: count });
    return this.status();
  }

  // Create, unlock, lock

  async createVault(password: string): Promise<Status> {
    if (password.length < 1) throw new AppError('Choose a master password.');
    if (await helper.vaultExists())
      throw new AppError('A vault file already exists at that path.', 'vault-exists');
    const creds = await credentialsFromPassword(password);
    const db = newDatabase(creds);
    this.fileHash = '';
    this.adopt(db, creds);
    await this.saveNow(); // the first write creates the file; a conflict here means someone else made it meanwhile
    await saveKey(keyOf(creds), keepsKeyOnDisk(this.settings));
    this.emit('status');
    return this.status();
  }

  async unlock(password: string): Promise<Status> {
    const file = await helper.readVault();
    if (!file) throw new AppError('There is no vault file at that path yet.', 'no-vault');
    const creds = await credentialsFromPassword(password);
    const { db, upgraded } = await this.open(file.bytes, creds);
    this.fileHash = file.sha256;
    this.adopt(db, creds);
    await saveKey(keyOf(creds), keepsKeyOnDisk(this.settings));
    if (upgraded) this.markDirty();
    this.emit('status');
    return this.status();
  }

  private async open(bytes: Uint8Array<ArrayBuffer>, creds: ReturnType<typeof credentialsFromKey>) {
    try {
      return await openDatabase(bytes, creds);
    } catch (e) {
      if ((e as { code?: string }).code === 'InvalidKey')
        throw new AppError('Wrong master password.', 'wrong-password');
      throw e;
    }
  }

  private adopt(db: Kdbx, creds: ReturnType<typeof credentialsFromKey>) {
    this.db = db;
    this.creds = creds;
    this.rev++;
    this.emit('changed');
  }

  /** Writes any pending changes, then forgets the vault and the key. */
  async lock(): Promise<Status> {
    if (this.db && this.saveState !== 'saved') {
      try {
        await this.saveNow();
      } catch {
        // The error is already recorded. Locking must still work, so the key is dropped anyway.
      }
    }
    clearTimeout(this.saveTimer);
    this.db = this.creds = undefined;
    this.opening = undefined;
    this.saveState = 'saved';
    this.saveError = undefined;
    await clearKey();
    this.rev++;
    this.emit('status');
    this.emit('changed');
    return this.status();
  }

  /** The open vault. After the background restarts it is reopened from the file with the stored key. */
  private async ensureOpen(): Promise<Kdbx> {
    if (this.db) return this.db;
    this.opening ??= (async () => {
      const key = await loadKey();
      if (!key) throw new AppError('The vault is locked.', 'locked');
      const file = await helper.readVault();
      if (!file) throw new AppError('The vault file is missing.', 'no-vault');
      const creds = credentialsFromKey(key);
      const { db } = await this.open(file.bytes, creds);
      this.fileHash = file.sha256;
      this.db = db;
      this.creds = creds;
      return db;
    })().finally(() => (this.opening = undefined));
    return this.opening;
  }

  // Reading and editing

  async snapshot(): Promise<SnapshotReply> {
    return { rev: this.rev, ...model.readSnapshot(await this.ensureOpen()) };
  }

  async image(kind: 'cover' | 'icon', id: string) {
    const db = await this.ensureOpen();
    return kind === 'cover' ? model.getCover(db, id) : model.getIcon(db, id);
  }

  /** Runs an edit, then schedules a save. */
  async edit<T>(change: (db: Kdbx) => T | Promise<T>): Promise<T> {
    const db = await this.ensureOpen();
    const result = await change(db);
    this.markDirty();
    return result;
  }

  static capture(data: CaptureData | undefined): model.Capture {
    return {
      cover: data?.cover ? fromBase64(data.cover) : undefined,
      favicon: data?.favicon
        ? { site: data.favicon.site, png: fromBase64(data.favicon.png) }
        : undefined,
    };
  }

  private markDirty() {
    this.rev++;
    this.edits++;
    this.saveState = 'dirty';
    this.saveError = undefined;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow().catch(() => {}), SAVE_DELAY_MS);
    this.emit('changed');
    this.emit('status');
  }

  // Saving

  /** Writes the vault now. Saves never overlap, and one that arrives meanwhile waits its turn. */
  saveNow(): Promise<void> {
    clearTimeout(this.saveTimer);
    this.saving = this.saving.catch(() => {}).then(() => this.write());
    return this.saving;
  }

  private async write() {
    const db = this.db;
    if (!db) return;
    const editsAtStart = this.edits;
    this.saveState = 'saving';
    this.emit('status');
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          const bytes = (await saveDatabase(db)) as Uint8Array<ArrayBuffer>;
          this.fileHash = await helper.writeVault(bytes, this.fileHash);
          break;
        } catch (e) {
          if (!(e instanceof AppError) || e.code !== 'conflict' || attempt >= MAX_MERGE_ATTEMPTS)
            throw e;
          await this.mergeFromDisk(db);
        }
      }
      // Edits made while the write ran leave the vault dirty again.
      this.saveState = this.edits === editsAtStart ? 'saved' : 'dirty';
      this.saveError = undefined;
    } catch (e) {
      this.saveState = 'error';
      this.saveError = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.emit('status');
    }
  }

  /** The file changed outside BookPass: merge its contents into what is open, then try again. */
  private async mergeFromDisk(db: Kdbx) {
    const file = await helper.readVault();
    if (!file) {
      this.fileHash = '';
      return;
    }
    const { db: remote } = await this.open(file.bytes, this.creds!);
    mergeRemote(db, remote);
    this.fileHash = file.sha256;
    this.rev++;
    this.emit('changed');
  }
}
