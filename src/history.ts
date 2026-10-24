// Earlier versions of a bookmark. KDBX keeps the old entry in the entry's history every time it is edited,
// and merging keeps the losing side there too, so nothing is lost silently.
import { findEntry, text } from "./bookmark-model";
import type { Kdbx } from "./kdbx";

export interface Version {
  /** When this version was saved (ms since 1970). It identifies the version. */
  time: number;
  title: string;
  url: string;
  note: string;
  tags: string[];
}

/** Older versions of a bookmark, newest first. The current version is not included. */
export function getHistory(db: Kdbx, id: string): Version[] {
  return findEntry(db, id)
    .history.map((old) => ({
      time: old.times.lastModTime?.getTime() ?? 0,
      title: text(old, "Title"),
      url: text(old, "URL"),
      note: text(old, "Notes"),
      tags: [...old.tags],
    }))
    .sort((a, b) => b.time - a.time);
}

/** Makes an older version current again. The version it replaces goes into the history. */
export function restoreVersion(db: Kdbx, id: string, time: number) {
  const entry = findEntry(db, id);
  const old = entry.history.find(
    (h) => (h.times.lastModTime?.getTime() ?? 0) === time,
  );
  if (!old) throw new Error("That version is no longer in the history");
  entry.pushHistory();
  entry.fields = new Map(old.fields);
  entry.tags = [...old.tags];
  entry.times.update();
}
