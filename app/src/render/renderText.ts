import { WIDTH } from "../printer/protocol";
import type { RenderSource } from "./types";

export type TextOptions = {
  text: string;
  size: number;
  bold: boolean;
  font: string;
  centered: boolean;
};

export function renderText({ text, size, bold, font, centered }: TextOptions): RenderSource | null {
  const txt = text.replace(/\s+$/, "");
  if (!txt) return null;
  const fontStr = `${bold ? "700" : "400"} ${size}px ${font}`;
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = fontStr;
  const pad = 8, maxW = WIDTH - pad * 2, lines: string[] = [];
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
  const lh = Math.round(size * 1.25);
  const c = document.createElement("canvas");
  c.width = WIDTH; c.height = lines.length * lh + 8;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000"; ctx.font = fontStr; ctx.textBaseline = "top";
  ctx.textAlign = centered ? "center" : "left";
  const x = centered ? WIDTH / 2 : pad;
  lines.forEach((line, i) => ctx.fillText(line, x, i * lh + 4));
  return { canvas: c, threshold: true };
}
