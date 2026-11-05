import { WIDTH } from "../printer/protocol";
import type { RenderSource } from "./types";

/** Blank-space presets, in printer rows (200 dpi ≈ 8 rows per mm). "small" adds nothing beyond the default margin. */
export const SPACING = { small: 0, medium: 40, large: 120 } as const;
export type Spacing = keyof typeof SPACING;
export const SPACING_LABELS: Record<Spacing, string> = { small: "Small", medium: "Medium", large: "Large" };

export function addPadding(src: RenderSource, top: Spacing, bottom: Spacing): RenderSource {
  const t = SPACING[top], b = SPACING[bottom];
  if (!t && !b) return src;
  const c = document.createElement("canvas");
  c.width = WIDTH; c.height = src.canvas.height + t + b;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src.canvas, 0, t);
  return { ...src, canvas: c };
}
