import { PublicKey } from '@solana/web3.js';
import { logger } from '../../../logger.js';
import { solanaConnection } from './connection.js';

const log = logger.child({ mod: 'solana-launch' });

// Empirically, even a 2h-old, $39K-liquidity pump.fun token can already exceed
// 5,000 signatures on its mint account (bonding-curve bot/sniper trade volume
// adds up fast) — 5 pages was too tight to reach genesis on real fresh tokens,
// not just old blue-chips. 20 pages still stays well short of a token like
// BONK's tens of millions of signatures, so that case still correctly (and
// quickly) degrades to unavailable rather than hanging.
const MAX_PAGES = 20;
const PAGE_SIZE = 1000;

export interface LaunchInfo {
  signature: string;
  slot: number;
  creator: PublicKey | null;
  blockTime: number | null;
}

/**
 * Resolve the mint's earliest known transaction — its slot (needed to cluster
 * same-slot "bundle" buyers) and fee payer (the deployer). Bounded to
 * MAX_PAGES * PAGE_SIZE signatures rather than paginating to genesis: a
 * heavily-traded token (millions of txs touch the mint account) would
 * otherwise take many minutes to walk back. Past the bound this returns null —
 * honestly unavailable rather than a guess from partial history. Works well
 * for the fresh/small launches degen scanning targets most, and degrades
 * gracefully for old, high-volume tokens. Shared by the deployer and
 * bundle-detection checks so neither re-runs this scan independently.
 */
export async function findLaunchInfo(mint: PublicKey): Promise<LaunchInfo | null> {
  const oldest = await findOldestSignature(mint);
  if (!oldest) {
    log.info({ mint: mint.toBase58() }, 'launch lookup gave up — tx history exceeds scan bound');
    return null;
  }
  try {
    const tx = await solanaConnection.getTransaction(oldest, { maxSupportedTransactionVersion: 0 });
    if (!tx) return null;
    // The fee payer (index 0) is always a static key, present on both legacy
    // and v0 messages without needing Address Lookup Table resolution — but
    // `.getAccountKeys()` throws for any v0 tx with unresolved ALT references
    // regardless, since it eagerly tries to resolve the *dynamically* loaded
    // keys too. Read the static key directly instead.
    const message = tx.transaction.message;
    const feePayer = message.version === 'legacy' ? message.accountKeys[0] : message.staticAccountKeys[0];
    const creator = feePayer ?? null;
    return { signature: oldest, slot: tx.slot, creator, blockTime: tx.blockTime ?? null };
  } catch (err) {
    log.warn({ err: String(err) }, 'failed to fetch creation transaction');
    return null;
  }
}

/** Returns the oldest signature found within the bound, or null when the bound
 *  was exhausted without reaching genesis (never a partial/unverified guess). */
async function findOldestSignature(mint: PublicKey): Promise<string | null> {
  let before: string | undefined;
  let oldest: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    let sigs;
    try {
      sigs = await solanaConnection.getSignaturesForAddress(mint, { limit: PAGE_SIZE, before });
    } catch (err) {
      log.warn({ err: String(err) }, 'getSignaturesForAddress failed');
      return null;
    }
    const last = sigs[sigs.length - 1];
    if (!last) break;
    oldest = last.signature;
    if (sigs.length < PAGE_SIZE) return oldest; // reached genesis within the bound
    before = oldest;
  }
  return null; // exhausted the bound without reaching genesis
}
