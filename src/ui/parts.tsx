// Small pieces shared by several screens.
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { domainOf, folderOptions, type TreeNode } from "../browse";
import { useImage } from "./api";
import { input } from "./cls";
import { I } from "./Icon";

/** The BookPass mark. Pass a size and a corner radius for anything but the large one. */
export function Logo({
  className = "size-9.5 rounded-[11px] text-lg",
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-grid place-items-center bg-accent text-on-accent ${className}`}
    >
      <I n="bookmark" />
    </span>
  );
}

/** The site's saved icon, or its first letter when none was captured. */
export function Favicon({
  iconId,
  url,
  big,
}: {
  iconId: string | null;
  url: string;
  big?: boolean;
}) {
  const src = useImage("icon", iconId);
  const size = big ? "size-10 rounded-lg" : "size-5 rounded-[5px]";
  if (src)
    return (
      <img className={`shrink-0 object-contain ${size}`} src={src} alt="" />
    );
  return (
    <span
      className={`grid shrink-0 place-items-center bg-raised font-bold text-muted uppercase ${size} ${big ? "text-lg" : "text-[11px]"}`}
    >
      {(domainOf(url) || "?").charAt(0)}
    </span>
  );
}

/**
 * A tick box that picks everything in a list. With a symbol (the folder's icon, say) it shows only the symbol until
 * the pointer is over it or something is picked, and without one it shows only when its heading is hovered.
 */
export function SelectAll({
  ids,
  picked,
  onPick,
  label,
  children,
}: {
  ids: string[];
  picked: Set<string>;
  onPick: (ids: string[], on: boolean) => void;
  label: string;
  children?: ReactNode;
}) {
  const count = ids.filter((id) => picked.has(id)).length;
  const all = ids.length > 0 && count === ids.length;
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = count > 0 && !all;
  }, [count, all]);
  return (
    <label className="group/pick relative inline-grid size-6.5 flex-none place-items-center [&>*]:[grid-area:1/1]">
      {children && (
        <span
          className={`pointer-events-none grid place-items-center text-xl text-muted ${count ? "opacity-0" : "group-focus-within/pick:opacity-0 group-hover/pick:opacity-0"}`}
        >
          {children}
        </span>
      )}
      <input
        ref={box}
        type="checkbox"
        checked={all}
        onChange={() => onPick(ids, !all)}
        aria-label={label}
        className={`m-0 size-4.5 cursor-pointer ${count ? "opacity-100" : `opacity-0 group-focus-within/pick:opacity-100 group-hover/pick:opacity-100 ${children ? "" : "group-hover/head:opacity-100"}`}`}
      />
    </label>
  );
}

/** A folder picker that shows nesting by indenting. null means the top level (Unsorted). */
export function FolderSelect({
  tree,
  value,
  onChange,
  exclude,
  topLabel = "Unsorted",
  id,
  className = input,
}: {
  tree: TreeNode[];
  value: string | null;
  onChange: (id: string | null) => void;
  exclude?: Set<string>;
  topLabel?: string;
  id?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      className={className}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{topLabel}</option>
      {folderOptions(tree, exclude).map((o) => (
        <option key={o.id} value={o.id}>
          {" ".repeat(o.depth)}
          {o.name}
        </option>
      ))}
    </select>
  );
}

/** Tags as removable chips. Enter or comma adds the typed tag, and suggestions come from existing tags. */
export function TagInput({
  tags,
  onChange,
  suggestions,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState("");
  const listId = "tag-suggestions";

  function add(raw: string) {
    const tag = raw.trim().replace(/^#/, "");
    setDraft("");
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
      onChange([...tags, tag]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-line bg-surface p-1.5 focus-within:border-transparent focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-accent">
      {tags.map((tag) => (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pr-1 pl-2 text-xs text-accent-strong"
          key={tag}
        >
          {tag}
          <button
            type="button"
            className="grid size-4 cursor-pointer place-items-center rounded-full"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`Remove tag ${tag}`}
          >
            <I n="xmark" />
          </button>
        </span>
      ))}
      <input
        className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-fg outline-none"
        value={draft}
        list={listId}
        placeholder={tags.length ? "" : "Add tags"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
