// The only file that talks to kdbxweb. Everything else works on the vault through the
// bookmark model, so the KDBX details (and kdbxweb's gaps) stay in one place.
import * as kdbxweb from 'kdbxweb';
import { argon2d, argon2i, argon2id } from 'hash-wasm';

export type Kdbx = kdbxweb.Kdbx;
export type KdbxGroup = kdbxweb.KdbxGroup;
export type KdbxEntry = kdbxweb.KdbxEntry;

const MiB = 1024 * 1024;

export interface KdfParams {
  memoryMiB: number;
  iterations: number;
  parallelism: number;
}

/** About 0.6 s on a laptop. KeePass says "as strong as you can bear", so this can grow later. */
export const defaultKdf: KdfParams = { memoryMiB: 256, iterations: 3, parallelism: 2 };

// kdbxweb ships no Argon2 code. hash-wasm is a small WebAssembly build that needs 'wasm-unsafe-eval' in the CSP.
const argon2Types: Record<number, typeof argon2d> = { 0: argon2d, 1: argon2i, 2: argon2id };
kdbxweb.CryptoEngine.setArgon2Impl(
  async (password, salt, memory, iterations, length, parallelism, type) => {
    const hash = argon2Types[type];
    if (!hash) throw new Error(`Unsupported Argon2 type ${type}`);
    const out = await hash({
      password: new Uint8Array(password),
      salt: new Uint8Array(salt),
      memorySize: memory, // KiB, as kdbxweb passes it
      iterations,
      parallelism,
      hashLength: length,
      outputType: 'binary',
    });
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  },
);

export async function credentialsFromPassword(password: string): Promise<kdbxweb.KdbxCredentials> {
  const creds = new kdbxweb.KdbxCredentials(kdbxweb.ProtectedValue.fromString(password));
  await creds.ready;
  return creds;
}

/** The unlock key: the password's hash, which opens the vault but is not the password itself. */
export function keyOf(creds: kdbxweb.KdbxCredentials): string {
  return kdbxweb.ByteUtils.bytesToBase64(creds.passwordHash!.getBinary());
}

export function credentialsFromKey(key: string): kdbxweb.KdbxCredentials {
  const creds = new kdbxweb.KdbxCredentials(null);
  creds.passwordHash = kdbxweb.ProtectedValue.fromBinary(
    kdbxweb.ByteUtils.base64ToBytes(key).slice().buffer,
  );
  return creds;
}

function applyKdf(db: Kdbx, kdf: KdfParams) {
  db.setKdf(kdbxweb.Consts.KdfId.Argon2id);
  const p = db.header.kdfParameters!;
  const { ValueType } = kdbxweb.VarDictionary;
  p.set('M', ValueType.UInt64, kdbxweb.Int64.from(kdf.memoryMiB * MiB));
  p.set('I', ValueType.UInt64, kdbxweb.Int64.from(kdf.iterations));
  p.set('P', ValueType.UInt32, kdf.parallelism);
}

/** kdbxweb's upgrade() stops at KDBX 4.0. BookPass wants 4.1 for group custom data and tags. */
function makeKdbx41(db: Kdbx) {
  db.upgrade();
  db.header.versionMinor = 1;
}

export function newDatabase(creds: kdbxweb.KdbxCredentials, kdf: KdfParams = defaultKdf): Kdbx {
  const db = kdbxweb.Kdbx.create(creds, 'BookPass');
  applyKdf(db, kdf);
  makeKdbx41(db);
  db.createRecycleBin();
  return db;
}

export interface Opened {
  db: Kdbx;
  /** True if the file was an older format that has been upgraded in memory and needs saving. */
  upgraded: boolean;
}

export async function openDatabase(
  bytes: Uint8Array,
  creds: kdbxweb.KdbxCredentials,
  kdf: KdfParams = defaultKdf,
): Promise<Opened> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const db = await kdbxweb.Kdbx.load(buffer, creds);
  const upgraded = db.versionMajor < 4 || db.versionMinor < 1;
  if (upgraded) {
    makeKdbx41(db);
    if (db.versionMajor < 4 || !isArgon2(db)) applyKdf(db, kdf);
  }
  db.createRecycleBin();
  return { db, upgraded };
}

function isArgon2(db: Kdbx): boolean {
  const uuid = db.header.kdfParameters?.get('$UUID');
  if (!(uuid instanceof ArrayBuffer)) return false;
  const id = kdbxweb.ByteUtils.bytesToBase64(uuid);
  return id === kdbxweb.Consts.KdfId.Argon2d || id === kdbxweb.Consts.KdfId.Argon2id;
}

export async function saveDatabase(db: Kdbx): Promise<Uint8Array> {
  return new Uint8Array(await db.save());
}

/**
 * Merges a copy of the vault read from disk into the open one.
 * kdbxweb's merge drops custom data (and group tags) when it copies an item from the other side,
 * and BookPass keeps folder views and icons there, so those are copied back afterwards.
 */
export function mergeRemote(local: Kdbx, remote: Kdbx): void {
  local.merge(remote);
  for (const remoteGroup of remote.getDefaultGroup().allGroups()) {
    const group = local.getGroup(remoteGroup.uuid);
    if (group && remoteGroup.lastModTime >= group.lastModTime) {
      group.customData = cloneCustomData(remoteGroup.customData);
      group.tags = [...remoteGroup.tags];
    }
  }
  const entries = new Map([...local.getDefaultGroup().allEntries()].map((e) => [e.uuid.id, e]));
  for (const remoteEntry of remote.getDefaultGroup().allEntries()) {
    const entry = entries.get(remoteEntry.uuid.id);
    if (entry && remoteEntry.lastModTime >= entry.lastModTime) {
      entry.customData = cloneCustomData(remoteEntry.customData);
    }
  }
}

function cloneCustomData(data: KdbxGroup['customData']): KdbxGroup['customData'] {
  return data && new Map([...data].map(([key, item]) => [key, { ...item }]));
}

export const { KdbxUuid, ProtectedValue } = kdbxweb;
