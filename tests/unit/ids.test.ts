import { describe, expect, it } from 'vitest';
import ids from '../../helper/ids.json';
import { chromeId, firefoxId, hostName } from '../../scripts/ids';

describe('identities shared with the helper', () => {
  it('lets the helper manifest name the development extension id', () => {
    expect(ids.chromeIds).toContain(chromeId);
  });

  it('uses one host name and Firefox id in the extension and the helper', () => {
    expect(hostName).toBe(ids.hostName);
    expect(firefoxId).toBe(ids.firefoxId);
  });
});
