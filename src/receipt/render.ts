import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { logger } from '../logger.js';
import type { ReceiptModel } from './format.js';
import { ReceiptTemplate } from './template.js';

const log = logger.child({ mod: 'render' });
const require = createRequire(import.meta.url);

/**
 * Resolve a font file shipped by an @fontsource package. We read the raw .ttf
 * so rendering needs no network and is reproducible. `@fontsource/*` ships the
 * files under `<pkg>/files/*.ttf`.
 */
async function loadFont(pkgFile: string): Promise<Buffer> {
  const path = require.resolve(pkgFile);
  return readFile(path);
}

let fontCache: Awaited<ReturnType<typeof loadFonts>> | null = null;

async function loadFonts() {
  const [mono, monoBold, interBlack] = await Promise.all([
    // @fontsource ships only .woff/.woff2 (no .ttf); satori reads .woff fine.
    loadFont('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff'),
    loadFont('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff').catch(
      () => null,
    ),
    loadFont('@fontsource/inter/files/inter-latin-900-normal.woff').catch(() => null),
  ]);
  return { mono, monoBold, interBlack };
}

/** Render a receipt model to a PNG buffer (transparent margin around the card). */
export async function renderReceiptPng(model: ReceiptModel): Promise<Uint8Array> {
  fontCache ??= await loadFonts();
  const { mono, monoBold, interBlack } = fontCache;

  const fonts: Parameters<typeof satori>[1]['fonts'] = [
    { name: 'JetBrains Mono', data: mono, weight: 400, style: 'normal' },
  ];
  if (monoBold)
    fonts.push({ name: 'JetBrains Mono', data: monoBold, weight: 700, style: 'normal' });
  if (interBlack) fonts.push({ name: 'Inter', data: interBlack, weight: 900, style: 'normal' });

  const svg = await satori(ReceiptTemplate(model) as never, {
    width: 560,
    fonts,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1120 }, // 2x for crisp screenshots
    background: 'rgba(0,0,0,0)',
  });
  const png = resvg.render().asPng();
  log.debug({ bytes: png.byteLength, verdict: model.verdict }, 'rendered receipt png');
  return png;
}

export type { ReceiptModel };
