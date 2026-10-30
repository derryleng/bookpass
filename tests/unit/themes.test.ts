import { describe, expect, it } from "vitest";
import { normalizeSettings } from "../../src/settings.ts";
import { resolveMode, themeId, themeNames } from "../../src/themes.ts";

describe("themes", () => {
  it("follows the browser for system and ignores it otherwise", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
    expect(resolveMode("light", true)).toBe("light");
    expect(resolveMode("dark", false)).toBe("dark");
  });

  it("names the theme the way theme.css does", () => {
    expect(themeId("dark", "Blue")).toBe("dark-blue");
  });

  it("moves the old auto setting, and unknown themes, to the defaults", () => {
    const s = normalizeSettings({
      theme: "auto",
      lightTheme: "Nope",
      darkTheme: "Nope",
    } as never);
    expect([s.theme, s.lightTheme, s.darkTheme]).toEqual([
      "system",
      "Blue",
      "Blue",
    ]);
    const kept = normalizeSettings({ theme: "dark", darkTheme: "Rose" });
    expect([kept.theme, kept.darkTheme]).toEqual(["dark", "Rose"]);
  });

  it("has a block in theme.css for every theme", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/ui/theme.css", "utf8");
    for (const mode of ["light", "dark"] as const)
      for (const name of themeNames[mode])
        expect(css).toContain(`[data-theme="${themeId(mode, name)}"]`);
  });
});
