// The pictures part of the bookmark dialog: see the site icon and cover, fetch them from the site, choose your own,
// or take them away. Nothing is stored until the dialog is saved.
import { useState, type Dispatch, type SetStateAction } from "react";
import { fetchPictures } from "../fetch-pictures";
import { shrinkCover, toIconPng } from "../images";
import type { Bookmark } from "../bookmark-model";
import { customIconName } from "../bookmark-model";
import type { CaptureData } from "../messages";
import type { Settings } from "../settings";
import { useImage } from "./api";
import { I } from "./Icon";
import { errorText, Favicon } from "./parts";
import { withSiteAccess } from "./site-access";
import { btn, callout, caption } from "./cls";

/** What the person changed. undefined: not touched. null: take it away. A string: the new picture, base64. */
export interface PicturePending {
  cover?: string | null;
  icon?: { png: string; site: string } | null;
}

export function pendingToCapture(pending: PicturePending): CaptureData {
  const clear: ("cover" | "icon")[] = [];
  if (pending.cover === null) clear.push("cover");
  if (pending.icon === null) clear.push("icon");
  return {
    cover: typeof pending.cover === "string" ? pending.cover : undefined,
    favicon: pending.icon
      ? { site: pending.icon.site, png: pending.icon.png, replace: true }
      : undefined,
    clear: clear.length ? clear : undefined,
  };
}

interface Props {
  bookmark?: Bookmark;
  /** The address typed into the dialog, which is what a fetch uses. */
  url: string;
  settings: Settings;
  pending: PicturePending;
  onPending: Dispatch<SetStateAction<PicturePending>>;
}

const asImage = (base64: string) => `data:image/png;base64,${base64}`;

export function PicturesField({
  bookmark,
  url,
  settings,
  pending,
  onPending,
}: Props) {
  const [busy, setBusy] = useState<"icon" | "cover">();
  const [notes, setNotes] = useState<string[]>([]);
  const storedCover = useImage(
    "cover",
    bookmark?.hasCover ? bookmark.id : null,
    bookmark?.modified,
  );
  const cover =
    pending.cover === undefined
      ? storedCover
      : pending.cover
        ? asImage(pending.cover)
        : null;
  const icon =
    pending.icon === undefined
      ? undefined
      : pending.icon
        ? asImage(pending.icon.png)
        : null;
  const hasIcon =
    pending.icon === undefined ? !!bookmark?.iconId : pending.icon !== null;
  const hasCover =
    pending.cover === undefined ? !!bookmark?.hasCover : pending.cover !== null;
  const webAddress = /^https?:\/\//i.test(url.trim());

  async function fetchFromSite(which: "icon" | "cover") {
    setBusy(which);
    setNotes([]);
    try {
      const got = await withSiteAccess(() =>
        fetchPictures(
          url.trim(),
          { icon: which === "icon", cover: which === "cover" },
          {
            otherServers: settings.coversFromOtherServers,
            coverWidth: settings.coverWidth,
          },
        ),
      );
      if (which === "icon" && got.icon)
        onPending((p) => ({
          ...p,
          icon: { png: got.icon!.png, site: got.icon!.site },
        }));
      if (which === "cover" && got.cover)
        onPending((p) => ({ ...p, cover: got.cover }));
      setNotes(got.problems);
    } catch (e) {
      setNotes([errorText(e)]);
    } finally {
      setBusy(undefined);
    }
  }

  async function choose(which: "icon" | "cover", file: File | undefined) {
    if (!file) return;
    setNotes([]);
    try {
      if (which === "icon") {
        const site = bookmark
          ? customIconName(bookmark.id)
          : customIconName(crypto.randomUUID());
        const png = await toIconPng(file);
        onPending((p) => ({ ...p, icon: { png, site } }));
      } else {
        const cover = await shrinkCover(file, settings.coverWidth);
        onPending((p) => ({ ...p, cover }));
      }
    } catch (e) {
      setNotes([`That file could not be used as a picture: ${errorText(e)}`]);
    }
  }

  return (
    <fieldset className="m-0 flex flex-col gap-2.5 rounded-[10px] border border-line px-3 pt-2.5 pb-3">
      <legend className={`px-1.5 ${caption}`}>Pictures</legend>
      <div className="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1">
        <div
          role="group"
          aria-label="Site icon"
          className="flex min-w-0 flex-col gap-1.5"
        >
          <span className={caption}>Site icon</span>
          <div className="grid size-14 place-items-center rounded-[10px] bg-raised">
            {icon ? (
              <img
                className="size-10 shrink-0 rounded-lg object-contain"
                src={icon}
                alt="Site icon"
              />
            ) : icon === null ? (
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-raised text-lg font-bold text-muted uppercase">
                {(
                  url.replace(/^https?:\/\/(www\.)?/i, "")[0] ?? "?"
                ).toUpperCase()}
              </span>
            ) : (
              <Favicon iconId={bookmark?.iconId ?? null} url={url} big />
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={btn("small")}
              disabled={!webAddress || !!busy}
              onClick={() => void fetchFromSite("icon")}
            >
              {busy === "icon" ? <I n="spinner" spin /> : <I n="globe" />} Fetch
              from site
            </button>
            <label className={btn("small")}>
              <I n="image" /> Choose file
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void choose("icon", e.target.files?.[0])}
              />
            </label>
            {hasIcon && (
              <button
                type="button"
                className={btn("small")}
                onClick={() => onPending((p) => ({ ...p, icon: null }))}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div
          role="group"
          aria-label="Cover"
          className="flex min-w-0 flex-col gap-1.5"
        >
          <span className={caption}>Cover</span>
          <div
            role="img"
            aria-label="Cover picture"
            className="grid aspect-[16/10] w-full max-w-50 place-items-center rounded-lg bg-raised bg-cover bg-center bg-no-repeat text-muted"
            style={cover ? { backgroundImage: `url(${cover})` } : undefined}
          >
            {!cover && <I n="image" />}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={btn("small")}
              disabled={!webAddress || !!busy}
              onClick={() => void fetchFromSite("cover")}
            >
              {busy === "cover" ? <I n="spinner" spin /> : <I n="globe" />}{" "}
              Fetch from site
            </button>
            <label className={btn("small")}>
              <I n="image" /> Choose file
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void choose("cover", e.target.files?.[0])}
              />
            </label>
            {hasCover && (
              <button
                type="button"
                className={btn("small")}
                onClick={() => onPending((p) => ({ ...p, cover: null }))}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
      {notes.map((note) => (
        <div className={callout()} key={note} role="status">
          <I n="circle-exclamation" />
          <span>{note}</span>
        </div>
      ))}
    </fieldset>
  );
}
