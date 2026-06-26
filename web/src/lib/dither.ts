/**
 * Ported verbatim from the landing design's `dither()` — a deterministic
 * Bayer-ish scatter that fades one section colour into the next. Seeded LCG so
 * the pattern is stable across renders.
 */
export interface DitherCell {
  left: string;
  top: string;
  bg: string;
}

export interface Dither {
  bg: string;
  height: string;
  cells: DitherCell[];
}

export function buildDither(scatter: string, bg: string, density = 1): Dither {
  let s = 987654321;
  const rnd = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const d = Math.max(0.2, Math.min(1.5, density));
  const cols = 130;
  const rows = 7;
  const cell = 14;
  const cells: DitherCell[] = [];
  for (let r = 0; r < rows; r++) {
    const p = (1 - r / (rows + 0.5)) * d;
    for (let c = 0; c < cols; c++) {
      if (rnd() < p) {
        cells.push({ left: `${c * cell}px`, top: `${r * cell}px`, bg: scatter });
      }
    }
  }
  return { bg, height: `${rows * cell}px`, cells };
}
