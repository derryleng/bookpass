// Small pieces shared by several screens.
import { useState, type KeyboardEvent } from 'react';
import { domainOf, folderOptions, type TreeNode } from '../browse';
import { useImage } from './api';
import { I } from './Icon';

/** The site's saved icon, or its first letter when none was captured. */
export function Favicon({ iconId, url }: { iconId: string | null; url: string }) {
  const src = useImage('icon', iconId);
  if (src) return <img className="favicon" src={src} alt="" />;
  return <span className="favicon-letter">{(domainOf(url) || '?').charAt(0)}</span>;
}

/** A folder picker that shows nesting by indenting. null means the top level (Unsorted). */
export function FolderSelect({
  tree,
  value,
  onChange,
  exclude,
  topLabel = 'Unsorted',
  id,
}: {
  tree: TreeNode[];
  value: string | null;
  onChange: (id: string | null) => void;
  exclude?: Set<string>;
  topLabel?: string;
  id?: string;
}) {
  return (
    <select
      id={id}
      className="select"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{topLabel}</option>
      {folderOptions(tree, exclude).map((o) => (
        <option key={o.id} value={o.id}>
          {' '.repeat(o.depth)}
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
  const [draft, setDraft] = useState('');
  const listId = 'tag-suggestions';

  function add(raw: string) {
    const tag = raw.trim().replace(/^#/, '');
    setDraft('');
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...tags, tag]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="chips">
      {tags.map((tag) => (
        <span className="chip" key={tag}>
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`Remove tag ${tag}`}
          >
            <I n="xmark" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        list={listId}
        placeholder={tags.length ? '' : 'Add tags'}
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
