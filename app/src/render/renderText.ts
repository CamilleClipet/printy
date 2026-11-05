import { WIDTH } from "../printer/protocol";
import type { RenderSource } from "./types";

/** In rotated mode, lines wrap at this length (pixels along the paper). */
export const ROTATED_LINE_LENGTH = 800;
const PAD = 8;

export type Align = "left" | "center" | "right";

export type TextOptions = {
  text: string;
  size: number;
  bold: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  font: string;
  align: Align;
  rotated?: boolean;
  /** Line spacing multiplier: 1 (normal), 1.5 or 2 (double). */
  lineSpacing?: number;
};

export type TextRender = RenderSource & {
  /** Font size actually used (rotated text shrinks so its lines fit across the paper). */
  size: number;
};

type Ctx = CanvasRenderingContext2D;

export function wrapLines(m: Pick<Ctx, "measureText">, txt: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of txt.split("\n")) {
    if (!para) { lines.push(""); continue; }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (m.measureText(test).width > maxW && line.trim()) { lines.push(line.trimEnd()); line = word.trimStart(); }
      else line = test;
      while (m.measureText(line).width > maxW && line.length > 1) { // very long words
        let k = line.length; while (k > 1 && m.measureText(line.slice(0, k)).width > maxW) k--;
        lines.push(line.slice(0, k)); line = line.slice(k);
      }
    }
    lines.push(line);
  }
  return lines;
}

const lineHeight = (size: number, spacing = 1) => Math.round(size * 1.25 * spacing);
const fontString = (o: TextOptions, size: number) => `${o.italic ? "italic " : ""}${o.bold ? "700" : "400"} ${size}px ${o.font}`;

function layout(o: TextOptions, txt: string, size: number) {
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = fontString(o, size);
  const maxW = (o.rotated ? ROTATED_LINE_LENGTH : WIDTH) - PAD * 2;
  return { lines: wrapLines(m, txt, maxW), m };
}

export function renderText(o: TextOptions): TextRender | null {
  const txt = o.text.replace(/\s+$/, "");
  if (!txt) return null;

  let size = o.size;
  let { lines, m } = layout(o, txt, size);
  if (o.rotated) { // stacked lines must fit across the paper width
    while (size > 8 && lines.length * lineHeight(size, o.lineSpacing) + 8 > WIDTH) {
      size--;
      ({ lines, m } = layout(o, txt, size));
    }
  }
  const lh = lineHeight(size, o.lineSpacing);
  const blockH = lines.length * lh + 8;
  const blockW = o.rotated
    ? Math.min(ROTATED_LINE_LENGTH, Math.ceil(Math.max(...lines.map((l) => m.measureText(l).width))) + PAD * 2)
    : WIDTH;

  const c = document.createElement("canvas");
  c.width = blockW; c.height = blockH;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000"; ctx.font = fontString(o, size); ctx.textBaseline = "top";
  ctx.textAlign = o.align;
  const x = o.align === "center" ? blockW / 2 : o.align === "right" ? blockW - PAD : PAD;
  const thick = Math.max(1, Math.round(size / (o.bold ? 12 : 16)));
  lines.forEach((line, i) => {
    const y = i * lh + 4;
    ctx.fillText(line, x, y);
    if (!line || !(o.underline || o.strike)) return;
    const w = ctx.measureText(line).width;
    const left = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    if (o.underline) ctx.fillRect(left, y + Math.round(size * 1.02), w, thick);
    if (o.strike) ctx.fillRect(left, y + Math.round(size * 0.55), w, thick);
  });

  if (!o.rotated) return { canvas: c, threshold: true, size };

  // Rotate 90° counter-clockwise: lines run along the paper, stacked across its width.
  const r = document.createElement("canvas");
  r.width = WIDTH; r.height = blockW;
  const rc = r.getContext("2d")!;
  rc.fillStyle = "#fff"; rc.fillRect(0, 0, r.width, r.height);
  const offset = Math.max(0, Math.floor((WIDTH - blockH) / 2)); // center the block across the paper
  rc.translate(offset, blockW);
  rc.rotate(-Math.PI / 2);
  rc.drawImage(c, 0, 0);
  return { canvas: r, threshold: true, size };
}
