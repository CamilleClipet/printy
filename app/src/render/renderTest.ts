import { WIDTH } from "../printer/protocol";
import type { RenderSource } from "./types";

export function renderTest(darkness: number): RenderSource {
  const steps = 11, band = 40, head = 44, labelW = 76;
  const c = document.createElement("canvas");
  c.width = WIDTH; c.height = head + steps * band + 8;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000"; ctx.textBaseline = "middle";
  ctx.font = '700 20px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(`Darkness ${darkness}`, 8, head / 2);
  ctx.font = '700 22px "Helvetica Neue", Arial, sans-serif';
  for (let i = 0; i < steps; i++) {
    const pct = i * 10, y = head + i * band;
    ctx.fillStyle = "#000";
    ctx.fillText(`${pct}%`, 8, y + band / 2);
    const g = Math.round(255 * (1 - pct / 100));
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(labelW, y + 2, WIDTH - labelW, band - 4); // thin white gap between bands
  }
  return { canvas: c, threshold: false };
}
