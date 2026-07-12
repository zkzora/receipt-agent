import type {
  AxisResult,
  ClaimCheck,
  Confidence,
  OffchainSnapshot,
  OnchainFinding,
  ScanMode,
  Verdict,
} from '../schema/output.js';
import { VERDICT_COLORS, VERDICT_LABELS } from '../schema/output.js';

/** Header badge per scan tier. `full` (the flagship verify) prints no badge. */
const SCAN_LABELS: Record<ScanMode, string> = {
  full: '',
  degen: 'DEGEN SCAN',
  lp: 'LP SCAN',
};
import type { Attestation } from '../cap/types.js';

/** Inner monospace width of the printed receipt body, in characters. */
const WIDTH = 30;

export interface ReceiptModel {
  subject: string;
  addressLine: string;
  sourceLine: string;
  /** Scan-tier badge for the header; empty for the flagship `full` verify. */
  scanLabel: string;
  /** One-line project narrative (from off-chain sources); empty when none. */
  narrative: string;
  claims: string[];
  claimChecks: ClaimCheck[];
  reality: string[];
  deployer: string[];
  offchain: OffchainSnapshot | null;
  axes: AxisResult[];
  verdict: Verdict;
  verdictLabel: string;
  color: string;
  confidence: Confidence;
  note: string;
  attestedLine: string;
}

/** Shorten a 0x address to `0x9f2a…0c81`. */
export function shortAddr(addr: string | null | undefined): string {
  if (!addr) return '—';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Shorten a hash to `0x7c…e4`. */
function shortHash(hash: string): string {
  if (hash.length <= 8) return hash;
  return `${hash.slice(0, 4)}…${hash.slice(-2)}`;
}

/** `label ...... value` dot-leader, wrapping the value if the line overflows. */
function leader(label: string, value: string, width = WIDTH): string[] {
  const dots = Math.max(2, width - label.length - value.length - 2);
  const line = `${label} ${'.'.repeat(dots)} ${value}`;
  if (line.length <= width + 2) return [line];
  // Overflow → label on its own line, value indented underneath.
  return [`${label}`, `  ${'.'.repeat(Math.max(2, width - value.length - 2))} ${value}`];
}

/** Word-wrap a free-text claim into `  > "..."` continuation lines. */
function wrapClaim(claim: string, width = WIDTH - 4): string[] {
  const words = claim.replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) {
      out.push(cur.trim());
      cur = w;
    } else {
      cur = `${cur} ${w}`;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out
    .map((l, i) => (i === 0 ? `  > "${l}` : `     ${l}`))
    .map((l, i, a) => (i === a.length - 1 ? `${l}"` : l));
}

function realityLine(f: OnchainFinding): string[] {
  const tag = f.status === 'unavailable' ? 'UNAVAILABLE' : f.value;
  return leader(`  > ${f.metric}`, tag);
}

/** Generic word-wrap into plain segments no wider than `max`. */
function wrapAt(text: string, max: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      out.push(cur.trim());
      cur = w;
    } else {
      cur = `${cur} ${w}`;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** One claim line-item: the quoted claim, then its [STATUS] + reason underneath. */
function claimCheckLines(c: ClaimCheck): string[] {
  const out = wrapClaim(c.claim);
  const head = `[${c.status}]${c.note ? ` ${c.note}` : ''}`;
  for (const l of wrapAt(head, WIDTH - 4)) out.push(`    ${l}`);
  return out;
}

/** One axis breakdown line: `  SAFETY .......... PASS`. */
function axisLine(a: AxisResult): string[] {
  return leader(`  ${a.axis}`, a.status);
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? url;
  }
}

/** Provenance trail: which public pages were read, and the X link left untouched. */
function offchainLines(o: OffchainSnapshot): string[] {
  const out: string[] = [' SOURCES CHECKED'];
  for (const s of o.sources) {
    out.push(...leader(`  > ${hostLabel(s.url)}`, s.fetched ? '[read]' : '[no read]'));
  }
  for (const u of o.skipped) {
    out.push(...leader(`  > ${hostLabel(u)}`, '[X·ref]'));
  }
  return out;
}

export interface BuildModelArgs {
  subject: string;
  subjectAddress: string | null;
  /** Which chain the subject lives on — drives the "(Base)"/"(Solana)" address
   *  suffix. Defaults to 'base' so existing callers keep compiling/rendering
   *  identically without having to pass it. */
  chain?: 'base' | 'solana';
  /** Scan tier — drives the header badge. Defaults to `full` (no badge). */
  scanMode?: ScanMode;
  /** Project narrative read from its own pages; shown as a NARRATIVE block. */
  narrative?: string | null;
  sourceUrl: string | null;
  isManual: boolean;
  claims: string[];
  claimChecks?: ClaimCheck[];
  findings: OnchainFinding[];
  deployer: { fact: string }[];
  offchain?: OffchainSnapshot | null;
  axes?: AxisResult[];
  verdict: Verdict;
  confidence: Confidence;
  note: string;
  attestation: Attestation;
}

export function buildReceiptModel(a: BuildModelArgs): ReceiptModel {
  const ts = new Date(a.attestation.timestamp);
  const hhmm = `${String(ts.getUTCHours()).padStart(2, '0')}:${String(ts.getUTCMinutes()).padStart(
    2,
    '0',
  )}Z`;

  const chainLabel = a.chain === 'solana' ? 'Solana' : 'Base';
  return {
    subject: a.subject,
    addressLine: `${shortAddr(a.subjectAddress)}${a.subjectAddress ? ` (${chainLabel})` : ''}`,
    scanLabel: a.scanMode ? SCAN_LABELS[a.scanMode] : '',
    narrative: a.narrative ?? '',
    sourceLine: a.sourceUrl
      ? a.sourceUrl.replace(/^https?:\/\//, '').slice(0, WIDTH - 2)
      : a.isManual
        ? 'manual claim'
        : '—',
    claims: a.claims.flatMap((c) => wrapClaim(c)),
    claimChecks: a.claimChecks ?? [],
    reality: a.findings.flatMap(realityLine),
    deployer: a.deployer.flatMap((d) => leader('  > deployer', d.fact)),
    offchain: a.offchain ?? null,
    axes: a.axes ?? [],
    verdict: a.verdict,
    verdictLabel: VERDICT_LABELS[a.verdict],
    color: VERDICT_COLORS[a.verdict],
    confidence: a.confidence,
    note: a.note,
    attestedLine: `attested ${shortHash(a.attestation.hash)} @ ${hhmm}`,
  };
}

/** Flatten a model into the full set of printed body lines (between perforations). */
export function modelToLines(m: ReceiptModel): string[] {
  // Em dashes (U+2014, in the latin font subset) — box-drawing (─) is not, and
  // would render as tofu in the PNG. Reads as a clean receipt hairline.
  const rule = '—'.repeat(WIDTH);
  const lines: string[] = [];
  lines.push(rule);
  lines.push(` SUBJECT : ${m.subject}`);
  lines.push(` ADDRESS : ${m.addressLine}`);
  lines.push(` SOURCE  : ${m.sourceLine}`);
  if (m.scanLabel) lines.push(` SCAN    : ${m.scanLabel}`);
  lines.push(rule);
  if (m.narrative) {
    lines.push(' NARRATIVE');
    for (const l of wrapAt(m.narrative, WIDTH - 3)) lines.push(`  ${l}`);
    lines.push(rule);
  }
  if (m.claimChecks.length) {
    lines.push(' CLAIMS CHECKED');
    for (const c of m.claimChecks) lines.push(...claimCheckLines(c));
    lines.push(rule);
  } else if (m.claims.length) {
    lines.push(' CLAIM DETECTED');
    lines.push(...m.claims);
    lines.push(rule);
  }
  lines.push(' ON-CHAIN REALITY');
  lines.push(...(m.reality.length ? m.reality : ['  > no on-chain data available']));
  if (m.deployer.length) {
    lines.push(...m.deployer);
  }
  if (m.offchain && (m.offchain.sources.length || m.offchain.skipped.length)) {
    lines.push(rule);
    lines.push(...offchainLines(m.offchain));
  }
  lines.push(rule);
  lines.push(` VERDICT    [ ${m.verdictLabel} ]`);
  for (const a of m.axes) lines.push(...axisLine(a));
  lines.push(` CONFIDENCE   ${m.confidence}`);
  if (m.note) {
    for (const nl of wrapNote(m.note)) lines.push(nl);
  }
  lines.push(rule);
  lines.push(` ${m.attestedLine}`);
  lines.push(' not financial advice');
  lines.push(rule);
  return lines;
}

function wrapNote(note: string): string[] {
  const words = ('NOTE: ' + note).split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > WIDTH) {
      out.push(` ${cur.trim()}`);
      cur = w;
    } else cur = `${cur} ${w}`;
  }
  if (cur.trim()) out.push(` ${cur.trim()}`);
  return out;
}
