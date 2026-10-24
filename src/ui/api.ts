// How pages talk to the background.
import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import {
  pagePortName,
  type BroadcastEvent,
  type RequestType,
  type Requests,
  type ResponseEnvelope,
} from "../messages";

export class RequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function send<K extends RequestType>(
  type: K,
  payload: Requests[K][0],
): Promise<Requests[K][1]> {
  const response = (await browser.runtime.sendMessage({ type, payload })) as
    ResponseEnvelope<Requests[K][1]> | undefined;
  if (!response)
    throw new RequestError("BookPass did not answer. Reload the page.");
  if (!response.ok) throw new RequestError(response.error, response.code);
  return response.value;
}

/** Holds a port open while the page is open, so the background knows the page is there (the "lock when closed" setting). */
export function usePagePort() {
  useEffect(() => {
    const port = browser.runtime.connect({ name: pagePortName });
    return () => port.disconnect();
  }, []);
}

/** Calls back when the background says the vault or its status changed. */
export function useBroadcast(
  callback: (event: BroadcastEvent["event"]) => void,
) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    const listener = (message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        "event" in message
      ) {
        latest.current((message as BroadcastEvent).event);
      }
      return false;
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);
}

/** Loads one of the background's read-only answers and loads it again when the background says it changed. */
function useRemote<K extends "status" | "snapshot">(
  type: K,
  event: BroadcastEvent["event"],
  enabled = true,
) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ data?: Requests[K][1]; error?: string }>(
    {},
  );
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    send(type, undefined as Requests[K][0]).then(
      (data) => live && setState({ data }),
      (e) =>
        live && setState({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [type, enabled, tick]);
  useBroadcast((e) => e === event && enabled && setTick((t) => t + 1));
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const set = useCallback((data: Requests[K][1]) => setState({ data }), []);
  // Nothing is shown while disabled, even if an older answer is still held.
  return {
    data: enabled ? state.data : undefined,
    error: enabled ? state.error : undefined,
    refresh,
    set,
  };
}

export function useStatus() {
  const { data, error, refresh, set } = useRemote("status", "status");
  return { status: data, error, refresh, setStatus: set };
}

/** The bookmarks and folders, kept fresh. Only loads while `enabled` (the vault is unlocked). */
export function useSnapshot(enabled: boolean) {
  const { data, error, refresh } = useRemote("snapshot", "changed", enabled);
  return { snapshot: data, error, refresh };
}

const images = new Map<string, Promise<string | null>>();

/** A cover or favicon as a data URL. Cached, because the same favicon shows up on many bookmarks. */
export function useImage(
  kind: "cover" | "icon",
  id: string | null,
  version = 0,
): string | null {
  const key = `${kind}:${id}:${version}`;
  const [loaded, setLoaded] = useState<{ key: string; url: string | null }>();
  useEffect(() => {
    if (!id) return;
    let cached = images.get(key);
    if (!cached) {
      cached = send("getImage", { kind, id }).then((image) =>
        image ? `data:${image.mime};base64,${image.base64}` : null,
      );
      images.set(key, cached);
      cached.catch(() => images.delete(key));
    }
    let live = true;
    cached
      .then((url) => live && setLoaded({ key, url }))
      .catch(() => live && setLoaded({ key, url: null }));
    return () => {
      live = false;
    };
  }, [kind, id, key]);
  return id && loaded?.key === key ? loaded.url : null;
}

/** Drops cached pictures, for example when the vault locks. */
export function forgetImages() {
  images.clear();
}
