/**
 * Small coercion + formatting helpers for evidence providers. Upstream APIs
 * (GoPlus, DexScreener, Basescan) return numbers as strings and booleans as
 * "0"/"1"; these normalise that into typed values and human strings for the
 * receipt. All return `null` rather than guess when a value is missing.
 */

export function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

/** GoPlus-style "0"/"1" flag → boolean (null when absent/unknown). */
export function bool01(v: unknown): boolean | null {
  if (v == null || v === '') return null;
  return String(v) === '1';
}

/** GoPlus returns taxes/percentages as a fraction string ("0.04" = 4%). */
export function pctFromFraction(v: unknown): number | null {
  const n = num(v);
  return n == null ? null : n * 100;
}

export function fmtUsd(n: number | null): string {
  if (n == null) return 'n/a';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtPct(n: number | null): string {
  if (n == null) return 'n/a';
  return `${n.toFixed(n < 10 ? 1 : 0)}%`;
}

export function shortAddr(addr: string | null): string {
  if (!addr) return 'unknown';
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** Known sinks that shouldn't count toward holder concentration. */
const BURN_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
]);

/**
 * Shared AMM infrastructure that custodies token liquidity but is NOT a holder.
 * The critical one on Base is the Uniswap v4 PoolManager singleton: it holds the
 * liquidity of every v4 pool, so on a v4 token it appears as a 50–90% "holder".
 * DexScreener/GoPlus only expose the 32-byte v4 poolId (not this 20-byte address),
 * so per-pair exclusion can't catch it — it must be listed explicitly or nearly
 * every modern Base token false-flags as whale-concentrated. Verified empirically:
 * it is the top holder across unrelated Base v4 tokens (75–93%).
 */
export const AMM_INFRA_ADDRESSES = new Set([
  '0x498581ff718922c3f8e6a244956af099b2652b2b', // Uniswap v4 PoolManager (Base)
]);

export function isSink(address: string | undefined, tag: string | undefined): boolean {
  const addr = address?.toLowerCase();
  if (addr && (BURN_ADDRESSES.has(addr) || AMM_INFRA_ADDRESSES.has(addr))) return true;
  if (tag && /burn|lock|null|dead|uniswap|pancake|aerodrome|pool/i.test(tag)) return true;
  return false;
}

/**
 * Top-5 holder-concentration tiers (LP pools and sinks already excluded). Small
 * caps routinely sit in the 60–85% band early on — that's high-but-normal, worth
 * surfacing yet NOT a verdict flag on its own. Only concentration above CONCERN
 * is a genuine dump/rug risk that should count against the verdict.
 */
export const WHALE_NOTE_PCT = 60;
export const WHALE_CONCERN_PCT = 85;
