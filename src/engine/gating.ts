import type { AxisResult, ClaimCheck, Confidence, OffchainSnapshot, Verdict } from '../schema/output.js';
import type { Evidence } from './evidence/index.js';
import type { Judgement } from './judge.js';
import { fmtPct, fmtUsd, WHALE_CONCERN_PCT, WHALE_NOTE_PCT } from './evidence/util.js';

export interface Gate {
  verdict: Verdict;
  confidence: Confidence;
  caveats: string;
  /** The verdict decomposed into independent axes (SAFETY/HONESTY/DISTRIBUTION). */
  axes: AxisResult[];
  /** Per-claim line items (the printed receipt). */
  claimChecks: ClaimCheck[];
}

/** Liquidity below this is treated as effectively un-exitable (SPEC threshold). */
const MIN_LIQUIDITY_USD = 5_000;
const MIN_SECURITY_SCORE = 60;

/**
 * Deterministic verdict — the rubber stamp. The LLM judge proposes; this decides.
 * Hard on-chain facts (honeypot, un-sellable, sub-$5k liquidity, failed security
 * score) force BULLSHIT regardless of what the model said, so the verdict can
 * never be talked out of a scam. The judge can only soften an otherwise-clean
 * BASED to MIXED, never the reverse.
 */
export function gate(
  evidence: Evidence,
  judgement: Judgement | null,
  claims: string[],
  offchain: OffchainSnapshot | null = null,
): Gate {
  const { security, liquidity, holders } = evidence;

  // ── Data sufficiency: with no security AND no liquidity we can't verify. ──
  if (!security.available && !liquidity.available) {
    return {
      verdict: 'INSUFFICIENT',
      confidence: 'LOW',
      caveats: 'Token not found on Base data sources (GoPlus / DexScreener) — nothing to verify against.',
      axes: [
        { axis: 'SAFETY', status: 'UNKNOWN', detail: 'no on-chain data' },
        { axis: 'HONESTY', status: 'UNKNOWN', detail: 'nothing to verify against' },
        { axis: 'DISTRIBUTION', status: 'UNKNOWN', detail: 'no holder data' },
      ],
      claimChecks: applyOffchain(buildClaimChecks(claims, evidence), offchain).checks,
    };
  }

  const flags: string[] = [];

  // ── Hard fails → BULLSHIT outright. ──────────────────────────────────────
  const honeypot = security.isHoneypot === true || security.cannotSell === true;
  const extremeTax = (security.sellTaxPct ?? 0) >= 50;
  const noLiquidity = liquidity.available && (liquidity.liquidityUsd ?? 0) < MIN_LIQUIDITY_USD;
  const failedScore = security.securityScore != null && security.securityScore < MIN_SECURITY_SCORE;

  if (honeypot) flags.push('honeypot / cannot sell');
  if (extremeTax) flags.push('extreme sell tax');
  if (noLiquidity) flags.push(`liquidity ${fmtUsd(liquidity.liquidityUsd)} below ${fmtUsd(MIN_LIQUIDITY_USD)}`);
  if (failedScore) flags.push(`security score ${security.securityScore}/100`);

  // ── Soft flags → accumulate toward RED_FLAGS / MIXED. ────────────────────
  // Note: absence of a locker is the default for deep, legit tokens, so an
  // unlocked LP is NOT a standalone flag — it only matters as a claim
  // contradiction on shallow/young pools (see claimContradictions).
  //
  // Unverified source is NOT flagged here: it's common for legit Base tokens
  // (factory/clanker deploys), it's already priced into the security score
  // (−25, which still gates to BULLSHIT once stacked with real risk), and it's
  // shown as its own finding. Lying about it ("audited") is caught as a claim
  // contradiction below. Whale concentration only counts past the CONCERN tier;
  // the high-but-normal 60–85% band is surfaced as a finding, not a verdict flag.
  if ((holders.top5Pct ?? 0) > WHALE_CONCERN_PCT) flags.push(`top-5 hold ${Math.round(holders.top5Pct ?? 0)}%`);
  flags.push(...claimContradictions(claims, evidence));

  // Off-chain evidence (the project's own pages) can only enrich HONESTY: it
  // upgrades claims on-chain couldn't judge, and a contradiction it finds adds at
  // most ONE soft flag (web+LLM evidence is softer than chain reads, so it can
  // nudge BASED→MIXED but never force BULLSHIT and never clear a SAFETY fail).
  const { checks: claimChecks, offchainContradictions } = applyOffchain(
    buildClaimChecks(claims, evidence),
    offchain,
  );
  if (offchainContradictions > 0) flags.push('off-chain: claim not backed by project pages');

  const confidence = deriveConfidence(evidence, judgement);

  let verdict: Verdict;
  if (honeypot || extremeTax || noLiquidity || failedScore) {
    verdict = 'BULLSHIT';
  } else if (flags.length >= 2) {
    verdict = 'RED_FLAGS';
  } else if (flags.length === 1) {
    verdict = 'MIXED';
  } else {
    verdict = 'BASED';
  }

  // Judge may soften a clean pass when it sees something we didn't encode,
  // but it can never upgrade a flagged token.
  if (verdict === 'BASED' && judgement && (judgement.lean === 'MIXED' || judgement.lean === 'RED_FLAGS')) {
    verdict = 'MIXED';
  }

  const axes = buildAxes(evidence, claimChecks, {
    honeypot,
    extremeTax,
    noLiquidity,
    failedScore,
  });

  return { verdict, confidence, caveats: caveatsFor(verdict, judgement, flags), axes, claimChecks };
}

/**
 * Fold off-chain assessments into the on-chain claim checks. On-chain verdicts
 * are authoritative and never overridden; off-chain only resolves what the chain
 * left UNVERIFIABLE (e.g. "backed by tier-1", "audited by X"). Returns the merged
 * checks plus the count of claims off-chain newly contradicted (for the gate flag).
 */
function applyOffchain(
  checks: ClaimCheck[],
  offchain: OffchainSnapshot | null,
): { checks: ClaimCheck[]; offchainContradictions: number } {
  if (!offchain || offchain.assessments.length === 0) return { checks, offchainContradictions: 0 };
  const byClaim = new Map(offchain.assessments.map((a) => [a.claim, a]));
  let offchainContradictions = 0;

  const merged = checks.map((c) => {
    if (c.status !== 'UNVERIFIABLE') return c; // on-chain wins
    const a = byClaim.get(c.claim);
    if (!a || a.status === 'unverifiable') return c;
    const src = a.source_url ? ` (${hostOf(a.source_url)})` : '';
    if (a.status === 'contradicted') {
      offchainContradictions += 1;
      return { claim: c.claim, status: 'FALSE' as const, note: offchainNote(a.evidence, 'not backed by project pages', src) };
    }
    return { claim: c.claim, status: 'TRUE' as const, note: offchainNote(a.evidence, 'backed by project pages', src) };
  });
  return { checks: merged, offchainContradictions };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

/** Keep the off-chain reason short enough for one receipt line-item. */
function offchainNote(evidence: string, fallback: string, src: string): string {
  let ev = (evidence || fallback).replace(/\s+/g, ' ').trim();
  if (ev.length > 90) ev = `${ev.slice(0, 89)}…`;
  return `${ev}${src}`;
}

/**
 * Decompose the evidence into the three independent display axes. This is a
 * presentation layer over the same signals the verdict ladder already used — it
 * never changes the stamp, it just shows *why* a token reads the way it does so
 * a safe-but-overhyped token stops looking like a scam.
 */
function buildAxes(
  e: Evidence,
  checks: ClaimCheck[],
  hard: { honeypot: boolean; extremeTax: boolean; noLiquidity: boolean; failedScore: boolean },
): AxisResult[] {
  return [safetyAxis(e, hard), honestyAxis(checks), distributionAxis(e)];
}

function safetyAxis(
  e: Evidence,
  hard: { honeypot: boolean; extremeTax: boolean; noLiquidity: boolean; failedScore: boolean },
): AxisResult {
  const s = e.security;
  if (!s.available && !e.liquidity.available) {
    return { axis: 'SAFETY', status: 'UNKNOWN', detail: 'no on-chain data' };
  }
  if (hard.honeypot) return { axis: 'SAFETY', status: 'FAIL', detail: 'honeypot / cannot sell' };
  if (hard.extremeTax) return { axis: 'SAFETY', status: 'FAIL', detail: `sell tax ${fmtPct(s.sellTaxPct)}` };
  if (hard.noLiquidity) return { axis: 'SAFETY', status: 'FAIL', detail: `liquidity ${fmtUsd(e.liquidity.liquidityUsd)}` };
  if (hard.failedScore) return { axis: 'SAFETY', status: 'FAIL', detail: `security score ${s.securityScore}/100` };
  // Past the hard gate: surface residual mechanics as a caution, not a fail.
  if (s.vulnerabilities.length > 0) {
    return { axis: 'SAFETY', status: 'WARN', detail: s.vulnerabilities.join('; ') };
  }
  const score = s.securityScore != null ? `${s.securityScore}/100` : 'clean';
  return { axis: 'SAFETY', status: 'PASS', detail: `no scam mechanics (${score})` };
}

function honestyAxis(checks: ClaimCheck[]): AxisResult {
  if (checks.length === 0) return { axis: 'HONESTY', status: 'UNKNOWN', detail: 'no claims stated' };
  const lies = checks.filter((c) => c.status === 'FALSE');
  const trues = checks.filter((c) => c.status === 'TRUE');
  if (lies.length > 0) {
    return { axis: 'HONESTY', status: 'FAIL', detail: `${lies.length}/${checks.length} claim(s) contradicted` };
  }
  if (trues.length === 0) {
    return { axis: 'HONESTY', status: 'UNKNOWN', detail: 'claims not on-chain verifiable' };
  }
  return { axis: 'HONESTY', status: 'PASS', detail: `${trues.length}/${checks.length} claim(s) hold up` };
}

function distributionAxis(e: Evidence): AxisResult {
  const top5 = e.holders.top5Pct;
  if (!e.holders.available || top5 == null) {
    return { axis: 'DISTRIBUTION', status: 'UNKNOWN', detail: 'no holder data' };
  }
  const pct = fmtPct(top5);
  if (top5 > WHALE_CONCERN_PCT) return { axis: 'DISTRIBUTION', status: 'WARN', detail: `top-5 hold ${pct}` };
  if (top5 > WHALE_NOTE_PCT) return { axis: 'DISTRIBUTION', status: 'PASS', detail: `top-5 ${pct} (elevated)` };
  return { axis: 'DISTRIBUTION', status: 'PASS', detail: `top-5 ${pct}` };
}

/**
 * Per-claim line items. Each detected claim is checked against on-chain reality
 * and marked TRUE / FALSE / UNVERIFIABLE. The FALSE conditions mirror
 * {@link claimContradictions} (which still feeds the verdict flags) so a claim
 * shown FALSE here is exactly one the stamp already accounted for; everything
 * else we can't check on-chain is honestly marked UNVERIFIABLE rather than
 * assumed true.
 */
function buildClaimChecks(claims: string[], e: Evidence): ClaimCheck[] {
  const shallowOrYoung =
    (e.liquidity.available && (e.liquidity.liquidityUsd ?? Infinity) < 50_000) ||
    (e.liquidity.pairAgeDays != null && e.liquidity.pairAgeDays < 14);

  return claims.map((claim) => {
    const t = claim.toLowerCase();
    const trues: string[] = [];
    const lies: string[] = [];
    const unknowns: string[] = [];

    if (/lock|locked/.test(t)) {
      if (e.holders.lpLocked === true) trues.push('LP lock confirmed');
      else if (e.holders.lpLocked === false && shallowOrYoung) lies.push('LP is not locked');
      else if (e.holders.lpLocked === false) unknowns.push('LP not in a known locker (pool is deep)');
      else unknowns.push('LP lock status unknown');
    }
    if (/(audit|verified|safu|safe)/.test(t)) {
      if (e.security.verified === true) trues.push('contract source verified');
      else if (e.security.verified === false) lies.push('contract is unverified');
      else unknowns.push('verification status unknown');
    }
    if (/renounc/.test(t)) {
      if (e.security.ownerCanMint === false) trues.push('no mint authority');
      else if (e.security.ownerCanMint === true) lies.push('supply is still mintable');
      else unknowns.push('ownership status unknown');
    }

    if (lies.length > 0) return { claim, status: 'FALSE', note: lies.join('; ') };
    if (trues.length > 0) return { claim, status: 'TRUE', note: [...trues, ...unknowns].join('; ') };
    if (unknowns.length > 0) return { claim, status: 'UNVERIFIABLE', note: unknowns.join('; ') };
    return { claim, status: 'UNVERIFIABLE', note: 'no on-chain signal for this claim' };
  });
}

/** Detect claims directly contradicted by evidence (the core "lie" signal). */
function claimContradictions(claims: string[], e: Evidence): string[] {
  const out: string[] = [];
  const text = claims.join(' ').toLowerCase();
  // A "locked LP" claim is only a lie worth flagging where a lock actually
  // protects buyers — i.e. shallow or freshly-created liquidity. Deep, mature
  // pools that simply aren't in a locker are not "rugs waiting to happen".
  const shallowOrYoung =
    (e.liquidity.available && (e.liquidity.liquidityUsd ?? Infinity) < 50_000) ||
    (e.liquidity.pairAgeDays != null && e.liquidity.pairAgeDays < 14);
  if (/lock|locked/.test(text) && e.holders.lpLocked === false && shallowOrYoung) {
    out.push('claims LP locked but it is not');
  }
  if (/(audit|verified|safu)/.test(text) && e.security.verified === false) {
    out.push('claims audited but contract is unverified');
  }
  if (/renounc/.test(text) && e.security.ownerCanMint === true) {
    out.push('claims renounced but supply is still mintable');
  }
  return out;
}

function deriveConfidence(e: Evidence, j: Judgement | null): Confidence {
  const have = [e.security.available, e.liquidity.available, e.holders.available, e.deployer.available].filter(
    Boolean,
  ).length;
  let base: Confidence;
  if (e.security.available && e.liquidity.available && have >= 3) base = 'HIGH';
  else if (e.security.available || e.liquidity.available) base = 'MEDIUM';
  else base = 'LOW';
  // Never report higher confidence than the judge when it weighed in.
  if (j) return weakest(base, j.confidence);
  return base;
}

function weakest(a: Confidence, b: Confidence): Confidence {
  const rank: Record<Confidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return rank[a] <= rank[b] ? a : b;
}

function caveatsFor(verdict: Verdict, j: Judgement | null, flags: string[]): string {
  if (verdict === 'MIXED' || verdict === 'INSUFFICIENT') {
    const note = j?.caveats || j?.summary || '';
    const flagNote = flags.length ? `Flags: ${flags.join('; ')}.` : '';
    return [note, flagNote].filter(Boolean).join(' ').trim() || 'Mixed signals — verify manually.';
  }
  // For decisive verdicts the stamp + findings carry the message; keep caveats
  // to genuine data-gap disclaimers (suppressed on the receipt unless hedged).
  return j?.caveats ?? '';
}
