// Drag and drop between the bookmark list and the folder tree.
import type { DragEvent } from 'react';

const TYPE = 'application/x-bookpass';

export type DragPayload = { kind: 'bookmarks'; ids: string[] } | { kind: 'folder'; id: string };

export function startDrag(e: DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
}

/** True while something BookPass can drop is being dragged. Only the types are visible until the drop. */
export function isOurs(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(TYPE);
}

export function readDrag(e: DragEvent): DragPayload | undefined {
  try {
    return JSON.parse(e.dataTransfer.getData(TYPE)) as DragPayload;
  } catch {
    return undefined;
  }
}
