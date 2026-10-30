import { describe, expect, it } from "vitest";
import { isOwnPage } from "../../src/own-page";

const id = "abcdefghijklmnopabcdefghijklmnop";
const base = `chrome-extension://${id}/`;

describe("isOwnPage", () => {
  it("accepts the extension's own pages", () => {
    for (const page of ["popup.html", "manager.html#settings", "options.html"])
      expect(isOwnPage({ id, url: base + page }, id, base)).toBe(true);
  });

  it("refuses a script running in a web page, which has the extension id but the page's address", () => {
    expect(isOwnPage({ id, url: "https://evil.test/" }, id, base)).toBe(false);
  });

  it("refuses another extension, even one that names a BookPass page", () => {
    expect(isOwnPage({ id: "other", url: base + "popup.html" }, id, base)).toBe(
      false,
    );
  });

  it("refuses a sender with no address, and an address that only starts like ours", () => {
    expect(isOwnPage({ id }, id, base)).toBe(false);
    expect(
      isOwnPage({ id, url: base.slice(0, -1) + "x/a.html" }, id, base),
    ).toBe(false);
  });
});
