// User settings. They live in browser storage on this device, not in the vault.

import {
  defaultThemeName,
  isThemeMode,
  themeNames,
  type ThemeMode,
} from "./themes";

/**
 * When the vault locks again after being unlocked.
 *  - browser-close: stays unlocked until the browser closes or you lock it. The default.
 *  - idle: locks after N minutes without using BookPass.
 *  - system-idle: locks after N minutes without using the computer, or when the screen locks.
 *  - every-time: locks as soon as the popup or manager is closed.
 */
export type LockMode = "browser-close" | "idle" | "system-idle" | "every-time";

export type Layout = "list" | "grid" | "headlines" | "masonry";

export interface Settings {
  lockMode: LockMode;
  idleMinutes: number;
  systemIdleMinutes: number;
  defaultLayout: Layout;
  /** Light, dark, or "system" to follow the browser. */
  theme: ThemeMode;
  /** The names of the themes used in light and in dark mode. */
  lightTheme: string;
  darkTheme: string;
  captureCovers: boolean;
  /** Also read a page's preview image when it sits on another server than the page. Off keeps requests to the page's own server. */
  coversFromOtherServers: boolean;
  /** Width in pixels of the stored cover picture. */
  coverWidth: number;
  /**
   * Keep the unlock key in the system keychain, so the vault can stay unlocked when the browser restarts. Only
   * applies to the two locking modes that run on a timer (see keepsKeyInKeychain).
   */
  useKeychain: boolean;
}

export const defaultSettings: Settings = {
  lockMode: "browser-close",
  idleMinutes: 15,
  systemIdleMinutes: 10,
  defaultLayout: "list",
  theme: "system",
  lightTheme: defaultThemeName,
  darkTheme: defaultThemeName,
  captureCovers: true,
  coversFromOtherServers: false,
  coverWidth: 256,
  useKeychain: false,
};

/**
 * Whether the unlock key goes into the system keychain. "When the browser closes" and "Every time you close it" mean
 * the vault must be locked after a restart, so for them the key stays in browser memory only.
 */
export function keepsKeyInKeychain(settings: Settings): boolean {
  return (
    settings.useKeychain &&
    (settings.lockMode === "idle" || settings.lockMode === "system-idle")
  );
}

export const coverWidths = [128, 256, 384, 512];

export const lockModes: { value: LockMode; label: string; help: string }[] = [
  {
    value: "browser-close",
    label: "When the browser closes",
    help: "Stays unlocked until the browser closes.",
  },
  {
    value: "idle",
    label: "After a period of inactivity",
    help: "Locks after a set time without use.",
  },
  {
    value: "system-idle",
    label: "When the computer is idle or locked",
    help: "Locks when the computer is idle or the screen locks.",
  },
  {
    value: "every-time",
    label: "Every time you close it",
    help: "Locks when the popup or manager tab closes.",
  },
];

export const idleChoices = [1, 5, 10, 15, 30, 60, 120, 240];

/** Clamps stored values to something sane, so a hand-edited or old value cannot break locking. */
export function normalizeSettings(
  raw: Partial<Settings> | undefined,
): Settings {
  const s = { ...defaultSettings, ...raw };
  if (!lockModes.some((m) => m.value === s.lockMode))
    s.lockMode = defaultSettings.lockMode;
  s.idleMinutes = clampMinutes(s.idleMinutes, defaultSettings.idleMinutes);
  s.systemIdleMinutes = clampMinutes(
    s.systemIdleMinutes,
    defaultSettings.systemIdleMinutes,
  );
  if (!isThemeMode(s.theme)) s.theme = defaultSettings.theme; // also moves the old "auto" to "system"
  if (!themeNames.light.includes(s.lightTheme))
    s.lightTheme = defaultSettings.lightTheme;
  if (!themeNames.dark.includes(s.darkTheme))
    s.darkTheme = defaultSettings.darkTheme;
  if (!coverWidths.includes(s.coverWidth))
    s.coverWidth = defaultSettings.coverWidth;
  s.useKeychain = s.useKeychain === true;
  return s;
}

function clampMinutes(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 24 * 60) : fallback;
}
