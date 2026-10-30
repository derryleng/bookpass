// Every BookPass page runs inside this: it checks the helper and the vault, shows the right gate screen,
// and only renders the page itself once the vault is unlocked and loaded.
import { useEffect, type ReactNode } from "react";
import type { SnapshotReply, Status } from "../messages";
import { forgetImages, usePagePort, useSnapshot, useStatus } from "./api";
import { Gate, HelperMissing } from "./Gates";
import { I } from "./Icon";
import "./styles.css";

export interface PageContext {
  status: Status;
  snapshot: SnapshotReply;
  refreshStatus: () => void;
}

function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <main className="gate">
      <span className="muted">
        <I n="spinner" spin /> {text}
      </span>
    </main>
  );
}

export function Shell({
  children,
}: {
  children: (context: PageContext) => ReactNode;
}) {
  usePagePort();
  const { status, error, refresh, setStatus } = useStatus();

  useEffect(() => {
    const theme = status?.settings.theme ?? "auto";
    document.documentElement.dataset.theme = theme;
  }, [status?.settings.theme]);

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
      <main className="gate">
        <div className="gate-card callout error">{error}</div>
      </main>
    );
  }
  if (!status) return <Loading />;
  if (status.helper !== "ok")
    return <HelperMissing status={status} onRetry={refresh} />;
  if (!status.vaultExists || status.locked)
    return <Gate status={status} onStatus={setStatus} />;
  if (!snapshot) return <Loading text="Opening your vault…" />;
  return <>{children({ status, snapshot, refreshStatus: refresh })}</>;
}
