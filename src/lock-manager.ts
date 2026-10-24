// Watches for the moments the vault should lock: a timer, the computer going idle, and pages closing.
// The rules themselves are in lock.ts.
import { browser } from "wxt/browser";
import { idleDetectionSeconds, shouldLock, type LockState } from "./lock";
import { loadKey } from "./key-store";
import type { Vault } from "./vault";

const ALARM = "bookpass-lock-check";
const ACTIVITY_KEY = "lastActivity";
/** How long after the last page closes before "every time" mode locks, so popup to manager hand-offs survive. */
const CLOSE_GRACE_MS = 2000;

type Port = ReturnType<typeof browser.runtime.connect>;

export function startLockManager(vault: Vault) {
  let lastActivity = Date.now();
  let persistedAt = 0;
  let systemState: LockState["systemState"] = "active";
  const pages = new Set<Port>();

  async function check() {
    if (!(await loadKey())) return; // already locked
    const state: LockState = {
      now: Date.now(),
      lastActivity,
      systemState,
      openPages: pages.size,
    };
    if (shouldLock(vault.settings, state)) await vault.lock();
  }

  function applyIdleSettings() {
    browser.idle.setDetectionInterval(idleDetectionSeconds(vault.settings));
  }

  // A restarted background picks up where the last one left off.
  void browser.storage.session.get(ACTIVITY_KEY).then((stored) => {
    const saved = stored[ACTIVITY_KEY] as number | undefined;
    if (saved && saved < lastActivity) lastActivity = saved;
    void check();
  });

  void browser.alarms.create(ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void check();
  });

  browser.idle.onStateChanged.addListener((state) => {
    systemState = state;
    void check();
  });

  vault.onEvent((event) => {
    if (event === "status") applyIdleSettings();
  });

  return {
    /** Call when the user does something in BookPass. */
    touch() {
      lastActivity = Date.now();
      if (lastActivity - persistedAt > 10_000) {
        persistedAt = lastActivity;
        void browser.storage.session.set({ [ACTIVITY_KEY]: lastActivity });
      }
    },
    /** Registers an open page. The port closing tells us the page went away. */
    addPage(port: Port) {
      pages.add(port);
      port.onDisconnect.addListener(() => {
        pages.delete(port);
        setTimeout(() => void check(), CLOSE_GRACE_MS);
      });
    },
    applyIdleSettings,
    check,
  };
}
