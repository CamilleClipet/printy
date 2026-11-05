import { describe, expect, it } from "vitest";
import { wrapLines } from "./renderText";

const mono = { measureText: (s: string) => ({ width: s.length * 10 }) as TextMetrics };

describe("wrapLines", () => {
  it("wraps on word boundaries within the max width", () => {
    expect(wrapLines(mono, "aaa bbb ccc", 70)).toEqual(["aaa bbb", "ccc"]);
  });
  it("keeps explicit line breaks and splits very long words", () => {
    expect(wrapLines(mono, "abcdefgh\n\nx", 30)).toEqual(["abc", "def", "gh", "", "x"]);
  });
});
