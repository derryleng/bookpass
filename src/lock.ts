// Decides when the vault should lock. Pure functions, so it is easy to test.
import type { Settings } from "./settings";

export interface LockState {
  now: number;
  /** When BookPass was last used (ms since epoch). */
  lastActivity: number;
  /** What the idle API last said about the computer. */
  systemState: "active" | "idle" | "locked";
  /** How many BookPass pages (popup, manager, settings) are open. */
  openPages: number;
}

/** Whether the vault should be locked right now. Called on a timer and whenever the state changes. */
export function shouldLock(settings: Settings, state: LockState): boolean {
  switch (settings.lockMode) {
    case "idle":
      return state.now - state.lastActivity >= settings.idleMinutes * 60_000;
    case "system-idle":
      return state.systemState !== "active";
    case "every-time":
      return state.openPages === 0;
    case "browser-close":
    case "never":
      return false;
  }
}

/** Seconds the idle API should wait before calling the computer idle. */
export function idleDetectionSeconds(settings: Settings): number {
  return Math.max(15, settings.systemIdleMinutes * 60);
}

/** Whether the unlock key may be written to disk. Only for the explicit "never" choice. */
export function keepsKeyOnDisk(settings: Settings): boolean {
  return settings.lockMode === "never";
}
