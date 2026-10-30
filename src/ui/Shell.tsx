// Every BookPass page runs inside this: it checks the helper and the vault, shows the right gate screen,
// and only renders the page itself once the vault is unlocked and loaded.
import { useEffect, type ReactNode } from "react";
import type { SnapshotReply, Status } from "../messages";
import { defaultSettings } from "../settings";
import { forgetImages, usePagePort, useSnapshot, useStatus } from "./api";
import { Gate, HelperMissing } from "./Gates";
import { I } from "./Icon";
import { callout } from "./cls";
import { applyTheme } from "./theme";
import "./theme.css";

applyTheme(defaultSettings); // until the settings arrive, so the page never flashes the wrong colours

export interface PageContext {
  status: Status;
  snapshot: SnapshotReply;
  refreshStatus: () => void;
}

function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <main className="grid min-h-full place-items-center p-6">
      <span className="text-muted">
        <I n="spinner" spin /> {text}
      </span>
    </main>
  );
}

export function Shell({
  children,
  popup,
}: {
  children: (context: PageContext) => ReactNode;
  /** The page is the toolbar popup, so the gate screens fill the whole window. */
  popup?: boolean;
}) {
  usePagePort();
  const { status, error, refresh, setStatus } = useStatus();

  const { theme, lightTheme, darkTheme } = status?.settings ?? defaultSettings;
  useEffect(
    () => applyTheme({ theme, lightTheme, darkTheme }),
    [theme, lightTheme, darkTheme],
  );

  useEffect(() => {
    if (status?.locked) forgetImages();
  }, [status?.locked]);

  const unlocked =
    !!status && status.helper === "ok" && status.vaultExists && !status.locked;
  const { snapshot, error: snapshotError } = useSnapshot(unlocked);

  // The vault locked behind our back (for example the key was cleared): look at the status again.
  useEffect(() => {
    if (snapshotError) void refresh();
  }, [snapshotError, refresh]);

  if (error) {
    return (
      <main className="grid min-h-full place-items-center p-6">
        <div className={`${callout("error")} w-full max-w-110`}>{error}</div>
      </main>
    );
  }
  if (!status) return <Loading />;
  if (status.helper !== "ok")
    return <HelperMissing status={status} onRetry={refresh} popup={popup} />;
  if (!status.vaultExists || status.locked)
    return <Gate status={status} onStatus={setStatus} popup={popup} />;
  if (!snapshot) return <Loading text="Opening your vault…" />;
  return <>{children({ status, snapshot, refreshStatus: refresh })}</>;
}
