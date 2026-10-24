import { describe, expect, it } from "vitest";
import {
  idleDetectionSeconds,
  keepsKeyOnDisk,
  shouldLock,
  type LockState,
} from "../../src/lock";
import {
  defaultSettings,
  normalizeSettings,
  type Settings,
} from "../../src/settings";

const minute = 60_000;
const state = (over: Partial<LockState> = {}): LockState => ({
  now: 1_000_000,
  lastActivity: 1_000_000,
  systemState: "active",
  openPages: 1,
  ...over,
});
const settings = (over: Partial<Settings>): Settings => ({
  ...defaultSettings,
  ...over,
});

describe("shouldLock", () => {
  it("never locks by timer when set to browser close", () => {
    const s = settings({ lockMode: "browser-close" });
    expect(
      shouldLock(s, state({ now: 1_000_000 + 99 * 60 * minute, openPages: 0 })),
    ).toBe(false);
  });

  it("locks after the idle time and not before", () => {
    const s = settings({ lockMode: "idle", idleMinutes: 15 });
    expect(shouldLock(s, state({ now: 1_000_000 + 14 * minute }))).toBe(false);
    expect(shouldLock(s, state({ now: 1_000_000 + 15 * minute }))).toBe(true);
  });

  it("locks when the computer goes idle or locked, in system idle mode only", () => {
    const s = settings({ lockMode: "system-idle" });
    expect(shouldLock(s, state({ systemState: "idle" }))).toBe(true);
    expect(shouldLock(s, state({ systemState: "locked" }))).toBe(true);
    expect(shouldLock(s, state({ systemState: "active" }))).toBe(false);
    expect(
      shouldLock(
        settings({ lockMode: "idle" }),
        state({ systemState: "locked" }),
      ),
    ).toBe(false);
  });

  it("locks once every page is closed in every-time mode", () => {
    const s = settings({ lockMode: "every-time" });
    expect(shouldLock(s, state({ openPages: 1 }))).toBe(false);
    expect(shouldLock(s, state({ openPages: 0 }))).toBe(true);
  });

  it("never locks by itself when set to never", () => {
    expect(
      shouldLock(
        settings({ lockMode: "never" }),
        state({ systemState: "locked", openPages: 0 }),
      ),
    ).toBe(false);
  });
});

describe("keepsKeyOnDisk", () => {
  it("is true only for never", () => {
    expect(keepsKeyOnDisk(settings({ lockMode: "never" }))).toBe(true);
    for (const lockMode of [
      "browser-close",
      "idle",
      "system-idle",
      "every-time",
    ] as const) {
      expect(keepsKeyOnDisk(settings({ lockMode }))).toBe(false);
    }
  });
});

describe("settings", () => {
  it("detects idleness no sooner than the browser allows", () => {
    expect(idleDetectionSeconds(settings({ systemIdleMinutes: 10 }))).toBe(600);
  });

  it("repairs bad stored values", () => {
    const s = normalizeSettings({
      lockMode: "bogus" as never,
      idleMinutes: -5,
      systemIdleMinutes: NaN,
    });
    expect(s.lockMode).toBe("browser-close");
    expect(s.idleMinutes).toBe(defaultSettings.idleMinutes);
    expect(s.systemIdleMinutes).toBe(defaultSettings.systemIdleMinutes);
  });
});
