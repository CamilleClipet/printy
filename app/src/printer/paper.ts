export const PAPER_PRESETS = [57, 80] as const;
export const DEFAULT_PAPER_MM = 57;
export const MIN_PAPER_MM = 40;
export const MAX_PAPER_MM = 110;

export const clampPaperMm = (mm: number): number =>
  Math.min(MAX_PAPER_MM, Math.max(MIN_PAPER_MM, Math.round(mm)));

export function printWidthDots(paperMm: number): number {
  const mm = clampPaperMm(paperMm);
  const printableMm = 48 + (mm - 57) * 24 / 23;
  const dots = printableMm * 8;
  return Math.round(dots / 8) * 8;
}
