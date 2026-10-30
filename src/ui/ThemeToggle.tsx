import type { ThemeMode } from "../themes";
import { segment, segmented } from "./cls";
import { I } from "./Icon";

const modes: { value: ThemeMode; label: string; icon: string }[] = [
  { value: "system", label: "Match the system", icon: "desktop" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

/** Switches between the light theme, the dark theme, or whichever the system asks for. */
export function ThemeToggle({
  mode,
  onChange,
  showLabels,
}: {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  showLabels?: boolean;
}) {
  return (
    <div className={`${segmented} w-fit`} role="group" aria-label="Theme">
      {modes.map((m) => (
        <button
          type="button"
          key={m.value}
          className={segment(mode === m.value)}
          title={m.label}
          aria-label={m.label}
          aria-pressed={mode === m.value}
          onClick={() => onChange(m.value)}
        >
          <I n={m.icon} />
          {showLabels && m.label}
        </button>
      ))}
    </div>
  );
}
