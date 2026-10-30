// The messages between the pages (popup, manager, settings) and the background.
// One table describes every request, so both sides stay in step.
import type {
  BookmarkInput,
  FolderPatch,
  Image,
  Snapshot,
} from "./bookmark-model";
import type { ParsedImport } from "./formats";
import type { BackupInfo } from "./helper-client";
import type { Version } from "./history";
import type { ImportResult } from "./importing";
import type { Settings } from "./settings";

export type SaveState = "saved" | "dirty" | "saving" | "error";

/** A bookmark edited on two computers. One edit won; the other is in the bookmark's history. */
export interface VersionConflict {
  id: string;
  title: string;
  /** Which edit BookPass kept. */
  kept: "this computer" | "the other copy";
  /** When the edit that lost was made (ms since 1970). It identifies that version in the history. */
  lostTime: number;
}

export interface Status {
  /** ok: reachable. missing: not installed or not allowed. outdated: protocol mismatch. */
  helper: "ok" | "missing" | "outdated";
  helperMessage?: string;
  vaultPath: string;
  defaultPath: string;
  vaultExists: boolean;
  /** Size of the vault file, so pages can warn when it grows large. */
  vaultBytes: number;
  backupCount: number;
  locked: boolean;
  /** Why the vault locked itself, if something other than the timer did it. */
  lockReason?: string;
  /** Why the unlock key could not be kept in the system keychain, when the setting asks for it. */
  keychainProblem?: string;
  saveState: SaveState;
  saveError?: string;
  /** Copies of the vault that a sync tool left next to it, waiting to be merged. */
  conflictCopies: string[];
  versionConflicts: VersionConflict[];
  settings: Settings;
}

export interface SnapshotReply extends Snapshot {
  /** Goes up on every change, so pages can tell when to refresh. */
  rev: number;
  tagColors: Record<string, string>;
}

/** Images captured from a page, as base64 so they can cross the message boundary. */
export interface CaptureData {
  cover?: string;
  favicon?: { site: string; png: string; replace?: boolean };
  /** Take these pictures away first. */
  clear?: ("cover" | "icon")[];
}

/** The same as FolderPatch, with the folder picture as base64. */
export type FolderPatchMessage = Omit<FolderPatch, "iconImage"> & {
  iconImage?: { name: string; png: string };
};

export interface VaultPathCheck {
  /** The path as the helper understood it, with ~ and slashes sorted out. */
  path: string;
  /** The outermost folder that would be created, empty if none. */
  creates: string;
  /** Why the path cannot be used, empty if it can. */
  problem: string;
}

/** A master password and, optionally, a key file as base64. */
export interface Secret {
  password: string;
  keyFile?: string;
}

export interface Requests {
  status: [void, Status];
  setVaultPath: [{ vaultPath: string }, Status];
  setBackupCount: [{ count: number }, Status];
  /** Shows the system's folder dialog. `path` is empty if it was closed, `unavailable` if there is no dialog. */
  pickVaultFolder: [void, { path: string; unavailable: boolean }];
  /** Whether a vault could be moved to this path, without changing anything. */
  checkVaultPath: [{ vaultPath: string }, VaultPathCheck];
  /** Moves the vault file, and the backups kept beside it, to a new path. */
  moveVault: [{ vaultPath: string }, Status];
  createVault: [Secret, Status];
  unlock: [Secret, Status];
  newKeyFile: [void, string];
  changePassword: [{ current: string; next: string }, void];
  lock: [void, Status];
  saveNow: [void, Status];
  /** Looks at the vault file for changes made outside BookPass and merges them. */
  checkFile: [void, void];
  mergeConflictCopy: [{ name: string }, void];
  resolveConflict: [{ id: string; action: "restore" | "dismiss" }, void];
  listBackups: [void, BackupInfo[]];
  restoreBackup: [{ name: string; password?: string; keyFile?: string }, void];
  snapshot: [void, SnapshotReply];
  getImage: [{ kind: "cover" | "icon"; id: string }, Image | null];
  addBookmark: [{ input: BookmarkInput; capture?: CaptureData }, string];
  updateBookmark: [
    { id: string; patch: Partial<BookmarkInput>; capture?: CaptureData },
    void,
  ];
  moveBookmarks: [{ ids: string[]; folderId: string | null }, void];
  /** Pictures for many bookmarks at once, without counting as edits. */
  setPictures: [{ items: { id: string; capture: CaptureData }[] }, void];
  setOrder: [{ orders: { id: string; order: number }[] }, void];
  trashBookmarks: [{ ids: string[] }, void];
  restoreBookmarks: [{ ids: string[] }, void];
  deleteForever: [{ ids: string[] }, void];
  emptyTrash: [void, void];
  history: [{ id: string }, Version[]];
  restoreVersion: [{ id: string; time: number }, void];
  createFolder: [
    { parentId: string | null; name: string; patch?: FolderPatchMessage },
    string,
  ];
  updateFolder: [{ id: string; patch: FolderPatchMessage }, void];
  moveFolder: [{ id: string; parentId: string | null }, void];
  trashFolder: [{ id: string }, void];
  renameTag: [{ from: string; to: string }, void];
  deleteTag: [{ tag: string }, void];
  setTagColor: [{ tag: string; color: string }, void];
  addTags: [{ ids: string[]; tags: string[] }, void];
  importPreview: [
    { parsed: ParsedImport; skipDuplicates: boolean },
    ImportResult,
  ];
  importBookmarks: [
    {
      parsed: ParsedImport;
      parentId: string | null;
      wrapper?: string;
      skipDuplicates: boolean;
    },
    ImportResult,
  ];
  getSettings: [void, Settings];
  setSettings: [Partial<Settings>, Settings];
}

export type RequestType = keyof Requests;

/** Requests that do not count as using BookPass, so they never postpone an inactivity lock. */
export const passiveRequests: RequestType[] = [
  "status",
  "snapshot",
  "getImage",
  "getSettings",
  "checkFile",
  "listBackups",
];

export interface RequestEnvelope<K extends RequestType = RequestType> {
  type: K;
  payload: Requests[K][0];
}

export type ResponseEnvelope<T = unknown> =
  { ok: true; value: T } | { ok: false; error: string; code?: string };

/** Sent from the background to every open page when something changed. */
export type BroadcastEvent = { event: "changed" } | { event: "status" };

/** Name of the long lived port each open page holds, so the background knows a page is open. */
export const pagePortName = "bookpass-page";

/** Raised by the background and shown to the user as is. `code` lets pages react to a specific failure. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code?:
      | "locked"
      | "wrong-password"
      | "no-vault"
      | "vault-exists"
      | "helper"
      | "conflict"
      | "unavailable",
  ) {
    super(message);
  }
}
