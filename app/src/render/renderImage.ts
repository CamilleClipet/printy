import { WIDTH } from "../printer/protocol";
import type { RenderSource } from "./types";

export function renderImage(loadedImage: HTMLImageElement | null): RenderSource | null {
  if (!loadedImage) return null;
  const h = Math.max(1, Math.round(loadedImage.height * WIDTH / loadedImage.width));
  const c = document.createElement("canvas");
  c.width = WIDTH; c.height = Math.min(h, 4000);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false; // keep pre-dithered pixels sharp when resizing
  ctx.drawImage(loadedImage, 0, 0, WIDTH, c.height);
  return { canvas: c, threshold: true };
}
