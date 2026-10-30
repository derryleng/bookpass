// Fetches the site icon and cover picture for the bookmarks that are missing one, in one go: for everything, for a
// folder or for the bookmarks picked in the list. It reaches each site with a plain request (see fetch-pictures.ts)
// only after the person has started it, only for the sites they leave ticked, and can be stopped at any time.
import { useMemo, useRef, useState } from "react";
import type { Bookmark } from "../bookmark-model";
import { stopCoversVaultBytes } from "../constants";
import {
  canFetch,
  fetchPictures,
  type FetchedPictures,
} from "../fetch-pictures";
import type { CaptureData } from "../messages";
import type { Settings } from "../settings";
import { send } from "./api";
import { Dialog } from "./Dialog";
import { I } from "./Icon";
import { errorText } from "./parts";
import { withSiteAccess } from "./site-access";
import { btn, callout, caption, hint } from "./cls";

const WORKERS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A pause of random length after each request, so the visits do not arrive in an even, recognisable rhythm. */
const pause = () => sleep(600 + Math.random() * 1400);
const isWeb = (b: Bookmark) => /^https?:\/\//i.test(b.url);

interface Progress {
  done: number;
  total: number;
  icons: number;
  covers: number;
  nothing: number;
  reasons: Map<string, number>;
}

export function FetchMissingDialog({
  bookmarks,
  scope,
  settings,
  vaultBytes,
  onClose,
}: {
  bookmarks: Bookmark[];
  /** Where the bookmarks come from, in words: "all your bookmarks", "the folder Recipes". */
  scope: string;
  settings: Settings;
  vaultBytes: number;
  onClose: () => void;
}) {
  const coversPaused = vaultBytes > stopCoversVaultBytes;
  const [wantIcons, setWantIcons] = useState(true);
  const [wantCovers, setWantCovers] = useState(!coversPaused);
  const [skipSites, setSkipSites] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress>();
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState<string>();
  const stop = useRef<AbortController>(undefined);

  const web = useMemo(() => bookmarks.filter(isWeb), [bookmarks]);
  const reachable = useMemo(() => web.filter((b) => canFetch(b.url)), [web]);
  const missingIcons = reachable.filter((b) => !b.iconId).length;
  const missingCovers = reachable.filter((b) => !b.hasCover).length;

  // The sites that would be contacted, so each can be left out.
  const sites = useMemo(() => {
    const bySite = new Map<string, Bookmark[]>();
    for (const b of reachable) {
      if (!((wantIcons && !b.iconId) || (wantCovers && !b.hasCover))) continue;
      const site = new URL(b.url).origin;
      bySite.set(site, [...(bySite.get(site) ?? []), b]);
    }
    return bySite;
  }, [reachable, wantIcons, wantCovers]);
  const targets = [...sites].filter(([site]) => !skipSites.has(site));
  const targetCount = targets.reduce((n, [, list]) => n + list.length, 0);

  const toggleSite = (site: string) =>
    setSkipSites((now) => {
      const next = new Set(now);
      if (!next.delete(site)) next.add(site);
      return next;
    });

  async function start() {
    const controller = new AbortController();
    stop.current = controller;
    setError(undefined);
    setStopped(false);
    setRunning(true);
    const now: Progress = {
      done: 0,
      total: targetCount,
      icons: 0,
      covers: 0,
      nothing: 0,
      reasons: new Map(),
    };
    const publish = () =>
      setProgress({ ...now, reasons: new Map(now.reasons) });
    publish();

    // The bookmarks of one site go one after another, with a pause, so no site is hit with a burst of requests.
    const queue = targets.map(([, list]) => list);
    let pending: { id: string; capture: CaptureData }[] = [];
    const flush = async () => {
      const batch = pending;
      pending = [];
      if (batch.length) await send("setPictures", { items: batch });
    };

    try {
      await withSiteAccess(async () => {
        async function worker() {
          for (
            let group = queue.shift();
            group && !controller.signal.aborted;
            group = queue.shift()
          ) {
            let siteIcon: FetchedPictures["icon"];
            for (const b of group) {
              if (controller.signal.aborted) break;
              const needIcon = wantIcons && !b.iconId;
              const needCover = wantCovers && !b.hasCover;
              const askIcon = needIcon && !siteIcon;
              let got: FetchedPictures = { problems: [] };
              if (askIcon || needCover) {
                got = await fetchPictures(
                  b.url,
                  { icon: askIcon, cover: needCover },
                  {
                    otherServers: settings.coversFromOtherServers,
                    coverWidth: settings.coverWidth,
                    signal: controller.signal,
                  },
                );
                await pause();
              }
              siteIcon ??= got.icon;
              const capture: CaptureData = {};
              if (needIcon && siteIcon)
                capture.favicon = { site: siteIcon.site, png: siteIcon.png };
              if (needCover && got.cover) capture.cover = got.cover;
              if (capture.favicon || capture.cover) {
                pending.push({ id: b.id, capture });
                if (capture.favicon) now.icons++;
                if (capture.cover) now.covers++;
              } else {
                now.nothing++;
              }
              for (const p of got.problems)
                now.reasons.set(p, (now.reasons.get(p) ?? 0) + 1);
              now.done++;
              if (pending.length >= 10) await flush();
              publish();
            }
          }
        }
        await Promise.all(Array.from({ length: WORKERS }, worker));
        await flush();
      });
    } catch (e) {
      setError(errorText(e));
      await flush().catch(() => {});
    } finally {
      publish();
      setStopped(controller.signal.aborted);
      setRunning(false);
    }
  }

  const finished = progress && !running;
  return (
    <Dialog
      title="Fetch missing pictures"
      onClose={running ? () => stop.current?.abort() : onClose}
      footer={
        <>
          <span className="min-w-0 flex-1" />
          {running ? (
            <button className={btn()} onClick={() => stop.current?.abort()}>
              Stop
            </button>
          ) : (
            <>
              <button className={btn()} onClick={onClose}>
                {finished ? "Close" : "Cancel"}
              </button>
              {!finished && (
                <button
                  className={btn("primary")}
                  disabled={targetCount === 0}
                  onClick={() => void start()}
                >
                  <I n="globe" /> Fetch for {targetCount} bookmark
                  {targetCount === 1 ? "" : "s"}
                </button>
              )}
            </>
          )}
        </>
      }
    >
      {!progress && (
        <>
          <p className={hint}>
            Looking at {scope}: {missingIcons} of {reachable.length} have no
            site icon and {missingCovers} have no cover picture. BookPass will
            ask each site you leave ticked for its own icon and preview image.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={wantIcons}
              onChange={(e) => setWantIcons(e.target.checked)}
            />
            <span>Site icons ({missingIcons})</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={wantCovers && !coversPaused}
              disabled={coversPaused}
              onChange={(e) => setWantCovers(e.target.checked)}
            />
            <span>
              Cover pictures ({missingCovers})
              {coversPaused ? ", paused because the vault is large" : ""}
            </span>
          </label>
          {sites.size > 0 && (
            <fieldset className="m-0 flex min-w-0 flex-col gap-2 rounded-[10px] border border-line px-3 py-2.5">
              <legend className={`px-1.5 ${caption}`}>
                Sites to contact ({targets.length} of {sites.size})
              </legend>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={btn("small")}
                  onClick={() => setSkipSites(new Set())}
                >
                  Tick all
                </button>
                <button
                  type="button"
                  className={btn("small")}
                  onClick={() => setSkipSites(new Set(sites.keys()))}
                >
                  Untick all
                </button>
              </div>
              <ul className="m-0 max-h-45 list-none overflow-y-auto p-0">
                {[...sites].map(([site, list]) => (
                  <li key={site} className="py-0.5">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!skipSites.has(site)}
                        onChange={() => toggleSite(site)}
                      />
                      <span className="min-w-0 flex-1">
                        {site.replace(/^https?:\/\//, "")}
                      </span>
                      <span className="text-muted">{list.length}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          <div className={callout()}>
            <I n="shield" />
            <span>
              Your browser will ask for permission to reach all sites, and the
              permission is taken back when this finishes. Each request has no
              cookies and no referrer and is not kept in the cache, so a site
              sees only an ordinary visit to a page you bookmarked. Requests are
              spread out with random pauses. Nothing goes to any other service.
              If a bookmark redirects to a different site, what it returns is
              thrown away, though that site has been asked once. Covers on a
              different server than the page are{" "}
              {settings.coversFromOtherServers
                ? "fetched, as your settings allow"
                : "skipped, as your settings say"}
              .
            </span>
          </div>
        </>
      )}
      {progress && (
        <>
          <progress
            value={progress.done}
            max={Math.max(1, progress.total)}
            className="w-full"
          />
          <p role="status">
            {progress.done} of {progress.total} looked at. Added{" "}
            {progress.icons} icon
            {progress.icons === 1 ? "" : "s"} and {progress.covers} cover
            {progress.covers === 1 ? "" : "s"}.
            {progress.nothing > 0 && ` ${progress.nothing} had nothing to add.`}
            {finished && stopped && " Stopped early."}
          </p>
          {finished && progress.reasons.size > 0 && (
            <ul className={`m-0 flex list-none flex-col gap-2 p-0 ${hint}`}>
              {[...progress.reasons]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([reason, n]) => (
                  <li key={reason}>
                    {n} × {reason}
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
      {error && (
        <div className={callout("error")} role="alert">
          {error}
        </div>
      )}
    </Dialog>
  );
}
