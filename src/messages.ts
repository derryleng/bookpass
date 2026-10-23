// The messages between the pages (popup, manager, settings) and the background.
// One table describes every request, so both sides stay in step.
import type { BookmarkInput, FolderPatch, Image, Snapshot } from './bookmark-model';
import type { Settings } from './settings';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export interface Status {
  /** ok: reachable. missing: not installed or not allowed. outdated: protocol mismatch. */
  helper: 'ok' | 'missing' | 'outdated';
  helperMessage?: string;
  vaultPath: string;
  defaultPath: string;
  vaultExists: boolean;
  backupCount: number;
  locked: boolean;
  saveState: SaveState;
  saveError?: string;
  settings: Settings;
}

export interface SnapshotReply extends Snapshot {
  /** Goes up on every change, so pages can tell when to refresh. */
  rev: number;
}

/** Images captured from a page, as base64 so they can cross the message boundary. */
export interface CaptureData {
  cover?: string;
  favicon?: { site: string; png: string };
}

export interface Requests {
  status: [void, Status];
  setVaultPath: [{ vaultPath: string }, Status];
  setBackupCount: [{ count: number }, Status];
  createVault: [{ password: string }, Status];
  unlock: [{ password: string }, Status];
  lock: [void, Status];
  saveNow: [void, Status];
  snapshot: [void, SnapshotReply];
  getImage: [{ kind: 'cover' | 'icon'; id: string }, Image | null];
  addBookmark: [{ input: BookmarkInput; capture?: CaptureData }, string];
  updateBookmark: [{ id: string; patch: Partial<BookmarkInput>; capture?: CaptureData }, void];
  moveBookmarks: [{ ids: string[]; folderId: string | null }, void];
  trashBookmarks: [{ ids: string[] }, void];
  restoreBookmarks: [{ ids: string[] }, void];
  deleteForever: [{ ids: string[] }, void];
  emptyTrash: [void, void];
  createFolder: [{ parentId: string | null; name: string; patch?: FolderPatch }, string];
  updateFolder: [{ id: string; patch: FolderPatch }, void];
  moveFolder: [{ id: string; parentId: string | null }, void];
  trashFolder: [{ id: string }, void];
  getSettings: [void, Settings];
  setSettings: [Partial<Settings>, Settings];
}

export type RequestType = keyof Requests;

/** Requests that do not count as using BookPass, so they never postpone an inactivity lock. */
export const passiveRequests: RequestType[] = ['status', 'snapshot', 'getImage', 'getSettings'];

export interface RequestEnvelope<K extends RequestType = RequestType> {
  type: K;
  payload: Requests[K][0];
}

export type ResponseEnvelope<T = unknown> =
  { ok: true; value: T } | { ok: false; error: string; code?: string };

/** Sent from the background to every open page when something changed. */
export type BroadcastEvent = { event: 'changed' } | { event: 'status' };

/** Name of the long lived port each open page holds, so the background knows a page is open. */
export const pagePortName = 'bookpass-page';

/** Raised by the background and shown to the user as is. `code` lets pages react to a specific failure. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code?:
      'locked' | 'wrong-password' | 'no-vault' | 'vault-exists' | 'helper' | 'conflict',
  ) {
    super(message);
  }
}
