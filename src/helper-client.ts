// Talks to the native helper over browser native messaging. See docs/PROTOCOL.md.
import { browser } from 'wxt/browser';
import { fromBase64, sha256Hex, toBase64 } from './base64';
import { AppError } from './messages';

const HOST = 'com.bookpass.helper';
/** Must match protocolVersion in helper/main.go. */
export const PROTOCOL_VERSION = 1;
/** Base64 of this is about 683 KB, which fits the 1 MiB browsers allow from the helper. */
const CHUNK = 512 * 1024;
const TIMEOUT_MS = 30_000;

export interface HelperConfig {
  vaultPath: string;
  defaultPath: string;
  backupCount: number;
}

interface Reply {
  id: number;
  ok: boolean;
  code?: string;
  error?: string;
  [field: string]: unknown;
}

export class HelperMissingError extends AppError {
  constructor(detail: string) {
    super(`The BookPass helper is not installed or not allowed to run. ${detail}`.trim(), 'helper');
  }
}

export class HelperOutdatedError extends AppError {
  constructor(found: unknown) {
    super(
      `The BookPass helper speaks protocol ${String(found)} but this extension needs ${PROTOCOL_VERSION}. Update the helper.`,
      'helper',
    );
  }
}

type Port = ReturnType<typeof browser.runtime.connectNative>;
let port: Port | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve(r: Reply): void; reject(e: Error): void }>();

/** The browser words these differently, but all mean the helper never started. */
const notInstalled = /not found|forbidden|No such native application|has exited|Failed to start/i;

function connect(): Port {
  const p = browser.runtime.connectNative(HOST);
  p.onMessage.addListener((message) => {
    const reply = message as Reply;
    waiting.get(reply.id)?.resolve(reply);
    waiting.delete(reply.id);
  });
  p.onDisconnect.addListener(() => {
    const detail =
      (p as { error?: { message?: string } }).error?.message ??
      browser.runtime.lastError?.message ??
      '';
    const error = notInstalled.test(detail)
      ? new HelperMissingError(detail)
      : new AppError(`The helper stopped: ${detail || 'no reason given'}`, 'helper');
    for (const w of waiting.values()) w.reject(error);
    waiting.clear();
    if (port === p) port = undefined;
  });
  return p;
}

function call(op: string, fields: Record<string, unknown> = {}): Promise<Reply> {
  const id = nextId++;
  return new Promise<Reply>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new AppError('The helper did not answer in time.', 'helper'));
    }, TIMEOUT_MS);
    waiting.set(id, {
      resolve: (r) => (clearTimeout(timer), resolve(r)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    });
    try {
      port ??= connect();
      port.postMessage({ id, op, ...fields });
    } catch (e) {
      clearTimeout(timer);
      waiting.delete(id);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  }).then((reply) => {
    if (reply.ok) return reply;
    throw new AppError(
      reply.error ?? 'The helper reported an error',
      reply.code === 'conflict' ? 'conflict' : 'helper',
    );
  });
}

/** Checks the helper is there and speaks our protocol. */
export async function hello(): Promise<void> {
  const reply = await call('hello');
  if (reply.protocol !== PROTOCOL_VERSION) throw new HelperOutdatedError(reply.protocol);
}

export async function getConfig(): Promise<HelperConfig> {
  const r = await call('getConfig');
  return {
    vaultPath: r.vaultPath as string,
    defaultPath: r.defaultPath as string,
    backupCount: r.backupCount as number,
  };
}

export async function setConfig(change: {
  vaultPath?: string;
  backupCount?: number;
}): Promise<void> {
  await call('setConfig', change);
}

/** Cheap to ask, as the helper does not hash the file for this. */
export async function vaultInfo(): Promise<{ exists: boolean; size: number }> {
  const r = await call('exists');
  return { exists: r.exists === true, size: (r.size as number | undefined) ?? 0 };
}

export interface VaultFile {
  bytes: Uint8Array<ArrayBuffer>;
  /** Hash of these bytes. Pass it back when saving, so a file changed meanwhile is not overwritten. */
  sha256: string;
}

/** Which file to read: the vault, a copy a sync tool left next to it, or one of the helper's backups. */
export type Source = { source?: 'vault' } | { source: 'conflict' | 'backup'; name: string };

export interface BackupInfo {
  name: string;
  size: number;
  /** ms since 1970 */
  modified: number;
}

export async function statVault(): Promise<{ exists: boolean; sha256: string }> {
  const r = await call('stat');
  return { exists: r.exists === true, sha256: (r.sha256 as string | undefined) ?? '' };
}

export async function findConflictCopies(): Promise<string[]> {
  return ((await call('findConflicts')).names as string[] | undefined) ?? [];
}

export async function archiveConflictCopy(name: string): Promise<void> {
  await call('archiveConflict', { name });
}

export async function listBackups(): Promise<BackupInfo[]> {
  return ((await call('listBackups')).backups as BackupInfo[] | undefined) ?? [];
}

/** Reads a whole file in chunks, or null if it does not exist. The vault is the default. */
export async function readVault(from: Source = {}): Promise<VaultFile | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const stat = await call('stat', from);
    if (!stat.exists) return null;
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let total = 0;
    for (let offset = 0; ; offset += CHUNK) {
      const r = await call('read', { offset, length: CHUNK, ...from });
      const part = fromBase64((r.data as string | undefined) ?? '');
      parts.push(part);
      total += part.length;
      if (r.eof) break;
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
      bytes.set(part, at);
      at += part.length;
    }
    const sha256 = await sha256Hex(bytes);
    if (sha256 === stat.sha256) return { bytes, sha256 };
    // The file changed while we were reading it (a sync tool, for example). Try again.
  }
  throw new AppError('The vault file keeps changing while BookPass reads it.', 'helper');
}

/**
 * Replaces the vault. `expectedSha256` is the hash of the file BookPass last read,
 * or an empty string if it should not exist yet. Throws an AppError with code 'conflict' otherwise.
 */
export async function writeVault(
  bytes: Uint8Array<ArrayBuffer>,
  expectedSha256: string,
): Promise<string> {
  const sha256 = await sha256Hex(bytes);
  await call('writeBegin');
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    await call('writeChunk', { data: toBase64(bytes.subarray(offset, offset + CHUNK)) });
  }
  await call('writeCommit', { size: bytes.length, sha256, expectedSha256 });
  return sha256;
}
