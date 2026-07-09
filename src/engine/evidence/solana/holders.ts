import type { PublicKey } from '@solana/web3.js';
import { unpackAccount } from '@solana/spl-token';
import { logger } from '../../../logger.js';
import type { OnchainFinding } from '../../../schema/output.js';
import type { HoldersSignal, ProviderResult } from '../types.js';
import { fmtPct, WHALE_CONCERN_PCT } from '../util.js';
import { solanaConnection } from './connection.js';
import type { MintInfo } from './mint.js';
import { SOLANA_AMM_PROGRAM_IDS, SOLANA_NULL_ADDRESS } from './util.js';

const log = logger.child({ mod: 'solana-holders' });

/** A single non-AMM wallet above this share is worth calling out as its own
 *  finding, even below the WHALE_CONCERN_PCT aggregate threshold that gates the
 *  verdict — per-task ask: flag any single holder over 10%. */
const SINGLE_WALLET_FLAG_PCT = 10;

/**
 * Check C (Solana) — DISTRIBUTION: `getTokenLargestAccounts` gives the top 20
 * token accounts by balance (we use the top 10, per spec); each is resolved to
 * its owning wallet and excluded from concentration when that owner is an AMM
 * pool vault (owned by a known Raydium/Orca program) or the burn address —
 * mirrors the Base holders check's LP/sink exclusion, adapted to how Solana
 * actually represents pool custody (a PDA owned by the AMM program, not a
 * per-pair address we can list up front).
 */
export async function solanaHoldersCheck(
  mintInfo: MintInfo | null,
  pairAddresses: string[],
  lpBurnedOrLocked: boolean | null,
): Promise<ProviderResult<HoldersSignal>> {
  if (!mintInfo) {
    return {
      signal: empty(lpBurnedOrLocked),
      findings: [{ metric: 'holders', value: 'no data', source: 'solana-rpc', status: 'unavailable' }],
    };
  }

  try {
    const largest = await solanaConnection.getTokenLargestAccounts(mintInfo.address);
    const accounts = largest.value.slice(0, 10);
    if (accounts.length === 0) {
      return {
        signal: { available: true, top5Pct: 0, holderCount: null, lpLocked: lpBurnedOrLocked, provider: 'solana-rpc' },
        findings: [],
      };
    }

    const pairSet = new Set(pairAddresses.map((a) => a.toLowerCase()));
    const tokenAccountInfos = await solanaConnection.getMultipleAccountsInfo(accounts.map((a) => a.address));

    const owned: { owner: PublicKey; amountRaw: bigint }[] = [];
    for (let i = 0; i < accounts.length; i++) {
      const acct = accounts[i];
      const info = tokenAccountInfos[i];
      if (!acct || !info) continue;
      try {
        const unpacked = unpackAccount(acct.address, info, mintInfo.programId);
        owned.push({ owner: unpacked.owner, amountRaw: unpacked.amount });
      } catch {
        // Not a decodable SPL account (shouldn't happen for largest-accounts
        // results, but never let one bad entry sink the whole check).
      }
    }

    const ownerAccountInfos = await solanaConnection.getMultipleAccountsInfo(owned.map((o) => o.owner));
    const supply = mintInfo.mint.supply;

    const nonAmmPct: number[] = [];
    for (const [i, o] of owned.entries()) {
      const { owner, amountRaw } = o;
      const ownerB58 = owner.toBase58();
      const ownerOwningProgram = ownerAccountInfos[i]?.owner.toBase58();
      const isAmmVault =
        (ownerOwningProgram != null && SOLANA_AMM_PROGRAM_IDS.has(ownerOwningProgram)) ||
        pairSet.has(ownerB58.toLowerCase());
      const isBurn = ownerB58 === SOLANA_NULL_ADDRESS;
      if (isAmmVault || isBurn) continue;
      const pct = supply > 0n ? Number((amountRaw * 1_000_000n) / supply) / 10_000 : 0;
      nonAmmPct.push(pct);
    }
    nonAmmPct.sort((a, b) => b - a);
    const top5Pct = nonAmmPct.slice(0, 5).reduce((s, p) => s + p, 0);
    const maxWalletPct = nonAmmPct[0] ?? 0;

    const signal: HoldersSignal = {
      available: true,
      top5Pct,
      holderCount: null,
      lpLocked: lpBurnedOrLocked,
      provider: 'solana-rpc',
    };

    const findings: OnchainFinding[] = [
      {
        metric: 'top-5 holders',
        value: fmtPct(top5Pct),
        source: 'solana-rpc',
        status: top5Pct > WHALE_CONCERN_PCT ? 'flag' : 'ok',
      },
      {
        metric: 'largest non-AMM wallet',
        value: fmtPct(maxWalletPct),
        source: 'solana-rpc',
        status: maxWalletPct > SINGLE_WALLET_FLAG_PCT ? 'flag' : 'ok',
      },
    ];
    return { signal, findings };
  } catch (err) {
    log.warn({ err: String(err), mint: mintInfo.address.toBase58() }, 'getTokenLargestAccounts failed');
    return {
      signal: empty(lpBurnedOrLocked),
      findings: [{ metric: 'holders', value: 'no data', source: 'solana-rpc', status: 'unavailable' }],
    };
  }
}

function empty(lpLocked: boolean | null): HoldersSignal {
  return { available: false, top5Pct: null, holderCount: null, lpLocked, provider: 'solana-rpc' };
}
