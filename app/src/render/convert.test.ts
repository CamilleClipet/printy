import { describe, expect, it } from "vitest";
import { rgbaToBits } from "./convert";

function rgbaPixels(colors: number[][]): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flat());
}

describe("rgbaToBits", () => {
  it("thresholds grayscale and treats transparent pixels as white paper", () => {
    const data = rgbaPixels([
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [127, 127, 127, 255],
      [128, 128, 128, 255],
      [0, 0, 0, 0],
    ]);

    expect(Array.from(rgbaToBits(data, 5, 1, true))).toEqual([1, 0, 1, 0, 0]);
  });

  it("dithers solid black and white consistently", () => {
    const black = new Uint8ClampedArray(8 * 6 * 4);
    const white = new Uint8ClampedArray(8 * 6 * 4);
    for (let i = 0; i < black.length; i += 4) {
      black.set([0, 0, 0, 255], i);
      white.set([255, 255, 255, 255], i);
    }

    expect(Array.from(rgbaToBits(black, 8, 6, false))).toEqual(new Array(48).fill(1));
    expect(Array.from(rgbaToBits(white, 8, 6, false))).toEqual(new Array(48).fill(0));
  });

  it("produces a deterministic, roughly half-dotted 50% gray dither", () => {
    const width = 48;
    const height = 24;
    const gray = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < gray.length; i += 4) gray.set([127, 127, 127, 255], i);

    const first = rgbaToBits(gray, width, height, false);
    const second = rgbaToBits(gray, width, height, false);
    const dotRatio = first.reduce((count, bit) => count + bit, 0) / first.length;

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(dotRatio).toBeGreaterThanOrEqual(0.4);
    expect(dotRatio).toBeLessThanOrEqual(0.6);
  });
});
