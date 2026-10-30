import { describe, expect, it } from "vitest";
import devIds from "../../helper/ids.dev.json";
import ids from "../../helper/ids.json";
import { chromeId, firefoxId, hostName } from "../../scripts/ids";

describe("identities shared with the helper", () => {
  it("lets development helper builds name the development extension id", () => {
    expect(devIds.chromeIds).toContain(chromeId);
  });

  it("keeps the public development extension id out of release helpers", () => {
    expect(ids.chromeIds).not.toContain(chromeId);
  });

  it("uses one host name and Firefox id in the extension and the helper", () => {
    expect(hostName).toBe(ids.hostName);
    expect(firefoxId).toBe(ids.firefoxId);
  });
});
