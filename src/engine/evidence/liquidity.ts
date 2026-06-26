import { logger } from '../../logger.js';
import type { OnchainFinding } from '../../schema/output.js';
import { fetchJson } from './http.js';
import { fmtUsd, num } from './util.js';
import type { LiquiditySignal, ProviderResult } from './types.js';

const log = logger.child({ mod: 'liquidity' });

/**
 * Check B — liquidity (local fallback; SUBAGENT_LIQUIDITY_SERVICE_ID is blank).
 *
 * Pulls every trading pair for the token from the free DexScreener API, keeps the
 * Base pairs, and reports true on-chain liquidity (summed across Base pairs) plus
 * FDV and the age of the deepest pair. "True TVL" here is what the AMM actually
 * holds — the number shills inflate the most.
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
  /** Project-registered links DexScreener surfaces — official site, docs, repo,
   *  socials. Keyless, authoritative discovery for the off-chain HONESTY pass. */
  info?: {
    websites?: { url?: string; label?: string }[];
    socials?: { url?: string; type?: string }[];
  };
}

interface DexResponse {
  pairs?: DexPair[] | null;
}

export async function liquidityCheck(address: string): Promise<ProviderResult<LiquiditySignal>> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
  let pairs: DexPair[] = [];
  try {
    const res = await fetchJson<DexResponse>(url, { timeoutMs: 10_000 });
    pairs = (res.pairs ?? []).filter((p) => (p.chainId ?? '').toLowerCase() === 'base');
  } catch (err) {
    log.warn({ err: String(err), address }, 'DexScreener fetch failed');
    return {
      signal: empty(),
      findings: [{ metric: 'liquidity', value: 'no data', source: 'dexscreener', status: 'unavailable' }],
    };
  }

  if (pairs.length === 0) {
    return {
      signal: empty(),
      findings: [{ metric: 'liquidity', value: 'no Base pair', source: 'dexscreener', status: 'flag' }],
    };
  }

  // Deepest pair drives FDV/price/age; total liquidity is summed across Base pairs.
  const deepest = pairs.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
  const liquidityUsd = pairs.reduce((sum, p) => sum + (p.liquidity?.usd ?? 0), 0);
  const fdvUsd = num(deepest.fdv);
  const priceUsd = num(deepest.priceUsd);
  const pairAgeDays =
    deepest.pairCreatedAt != null
      ? Math.max(0, (Date.now() - deepest.pairCreatedAt) / 86_400_000)
      : null;

  const pairAddresses = pairs
    .map((p) => p.pairAddress?.toLowerCase())
    .filter((a): a is string => Boolean(a));

  // Project-registered links (deduped) — the off-chain pass fetches these to
  // verify claims; the X/Twitter social is recorded but never fetched downstream.
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
  if (fdvUsd != null) {
    findings.push({ metric: 'FDV', value: fmtUsd(fdvUsd), source: 'dexscreener', status: 'ok' });
  }
  if (pairAgeDays != null) {
    findings.push({
      metric: 'pair age',
      value: pairAgeDays < 1 ? `${Math.round(pairAgeDays * 24)}h` : `${Math.round(pairAgeDays)}d`,
      source: 'dexscreener',
      status: pairAgeDays < 2 ? 'flag' : 'ok',
    });
  }
  return { signal, findings };
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
