import type { OnchainFinding } from '../../schema/output.js';
import { getTokenSecurity } from './goplus.js';
import { bool01, fmtPct, isSink, num, WHALE_CONCERN_PCT } from './util.js';
import type { HoldersSignal, ProviderResult } from './types.js';

/**
 * Holder concentration. Reuses the (memoised) GoPlus Token Security response so
 * security + holders cost a single network call. Concentration counts only real
 * holders — LP pools, burn/lock addresses, and tagged sinks are excluded so a
 * deep locked-LP token isn't mislabelled as "whale-controlled".
 *
 * `lpAddresses` are the AMM pool addresses DexScreener discovered for this token;
 * they're the reliable backstop for the common case where GoPlus returns a pool
 * as an untagged holder (which otherwise inflates top-5 toward a false whale flag).
 */
export async function holdersCheck(
  address: string,
  lpAddresses: string[] = [],
): Promise<ProviderResult<HoldersSignal>> {
  const t = await getTokenSecurity(address);
  if (!t) {
    return {
      signal: empty(),
      findings: [{ metric: 'holders', value: 'no data', source: 'goplus', status: 'unavailable' }],
    };
  }

  // Addresses that are not "real" holders: the token contract itself, every AMM
  // pool (from DexScreener and from GoPlus's own dex list), plus burn/lock sinks.
  const excluded = new Set<string>([address.toLowerCase(), ...lpAddresses.map((a) => a.toLowerCase())]);
  for (const d of t.dex ?? []) {
    if (d.pair) excluded.add(d.pair.toLowerCase());
  }

  const ranked = (t.holders ?? [])
    .filter((h) => {
      const addr = h.address?.toLowerCase();
      if (addr && excluded.has(addr)) return false;
      return !isSink(h.address, h.tag) && h.is_locked !== 1;
    })
    .map((h) => num(h.percent) ?? 0)
    .sort((a, b) => b - a);

  const top5Fraction = ranked.slice(0, 5).reduce((s, p) => s + p, 0);
  const top5Pct = ranked.length > 0 ? top5Fraction * 100 : null;
  const holderCount = num(t.holder_count);
  // null when we have no LP data at all — "unknown" must not read as "unlocked".
  const lpEntries = t.lp_holders ?? [];
  const lpLocked = lpEntries.length === 0 ? null : lpEntries.some((lp) => bool01(lp.is_locked) === true);

  const signal: HoldersSignal = {
    available: true,
    top5Pct,
    holderCount,
    lpLocked,
    provider: 'goplus',
  };

  const findings: OnchainFinding[] = [];
  if (top5Pct != null) {
    findings.push({
      metric: 'top-5 holders',
      value: fmtPct(top5Pct),
      source: 'goplus',
      status: top5Pct > WHALE_CONCERN_PCT ? 'flag' : 'ok',
    });
  }
  if (holderCount != null) {
    findings.push({
      metric: 'holders',
      value: holderCount.toLocaleString('en-US'),
      source: 'goplus',
      status: holderCount < 50 ? 'flag' : 'ok',
    });
  }
  if (lpLocked != null) {
    findings.push({
      metric: 'LP locked',
      value: lpLocked ? 'yes' : 'NO',
      source: 'goplus',
      status: lpLocked ? 'ok' : 'flag',
    });
  }
  return { signal, findings };
}

function empty(): HoldersSignal {
  return { available: false, top5Pct: null, holderCount: null, lpLocked: null, provider: 'goplus' };
}
