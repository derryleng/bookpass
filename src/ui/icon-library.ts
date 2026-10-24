// The full Font Awesome Free set, loaded only when needed (the folder icon picker, or a folder that uses an icon
// outside the small set the interface itself uses). It adds to the same registry the Icon component reads.
import { useEffect, useState } from 'react';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { icons } from './icons';

const styles: Record<string, string> = { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' };

let loading: Promise<void> | undefined;
let loaded = false;

function isIcon(value: unknown): value is IconDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'iconName' in value &&
    'icon' in value &&
    'prefix' in value
  );
}

export function loadAllIcons(): Promise<void> {
  loading ??= Promise.all([
    import('@fortawesome/free-solid-svg-icons'),
    import('@fortawesome/free-regular-svg-icons'),
    import('@fortawesome/free-brands-svg-icons'),
  ]).then((modules) => {
    for (const module of modules) {
      for (const value of Object.values(module)) {
        if (isIcon(value) && styles[value.prefix])
          icons.set(`${styles[value.prefix]}:${value.iconName}`, value);
      }
    }
    loaded = true;
  });
  return loading;
}

/** Loads the full set if any of these icon keys is missing from the registry. Re-renders once it is there. */
export function useIconsFor(keys: string[]): void {
  const [, setReady] = useState(loaded);
  const missing = keys.some((key) => !icons.has(key));
  useEffect(() => {
    if (missing) void loadAllIcons().then(() => setReady(true));
  }, [missing]);
}

/** Every icon key that exists, once the full set is loaded. */
export function allIconKeys(): string[] {
  return [...icons.keys()].sort();
}

/** A folder icon drawn as a PNG, so KeePassXC and KeePass show it next to the folder. */
export async function renderIconPng(key: string, color: string, size = 64): Promise<Uint8Array> {
  const [w, h, , , path] = (icons.get(key) ?? icons.get('fa-solid:folder')!).icon;
  const fill = color || '#6b7280';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><path fill="${fill}" d="${String(path)}"/></svg>`;
  const image = new Image();
  image.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const scale = Math.min(size / w, size / h);
    canvas
      .getContext('2d')!
      .drawImage(image, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not draw the icon');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(image.src);
  }
}

const RECENT_KEY = 'bookpass.recentIcons';

export function recentIcons(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function rememberIcon(key: string) {
  try {
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([key, ...recentIcons().filter((k) => k !== key)].slice(0, 12)),
    );
  } catch {
    /* recent icons just will not be remembered */
  }
}
