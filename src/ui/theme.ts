import { resolveMode, themeId } from "../themes";
import type { Settings } from "../settings";

const dark = matchMedia("(prefers-color-scheme: dark)");

/** Puts the chosen theme on the page, and follows the browser's light or dark setting while the mode is "system". */
export function applyTheme(
  settings: Pick<Settings, "theme" | "lightTheme" | "darkTheme">,
) {
  const apply = () => {
    const mode = resolveMode(settings.theme, dark.matches);
    const root = document.documentElement.dataset;
    root.mode = mode;
    root.theme = themeId(
      mode,
      mode === "dark" ? settings.darkTheme : settings.lightTheme,
    );
  };
  apply();
  if (settings.theme !== "system") return;
  dark.addEventListener("change", apply);
  return () => dark.removeEventListener("change", apply);
}
