import { fetchJson } from './http.js';
import { BASE_CHAIN_ID } from '../../config.js';
import { logger } from '../../logger.js';

const log = logger.child({ mod: 'goplus' });

/**
 * GoPlus Token Security is the source for BOTH the security and holders streams,
 * so the fetch is memoised briefly to collapse them into a single network call.
 *
 * Anonymous access is used (sufficient for our rate). GOPLUS_APP_KEY/SECRET can
 * raise limits via GoPlus's access-token endpoint (POST /api/v1/token with a
 * sha1(app_key+time+app_secret) signature); wire that here if limits bite.
 */
export interface GoPlusHolder {
  address?: string;
  tag?: string;
  is_contract?: number;
  is_locked?: number;
  percent?: string;
}

/** GoPlus lists the AMM pools it knows about here; `pair` is the pool address. */
export interface GoPlusDex {
  name?: string;
  liquidity?: string;
  pair?: string;
}

export interface GoPlusToken {
  is_honeypot?: string;
  cannot_sell_all?: string;
  buy_tax?: string;
  sell_tax?: string;
  is_open_source?: string;
  is_proxy?: string;
  is_mintable?: string;
  owner_address?: string;
  can_take_back_ownership?: string;
  hidden_owner?: string;
  transfer_pausable?: string;
  slippage_modifiable?: string;
  trading_cooldown?: string;
  holder_count?: string;
  total_supply?: string;
  holders?: GoPlusHolder[];
  lp_holders?: GoPlusHolder[];
  dex?: GoPlusDex[];
  token_symbol?: string;
  token_name?: string;
}

interface GoPlusResponse {
  code?: number;
  message?: string;
  result?: Record<string, GoPlusToken>;
}

const cache = new Map<string, { at: number; data: GoPlusToken | null }>();
const TTL_MS = 60_000;

export async function getTokenSecurity(address: string): Promise<GoPlusToken | null> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const url = `https://api.gopluslabs.io/api/v1/token_security/${BASE_CHAIN_ID}?contract_addresses=${key}`;
  try {
    const res = await fetchJson<GoPlusResponse>(url, { timeoutMs: 12_000 });
    // GoPlus keys the result map by lowercased address.
    const data = res.result?.[key] ?? null;
    if (!data) log.warn({ address: key }, 'GoPlus has no record for this token');
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    log.warn({ err: String(err), address: key }, 'GoPlus token_security failed');
    cache.set(key, { at: Date.now(), data: null });
    return null;
  }
}
