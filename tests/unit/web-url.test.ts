import { describe, expect, it } from "vitest";
import { isWebUrl } from "../../src/web-url";

describe("isWebUrl", () => {
  it("accepts http, https and ftp addresses", () => {
    for (const url of [
      "http://a.test/",
      "HTTPS://A.TEST/x?y#z",
      "ftp://a.test/f",
      "  https://a.test/ ",
    ])
      expect(isWebUrl(url)).toBe(true);
  });

  it("refuses every other scheme, however it is written", () => {
    for (const url of [
      "javascript:alert(1)",
      "java\tscript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,x",
      "file:///etc/passwd",
      "vbscript:x",
      "mailto:a@b.test",
      "chrome://settings",
      "about:blank",
      "//a.test/path",
      "/path",
      "a.test",
      "",
    ])
      expect(isWebUrl(url)).toBe(false);
  });
});
