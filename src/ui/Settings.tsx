import { SettingsPanel } from './SettingsPanel';
import { Shell } from './Shell';

/** The settings as their own page, for the browser's extension options link. */
export function SettingsApp() {
  return (
    <Shell>
      {({ status, refreshStatus }) => (
        <div style={{ padding: '28px' }}>
          <SettingsPanel status={status} onChanged={refreshStatus} />
        </div>
      )}
    </Shell>
  );
}
