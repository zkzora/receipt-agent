import { useMemo } from 'react';
import { buildDither } from '../lib/dither.ts';

/** Dithered colour transition band between two adjacent sections. */
export function Dither({ scatter, bg }: { scatter: string; bg: string }) {
  const d = useMemo(() => buildDither(scatter, bg), [scatter, bg]);
  return (
    <div aria-hidden className="dither" style={{ height: d.height, background: d.bg }}>
      {d.cells.map((c, i) => (
        <span key={i} className="dither__cell" style={{ left: c.left, top: c.top, background: c.bg }} />
      ))}
    </div>
  );
}
