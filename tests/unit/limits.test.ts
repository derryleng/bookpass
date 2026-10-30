import { describe, expect, it } from "vitest";
import { clip } from "../../src/limits";

describe("clip", () => {
  it("leaves short text alone", () => {
    expect(clip("hello", 5)).toBe("hello");
  });

  it("cuts long text to the limit", () => {
    expect(clip("a".repeat(10), 4)).toBe("aaaa");
  });

  it("does not leave half of an emoji behind", () => {
    expect(clip("ab\u{1F600}cd", 3)).toBe("ab");
    expect(clip("ab\u{1F600}cd", 4)).toBe("ab\u{1F600}");
  });
});
