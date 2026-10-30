// The one menu for how a list looks: how it is ordered, whether it is split into sections, whether subfolders are
// included and what each bookmark shows. The layout buttons stay outside it because they are used most.
import { useEffect, useRef } from "react";
import type { GroupKey, SortKey, ViewSettings } from "../bookmark-model";
import { btn, hint, input, menu, menuTrigger, segment, segmented } from "./cls";
import { I } from "./Icon";

const fieldset = "m-0 flex min-w-0 flex-col items-stretch gap-2 border-0 p-0";
const legend =
  "mb-1.5 p-0 text-xs font-semibold tracking-wide text-muted uppercase";
const checkRow = "flex items-center gap-2 py-0.5";

const sorts: { value: SortKey; label: string; up: string; down: string }[] = [
  {
    value: "added",
    label: "Date added",
    up: "Oldest first",
    down: "Newest first",
  },
  {
    value: "edited",
    label: "Date edited",
    up: "Oldest first",
    down: "Newest first",
  },
  { value: "title", label: "Title", up: "A to Z", down: "Z to A" },
  { value: "domain", label: "Website", up: "A to Z", down: "Z to A" },
  {
    value: "manual",
    label: "Manual (drag to reorder)",
    up: "First to last",
    down: "Last to first",
  },
];

function groups(inFolder: boolean): { value: GroupKey; label: string }[] {
  return [
    { value: "none", label: "No sections" },
    { value: "folder", label: inFolder ? "Subfolder" : "Folder" },
    { value: "title", label: "Title (first letter)" },
    { value: "website", label: "Website" },
    { value: "added", label: "Date added (month)" },
    { value: "edited", label: "Date edited (month)" },
  ];
}

const shows: ["showCover" | "showNote" | "showTags", string][] = [
  ["showCover", "Cover pictures"],
  ["showNote", "Notes"],
  ["showTags", "Tags"],
];

/** A short line saying how the list is ordered and split, so the menu does not have to be opened to find out. */
export function viewSummary(view: ViewSettings, inFolder: boolean): string {
  const sort = sorts.find((s) => s.value === view.sort)!;
  const parts = [
    `${sort.label}, ${(view.sortDir === "asc" ? sort.up : sort.down).toLowerCase()}`,
  ];
  const group = groups(inFolder).find((g) => g.value === view.group);
  if (group && view.group !== "none")
    parts.push(`sections by ${group.label.toLowerCase()}`);
  if (inFolder && view.subfolders) parts.push("with subfolders");
  return parts.join(" · ");
}

export function ViewMenu({
  view,
  inFolder,
  onChange,
}: {
  view: ViewSettings;
  /** A folder is open, so subfolders can be included and sections can follow them. */
  inFolder: boolean;
  onChange: (patch: Partial<ViewSettings>) => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const sort = sorts.find((s) => s.value === view.sort)!;

  // Closes when something else is clicked or Escape is pressed, as a menu should.
  useEffect(() => {
    const close = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target))
        return;
      menuRef.current?.removeAttribute("open");
    };
    const escape = (e: KeyboardEvent) =>
      e.key === "Escape" && menuRef.current?.removeAttribute("open");
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <details className={menu} ref={menuRef}>
      <summary
        className={`${btn()} ${menuTrigger}`}
        title="Sort, group and choose what to show"
        aria-label="View options"
      >
        <I n="sliders" /> View
      </summary>
      <div
        role="group"
        aria-label="View"
        className="absolute right-0 z-5 mt-1.5 flex min-w-70 flex-col gap-3.5 rounded-[10px] border border-line bg-surface p-3.5 shadow-card"
      >
        <fieldset className={fieldset}>
          <legend className={legend}>Sort by</legend>
          <select
            className={input}
            value={view.sort}
            onChange={(e) => onChange({ sort: e.target.value as SortKey })}
            aria-label="Sort by"
          >
            {sorts.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className={segmented} role="group" aria-label="Sort direction">
            {(["asc", "desc"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                className={segment(view.sortDir === dir)}
                aria-pressed={view.sortDir === dir}
                onClick={() => onChange({ sortDir: dir })}
              >
                <I
                  n={
                    dir === "asc"
                      ? "arrow-up-wide-short"
                      : "arrow-down-short-wide"
                  }
                />{" "}
                {dir === "asc" ? sort.up : sort.down}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={fieldset}>
          <legend className={legend}>Split into sections by</legend>
          <select
            className={input}
            value={view.group}
            onChange={(e) => {
              const group = e.target.value as GroupKey;
              // Sections by subfolder only mean something when subfolders are included.
              onChange(
                inFolder && group === "folder"
                  ? { group, subfolders: true }
                  : { group },
              );
            }}
            aria-label="Split into sections by"
          >
            {groups(inFolder).map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          {view.sort === "manual" && view.group !== "none" && (
            <span className={hint}>
              Dragging to reorder works only without sections.
            </span>
          )}
        </fieldset>

        {inFolder && (
          <fieldset className={fieldset}>
            <legend className={legend}>Include</legend>
            <label className={checkRow}>
              <input
                type="checkbox"
                checked={view.subfolders}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? { subfolders: true }
                      : {
                          subfolders: false,
                          group: view.group === "folder" ? "none" : view.group,
                        },
                  )
                }
              />
              Bookmarks from subfolders
            </label>
          </fieldset>
        )}

        <fieldset className={fieldset}>
          <legend className={legend}>Show on each bookmark</legend>
          {shows.map(([key, label]) => (
            <label key={key} className={checkRow}>
              <input
                type="checkbox"
                checked={view[key]}
                onChange={(e) => onChange({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
    </details>
  );
}
