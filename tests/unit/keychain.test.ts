// How the vault service uses the system keychain for the unlock key. The browser and the helper are stand-ins.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  const area = () => {
    const data = new Map<string, unknown>();
    return {
      data,
      get: async (key: string) =>
        data.has(key) ? { [key]: data.get(key) } : {},
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) data.set(k, v);
      },
      remove: async (key: string) => void data.delete(key),
    };
  };
  return { local: area(), session: area() };
});

vi.mock("wxt/browser", () => ({
  browser: { storage: { local: store.local, session: store.session } },
}));

vi.mock("../../src/helper-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/helper-client")>()),
  setKey: vi.fn(async () => {}),
  getKey: vi.fn(async () => ""),
  clearKey: vi.fn(async () => {}),
  hello: vi.fn(async () => {}),
  getConfig: vi.fn(async () => ({
    vaultPath: "/v.kdbx",
    defaultPath: "/v.kdbx",
    backupCount: 5,
  })),
  vaultInfo: vi.fn(async () => ({ exists: false, size: 0 })),
}));

import * as helper from "../../src/helper-client";
import { AppError } from "../../src/messages";
import { Vault } from "../../src/vault";

const sessionKey = () => store.session.data.get("unlockKey");

async function newVault(settings: object = {}) {
  store.local.data.set("settings", settings);
  const vault = new Vault();
  await vault.loadSettings();
  return vault;
}

beforeEach(() => {
  store.local.data.clear();
  store.session.data.clear();
  vi.clearAllMocks();
});

describe("the unlock key and the system keychain", () => {
  it("never calls the helper while the setting is off", async () => {
    const vault = await newVault();
    store.session.data.set("unlockKey", "k");
    await vault.setSettings({ theme: "dark" });
    await vault.restoreFromKeychain();
    await vault.lock();
    expect(helper.setKey).not.toHaveBeenCalled();
    expect(helper.getKey).not.toHaveBeenCalled();
    expect(helper.clearKey).not.toHaveBeenCalled();
  });

  it("copies the key to the keychain when the setting is turned on while unlocked", async () => {
    const vault = await newVault({ lockMode: "idle" });
    store.session.data.set("unlockKey", "the-key");
    await vault.setSettings({ useKeychain: true });
    expect(helper.setKey).toHaveBeenCalledWith("the-key");
  });

  it("removes the key from the keychain when the setting is turned off", async () => {
    const vault = await newVault({ lockMode: "idle", useKeychain: true });
    await vault.setSettings({ useKeychain: false });
    expect(helper.clearKey).toHaveBeenCalled();
    expect(helper.setKey).not.toHaveBeenCalled();
  });

  it("keeps the last activity time on disk only while the keychain holds the key", async () => {
    const vault = await newVault({ lockMode: "idle", useKeychain: true });
    store.local.data.set("lastActivity", 123);
    await vault.setSettings({ idleMinutes: 5 });
    expect(store.local.data.get("lastActivity")).toBe(123);
    await vault.setSettings({ useKeychain: false });
    expect(store.local.data.has("lastActivity")).toBe(false);
  });

  it("keeps the key out of the keychain in the modes that must lock with the browser", async () => {
    for (const lockMode of ["browser-close", "every-time"] as const) {
      const vault = await newVault({ lockMode, useKeychain: true });
      store.session.data.set("unlockKey", "the-key");
      await vault.setSettings({ idleMinutes: 5 });
      expect(helper.setKey).not.toHaveBeenCalled();
    }
  });

  it("brings the key back after a browser restart", async () => {
    vi.mocked(helper.getKey).mockResolvedValue("from-keychain");
    const vault = await newVault({ lockMode: "idle", useKeychain: true });
    await vault.restoreFromKeychain();
    expect(sessionKey()).toBe("from-keychain");
  });

  it("does not ask the keychain when the key is still in memory", async () => {
    const vault = await newVault({
      lockMode: "system-idle",
      useKeychain: true,
    });
    store.session.data.set("unlockKey", "in-memory");
    await vault.restoreFromKeychain();
    expect(helper.getKey).not.toHaveBeenCalled();
    expect(sessionKey()).toBe("in-memory");
  });

  it("stays locked after a restart in a mode that locks when the browser closes, and empties the keychain", async () => {
    vi.mocked(helper.getKey).mockResolvedValue("from-keychain");
    const vault = await newVault({
      lockMode: "browser-close",
      useKeychain: true,
    });
    await vault.restoreFromKeychain();
    expect(sessionKey()).toBeUndefined();
    expect(helper.clearKey).toHaveBeenCalled();
  });

  it("empties the keychain when the vault locks", async () => {
    const vault = await newVault({ lockMode: "idle", useKeychain: true });
    store.session.data.set("unlockKey", "k");
    await vault.lock();
    expect(sessionKey()).toBeUndefined();
    expect(helper.clearKey).toHaveBeenCalled();
  });

  it("says why when the computer has no keychain, and clears the message when turned off", async () => {
    vi.mocked(helper.setKey).mockRejectedValue(
      new AppError("no keychain", "unavailable"),
    );
    const vault = await newVault({ lockMode: "idle" });
    store.session.data.set("unlockKey", "k");
    await vault.setSettings({ useKeychain: true });
    expect((await vault.status()).keychainProblem).toMatch(
      /no system keychain/,
    );
    await vault.setSettings({ useKeychain: false });
    expect((await vault.status()).keychainProblem).toBeUndefined();
  });
});
