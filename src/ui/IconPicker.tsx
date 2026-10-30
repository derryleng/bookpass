import { useEffect, useMemo, useState } from "react";
import { field, hint, input, inputSmall } from "./cls";
import { Icon } from "./Icon";
import { allIconKeys, loadAllIcons, recentIcons } from "./icon-library";
import { folderColors, folderIconChoices } from "./icons";

const styles = [
  { prefix: "fa-solid:", label: "Solid" },
  { prefix: "fa-regular:", label: "Regular" },
  { prefix: "fa-brands:", label: "Brands" },
];
const SHOWN = 150;

/** Picks a Font Awesome Free icon and a color. A short list to begin with, the whole free set on search. */
export function IconPicker({
  icon,
  color,
  onIcon,
  onColor,
}: {
  icon: string;
  color: string;
  onIcon: (key: string) => void;
  onColor: (color: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState(styles[0]!.prefix);
  const [all, setAll] = useState<string[]>();
  const searching = query.trim() !== "";

  // The full set is large, so it loads when the person starts searching.
  useEffect(() => {
    if (searching && !all)
      void loadAllIcons().then(() => setAll(allIconKeys()));
  }, [searching, all]);

  const shown = useMemo(() => {
    if (!searching)
      return [...new Set([...recentIcons(), ...folderIconChoices])];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (all ?? [])
      .filter(
        (key) =>
          key.startsWith(style) &&
          words.every((w) => key.slice(style.length).includes(w)),
      )
      .slice(0, SHOWN);
  }, [searching, query, all, style]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className={field}>
        <span>Icon</span>
        <div className="flex items-center gap-2">
          <input
            className={input}
            placeholder="Search all icons, for example rocket or github"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search icons"
          />
          {searching && (
            <select
              className={inputSmall}
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              aria-label="Icon style"
            >
              {styles.map((s) => (
                <option key={s.prefix} value={s.prefix}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div
          className="flex max-h-35.5 flex-wrap gap-1.5 overflow-y-auto"
          role="listbox"
          aria-label="Icons"
        >
          {shown.map((key) => (
            <button
              type="button"
              key={key}
              role="option"
              aria-selected={key === icon}
              className={`grid size-8.5 cursor-pointer place-items-center rounded-lg border ${key === icon ? "border-accent bg-accent-soft text-accent-strong" : "border-transparent bg-raised text-fg"}`}
              onClick={() => onIcon(key)}
              title={key.split(":")[1]}
              aria-label={key.split(":")[1]}
              style={{ color: key === icon ? undefined : color || undefined }}
            >
              <Icon name={key} />
            </button>
          ))}
          {searching && all && shown.length === 0 && (
            <span className={hint}>No icon matches that.</span>
          )}
          {searching && !all && (
            <span className={hint}>Loading the icons…</span>
          )}
        </div>
      </div>
      <div className={field}>
        <span>Color</span>
        <div className="flex flex-wrap gap-1.5">
          {folderColors.map((c) => (
            <button
              type="button"
              key={c || "none"}
              className={`size-6 cursor-pointer rounded-full border-2 p-0 ${c === color ? "border-fg shadow-[inset_0_0_0_2px_var(--surface)]" : "border-transparent"}`}
              style={{ background: c || "var(--muted)" }}
              onClick={() => onColor(c)}
              aria-label={c || "No color"}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
