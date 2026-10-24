// User settings. They live in browser storage on this device, not in the vault.

/**
 * When the vault locks again after being unlocked.
 *  - browser-close: stays unlocked until the browser closes or you lock it. The default.
 *  - idle: locks after N minutes without using BookPass.
 *  - system-idle: locks after N minutes without using the computer, or when the screen locks.
 *  - every-time: locks as soon as the popup or manager is closed.
 *  - never: keeps the unlock key on this device so BookPass opens without asking, even after a restart.
 */
export type LockMode =
  "browser-close" | "idle" | "system-idle" | "every-time" | "never";

export type Layout = "list" | "grid" | "headlines" | "masonry";
export type Theme = "auto" | "light" | "dark";

export interface Settings {
  lockMode: LockMode;
  idleMinutes: number;
  systemIdleMinutes: number;
  defaultLayout: Layout;
  theme: Theme;
  captureCovers: boolean;
  /** Also read a page's preview image when it sits on another server than the page. Off keeps requests to the page's own server. */
  coversFromOtherServers: boolean;
  /** Width in pixels of the stored cover picture. */
  coverWidth: number;
}

export const defaultSettings: Settings = {
  lockMode: "browser-close",
  idleMinutes: 15,
  systemIdleMinutes: 10,
  defaultLayout: "list",
  theme: "auto",
  captureCovers: true,
  coversFromOtherServers: false,
  coverWidth: 256,
};

export const coverWidths = [128, 256, 384, 512];

export const lockModes: { value: LockMode; label: string; help: string }[] = [
  {
    value: "browser-close",
    label: "When the browser closes",
    help: "Unlock once per browser session. Locks when you quit the browser.",
  },
  {
    value: "idle",
    label: "After a period of inactivity",
    help: "Locks after you have not used BookPass for the time you choose.",
  },
  {
    value: "system-idle",
    label: "When the computer is idle or locked",
    help: "Locks after the computer sits idle, and when you lock your screen.",
  },
  {
    value: "every-time",
    label: "Every time you close it",
    help: "Locks as soon as the popup or the manager tab closes. Most private, most typing.",
  },
  {
    value: "never",
    label: "Never (stay unlocked on this device)",
    help: "Remembers the unlock key in this browser profile, so BookPass opens without asking. Anyone who can read your browser profile can open your bookmarks.",
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
  if (!coverWidths.includes(s.coverWidth))
    s.coverWidth = defaultSettings.coverWidth;
  return s;
}

function clampMinutes(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 24 * 60) : fallback;
}
