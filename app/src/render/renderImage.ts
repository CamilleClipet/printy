import type { RenderSource } from "./types";

export function renderImage(loadedImage: HTMLImageElement | null, width: number): RenderSource | null {
  if (!loadedImage) return null;
  const h = Math.max(1, Math.round(loadedImage.height * width / loadedImage.width));
  const c = document.createElement("canvas");
  c.width = width; c.height = Math.min(h, 4000);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false; // keep pre-dithered pixels sharp when resizing
  ctx.drawImage(loadedImage, 0, 0, width, c.height);
  return { canvas: c, threshold: true };
}
