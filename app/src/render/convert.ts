import { WIDTH } from "../printer/protocol";
import type { RenderedPrint, RenderSource } from "./types";

export function rgbaToBits(data: Uint8ClampedArray, width: number, height: number, threshold: boolean): Uint8Array {
  const n = width * height;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255; // transparent counts as white paper
    const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    gray[i] = g * a + 255 * (1 - a);
  }
  const bits = new Uint8Array(n);
  if (!threshold) { // only the test strip is dithered here
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, old = gray[i], val = old < 128 ? 0 : 255, err = old - val;
      bits[i] = val === 0 ? 1 : 0;
      if (x + 1 < width) gray[i + 1] += err * 7 / 16;
      if (y + 1 < height) {
        if (x > 0) gray[i + width - 1] += err * 3 / 16;
        gray[i + width] += err * 5 / 16;
        if (x + 1 < width) gray[i + width + 1] += err / 16;
      }
    }
  } else {
    for (let i = 0; i < n; i++) bits[i] = gray[i] < 128 ? 1 : 0;
  }
  return bits;
}

export function convertToBits(src: RenderSource): RenderedPrint {
  const { canvas, threshold } = src;
  const ctx = canvas.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, WIDTH, canvas.height);
  return { bits: rgbaToBits(data, WIDTH, canvas.height, threshold), height: canvas.height };
}
