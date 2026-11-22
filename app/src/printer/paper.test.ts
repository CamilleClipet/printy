import { describe, expect, it } from "vitest";
import { clampPaperMm, MAX_PAPER_MM, MIN_PAPER_MM, printWidthDots } from "./paper";

describe("paper width", () => {
  it("maps the known paper sizes to their print widths", () => {
    expect(printWidthDots(57)).toBe(384);
    expect(printWidthDots(80)).toBe(576);
  });

  it("rounds and clamps paper widths", () => {
    expect(clampPaperMm(39)).toBe(MIN_PAPER_MM);
    expect(clampPaperMm(112.6)).toBe(110);
    expect(MAX_PAPER_MM).toBe(110);
    expect(clampPaperMm(57.4)).toBe(57);
    expect(printWidthDots(0)).toBe(printWidthDots(MIN_PAPER_MM));
    expect(printWidthDots(1000)).toBe(printWidthDots(MAX_PAPER_MM));
  });

  it("always returns a whole number of bytes per row", () => {
    for (let paperMm = MIN_PAPER_MM; paperMm <= MAX_PAPER_MM; paperMm++) {
      expect(printWidthDots(paperMm) % 8).toBe(0);
    }
  });
});
