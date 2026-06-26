import type { ReceiptModel } from './format.js';
import { modelToLines } from './format.js';

/**
 * Satori receipt template. This is a plain element tree (satori renders it to
 * SVG — there is no React runtime / DOM here). Aesthetic mirrors the landing
 * design: off-white paper, JetBrains Mono body, blue perforated edges, and an
 * off-register rubber-stamp verdict.
 */

const PAPER = '#F2F0E9';
const INK = '#0A0A0A';
const BLUE = '#0026FF';
const MUTED = '#444444';

const CARD_W = 520;
const PAD_X = 26;

function Perforation() {
  const squares = Math.floor((CARD_W - PAD_X * 2) / 14) + 2;
  return {
    type: 'div',
    props: {
      style: { display: 'flex', height: 8, marginTop: 4, marginBottom: 4 },
      children: Array.from({ length: squares }, (_v, i) => ({
        type: 'div',
        key: i,
        props: { style: { width: 7, height: 8, marginRight: 7, backgroundColor: BLUE } },
      })),
    },
  };
}

function Line(text: string, key: number) {
  return {
    type: 'div',
    key,
    props: {
      style: {
        fontFamily: 'JetBrains Mono',
        fontSize: 14,
        lineHeight: 1.5,
        color: INK,
        whiteSpace: 'pre',
      },
      children: text.length === 0 ? ' ' : text,
    },
  };
}

export function ReceiptTemplate(model: ReceiptModel) {
  const lines = modelToLines(model);

  return {
    type: 'div',
    props: {
      style: {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: CARD_W,
        backgroundColor: PAPER,
        padding: `18px ${PAD_X}px 22px`,
        fontFamily: 'JetBrains Mono',
      },
      children: [
        Perforation(),
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'JetBrains Mono',
              fontWeight: 700,
              fontSize: 16,
              color: INK,
              marginTop: 6,
            },
            children: [
              // The '▮' brand mark rendered as a block — box-drawing/geometric
              // glyphs aren't in the latin font subset (they tofu in the PNG).
              { type: 'div', props: { style: { width: 5, height: 15, backgroundColor: INK } } },
              { type: 'div', props: { children: 'RECEIPT.AI' } },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { fontFamily: 'JetBrains Mono', fontSize: 12, color: MUTED, marginBottom: 6 },
            children: 'show me the receipts',
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column' },
            children: lines.map((l, i) => Line(l, i)),
          },
        },
        Perforation(),
        // Rubber stamp — absolutely positioned, off-register, rotated.
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              right: 22,
              bottom: 74,
              display: 'flex',
              fontFamily: 'Inter',
              fontWeight: 900,
              fontSize: model.verdictLabel.length > 8 ? 22 : 30,
              letterSpacing: '-0.02em',
              color: model.color,
              border: `3px solid ${model.color}`,
              padding: '4px 10px',
              transform: 'rotate(-7deg)',
              opacity: 0.92,
            },
            children: model.verdictLabel,
          },
        },
      ],
    },
  };
}

export type ReceiptElement = ReturnType<typeof ReceiptTemplate>;
