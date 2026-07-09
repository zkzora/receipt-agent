import { logger } from '../../../logger.js';
import type { OnchainFinding } from '../../../schema/output.js';
import { fetchJson } from '../http.js';
import { fmtUsd, num } from '../util.js';
import type { LiquiditySignal, ProviderResult } from '../types.js';
import { LP_BURN_THRESHOLD_PCT, RAYDIUM_DEX_IDS } from './util.js';

const log = logger.child({ mod: 'solana-liquidity' });

/**
 * Check B (Solana) — HONESTY/liquidity: DexScreener pairs (same API Base uses,
 * DexScreener is multichain — only the `chainId` filter changes), plus two
 * degen-relevant extras layered on top: whether the project paid DexScreener for
 * a token profile / boost, and the pool's real trading-fee revenue. Kept as a
 * separate near-duplicate of ../liquidity.ts (not a shared/parameterised
 * function) so the live Base pipeline is never touched by this change.
 */
interface DexPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  priceUsd?: string;
  fdv?: number;
  pairCreatedAt?: number;
  liquidity?: { usd?: number };
  baseToken?: { symbol?: string };
  info?: {
    websites?: { url?: string; label?: string }[];
    socials?: { url?: string; type?: string }[];
  };
}

interface DexResponse {
  pairs?: DexPair[] | null;
}

interface DexOrder {
  type?: string;
  status?: string;
  paymentTimestamp?: number;
}
interface DexBoost {
  amount?: number;
}
interface DexOrdersResponse {
  orders?: DexOrder[];
  boosts?: DexBoost[];
}

interface RaydiumPool {
  id?: string;
  burnPercent?: number;
  tvl?: number;
  day?: { volumeFee?: number };
}
interface RaydiumPoolsResponse {
  success?: boolean;
  data?: { data?: RaydiumPool[] };
}

export interface SolanaLiquidityResult extends ProviderResult<LiquiditySignal> {
  /** true = LP burned/locked, false = confirmed unburned, null = unknown (no
   *  Raydium pool found — e.g. Orca-only or a pre-migration pump.fun curve). */
  lpBurnedOrLocked: boolean | null;
}

export async function solanaLiquidityCheck(address: string): Promise<SolanaLiquidityResult> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
  let pairs: DexPair[] = [];
  try {
    const res = await fetchJson<DexResponse>(url, { timeoutMs: 10_000 });
    pairs = (res.pairs ?? []).filter((p) => (p.chainId ?? '').toLowerCase() === 'solana');
  } catch (err) {
    log.warn({ err: String(err), address }, 'DexScreener fetch failed');
    return {
      signal: empty(),
      findings: [{ metric: 'liquidity', value: 'no data', source: 'dexscreener', status: 'unavailable' }],
      lpBurnedOrLocked: null,
    };
  }

  if (pairs.length === 0) {
    return {
      signal: empty(),
      findings: [{ metric: 'liquidity', value: 'no Solana pool (bonding curve or delisted)', source: 'dexscreener', status: 'flag' }],
      lpBurnedOrLocked: null,
    };
  }

  const deepest = pairs.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
  const liquidityUsd = pairs.reduce((sum, p) => sum + (p.liquidity?.usd ?? 0), 0);
  const fdvUsd = num(deepest.fdv);
  const priceUsd = num(deepest.priceUsd);
  const pairAgeDays =
    deepest.pairCreatedAt != null ? Math.max(0, (Date.now() - deepest.pairCreatedAt) / 86_400_000) : null;

  const pairAddresses = pairs.map((p) => p.pairAddress?.toLowerCase()).filter((a): a is string => Boolean(a));
  const links = [
    ...new Set(
      pairs.flatMap((p) => [
        ...(p.info?.websites ?? []).map((w) => w.url),
        ...(p.info?.socials ?? []).map((s) => s.url),
      ]),
    ),
  ].filter((u): u is string => Boolean(u));

  const signal: LiquiditySignal = {
    available: true,
    liquidityUsd,
    fdvUsd,
    priceUsd,
    pairAgeDays,
    dex: deepest.dexId ?? null,
    symbol: deepest.baseToken?.symbol ?? null,
    pairAddresses,
    links,
    provider: 'dexscreener',
  };

  const findings: OnchainFinding[] = [
    {
      metric: 'true TVL',
      value: fmtUsd(liquidityUsd),
      source: 'dexscreener',
      status: liquidityUsd < 5_000 ? 'flag' : 'ok',
    },
  ];
  if (fdvUsd != null) findings.push({ metric: 'FDV', value: fmtUsd(fdvUsd), source: 'dexscreener', status: 'ok' });
  if (pairAgeDays != null) {
    findings.push({
      metric: 'pair age',
      value: pairAgeDays < 1 ? `${Math.round(pairAgeDays * 24)}h` : `${Math.round(pairAgeDays)}d`,
      source: 'dexscreener',
      status: pairAgeDays < 2 ? 'flag' : 'ok',
    });
  }

  // ── Degen extras ──────────────────────────────────────────────────────────
  const [raydium, paid] = await Promise.all([
    raydiumBurnCheck(address, deepest.pairAddress, deepest.dexId),
    dexPaidCheck(address),
  ]);
  if (raydium) {
    findings.push({
      metric: 'LP burned',
      value: `${raydium.burnPercent.toFixed(1)}%`,
      source: 'raydium',
      status: raydium.burnPercent >= LP_BURN_THRESHOLD_PCT ? 'ok' : 'flag',
    });
    if (raydium.volumeFeeUsd != null) {
      findings.push({ metric: 'trading fees (24h)', value: fmtUsd(raydium.volumeFeeUsd), source: 'raydium', status: 'ok' });
    }
  }
  if (paid) {
    findings.push({
      metric: 'dex paid',
      value: paid.tokenProfilePaid ? `yes${paid.activeBoosts > 0 ? ` (+${paid.activeBoosts} boost)` : ''}` : 'no',
      source: 'dexscreener',
      status: 'ok',
    });
  }

  return {
    signal,
    findings,
    lpBurnedOrLocked: raydium ? raydium.burnPercent >= LP_BURN_THRESHOLD_PCT : null,
  };
}

/**
 * LP burn % for the deepest Raydium pool, sourced from Raydium's own pool API —
 * they compute this server-side from the LP mint's real supply history, which is
 * far more reliable than hand-decoding per-DEX pool account layouts (Raydium v4,
 * CPMM and CLMM all differ, and getting an offset wrong would silently produce a
 * false "locked" reading). Returns null for non-Raydium pools (e.g. Orca-only) —
 * unknown rather than guessed.
 */
async function raydiumBurnCheck(
  mint: string,
  preferredPoolId: string | undefined,
  dexId: string | undefined,
): Promise<{ burnPercent: number; volumeFeeUsd: number | null } | null> {
  if (dexId && !RAYDIUM_DEX_IDS.has(dexId)) {
    // Still worth checking — the deepest pool might not be the Raydium one even
    // when a Raydium pool also exists — but skip the extra call when we already
    // know the deepest pool is neither Raydium nor ambiguous (e.g. clearly Orca).
    if (dexId === 'orca') return null;
  }
  try {
    const url = `https://api-v3.raydium.io/pools/info/mint?mint1=${mint}&poolType=all&poolSortField=liquidity&sortType=desc&pageSize=5&page=1`;
    const res = await fetchJson<RaydiumPoolsResponse>(url, { timeoutMs: 8_000 });
    const pools = res.data?.data ?? [];
    if (pools.length === 0) return null;
    const pool =
      pools.find((p) => p.id?.toLowerCase() === preferredPoolId?.toLowerCase()) ??
      pools.reduce((a, b) => ((b.tvl ?? 0) > (a.tvl ?? 0) ? b : a));
    if (pool.burnPercent == null) return null;
    return { burnPercent: pool.burnPercent, volumeFeeUsd: pool.day?.volumeFee ?? null };
  } catch (err) {
    log.warn({ err: String(err), mint }, 'Raydium pool lookup failed');
    return null;
  }
}

/** Whether the project paid DexScreener for a verified token profile and/or is
 *  currently running a paid boost — a real, if soft, "skin in the game" signal
 *  degen traders check for. Informational only; never gates the verdict. */
async function dexPaidCheck(
  mint: string,
): Promise<{ tokenProfilePaid: boolean; activeBoosts: number } | null> {
  try {
    const url = `https://api.dexscreener.com/orders/v1/solana/${mint}`;
    const res = await fetchJson<DexOrdersResponse>(url, { timeoutMs: 8_000 });
    const tokenProfilePaid = (res.orders ?? []).some((o) => o.type === 'tokenProfile' && o.status === 'approved');
    const activeBoosts = (res.boosts ?? []).length;
    return { tokenProfilePaid, activeBoosts };
  } catch (err) {
    log.warn({ err: String(err), mint }, 'DexScreener paid-orders lookup failed');
    return null;
  }
}

function empty(): LiquiditySignal {
  return {
    available: false,
    liquidityUsd: null,
    fdvUsd: null,
    priceUsd: null,
    pairAgeDays: null,
    dex: null,
    symbol: null,
    pairAddresses: [],
    links: [],
    provider: 'dexscreener',
  };
}
