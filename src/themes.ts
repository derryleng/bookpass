// The colour themes. Each has a name and belongs to light or dark, and its colours live in src/ui/theme.css.
// To add a theme: add its name here, then add a [data-theme="light-name"] or [data-theme="dark-name"] block there
// (the name in lower case). It then shows up in the settings page, and the toggle and "system" switch between the
// light theme and the dark theme that are picked.

export type Mode = "light" | "dark";
/** What the toggle holds. "system" follows the browser's light or dark setting. */
export type ThemeMode = "system" | Mode;

export const themeNames: Record<Mode, string[]> = {
  light: ["Blue", "Teal", "Orange", "Rose", "Violet"],
  dark: ["Blue", "Teal", "Orange", "Rose", "Violet"],
};

export const defaultThemeName = "Blue";

export const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "system" || value === "light" || value === "dark";

/** Light or dark: "system" becomes whatever the browser prefers. */
export const resolveMode = (mode: ThemeMode, prefersDark: boolean): Mode =>
  mode !== "system" ? mode : prefersDark ? "dark" : "light";

/** The value of data-theme that theme.css uses for a theme. */
export const themeId = (mode: Mode, name: string) =>
  `${mode}-${name.toLowerCase()}`;
