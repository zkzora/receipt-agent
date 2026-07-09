import type { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { logger } from '../../../logger.js';
import type { DeployerFinding, OnchainFinding } from '../../../schema/output.js';
import type { DeployerSignal } from '../types.js';
import { shortAddr } from '../util.js';
import { solanaConnection } from './connection.js';
import type { MintInfo } from './mint.js';
import type { LaunchInfo } from './launch.js';

const log = logger.child({ mod: 'solana-deployer' });

export interface DeployerResult {
  signal: DeployerSignal;
  findings: DeployerFinding[];
  /** Surfaced separately from DeployerFinding (which is deliberately fact-only,
   *  no `status`) since "dev sold" is worth a flag/ok status on the receipt. */
  onchainFindings: OnchainFinding[];
}

/** Bound on the creator ATA's own tx history scan — a single wallet's activity
 *  on one token is normally small, unlike the mint account's (touched by every
 *  trader), so this can stay tight without missing real sell/transfer history. */
const ATA_HISTORY_LIMIT = 50;
/** Ignore balance dips below this share of the historical peak — rounding /
 *  dust, not a real sell. */
const SOLD_DUST_FRACTION = 0.001;

/**
 * Check D (Solana) — creator/deployer facts, best-effort, built on the shared
 * {@link LaunchInfo} lookup (bounded scan — see launch.ts for why).
 *
 * Deliberately stops at facts we can actually verify: the creator's *current*
 * SOL balance, % of supply still held, and whether their balance has EVER
 * dropped from its historical peak (derived from real on-chain pre/post
 * token-balance snapshots — not guessed instruction semantics). We do NOT
 * attempt to compute "profit realized" — that needs full swap-history
 * indexing (price at each historical sell) which isn't available from bare
 * RPC, and inventing a number would violate the "never guessed, only
 * unavailable" rule the rest of this codebase holds to (per-task SPEC §5
 * hard rule: facts only, never a label).
 */
export async function solanaDeployerCheck(
  mintInfo: MintInfo | null,
  launchInfo: LaunchInfo | null,
): Promise<DeployerResult> {
  if (!mintInfo || !launchInfo?.creator) return { signal: empty(), findings: [], onchainFindings: [] };

  const creator = launchInfo.creator;
  const contractAgeDays =
    launchInfo.blockTime != null ? Math.max(0, (Date.now() / 1000 - launchInfo.blockTime) / 86_400) : null;

  const [solBalanceLamports, holding, sold] = await Promise.all([
    solanaConnection.getBalance(creator).catch(() => null),
    currentHolding(creator, mintInfo).catch(() => null),
    hasDevSold(creator, mintInfo).catch(() => null),
  ]);

  const signal: DeployerSignal = {
    available: true,
    creator: creator.toBase58(),
    contractAgeDays,
    priorDeploys: null,
    provider: 'solana-rpc',
  };

  const findings: DeployerFinding[] = [];
  findings.push(
    contractAgeDays != null
      ? {
          fact: `deployed ${
            contractAgeDays < 1 ? `${Math.round(contractAgeDays * 24)}h` : `${Math.round(contractAgeDays)}d`
          } ago by ${shortAddr(creator.toBase58())}`,
          source: 'solana-rpc',
        }
      : { fact: `deployed by ${shortAddr(creator.toBase58())}`, source: 'solana-rpc' },
  );
  if (holding != null) {
    findings.push({ fact: `creator currently holds ${holding.pct.toFixed(1)}% of supply`, source: 'solana-rpc' });
  }
  if (solBalanceLamports != null) {
    findings.push({
      fact: `creator wallet balance: ${(solBalanceLamports / 1e9).toFixed(2)} SOL`,
      source: 'solana-rpc',
    });
  }

  const onchainFindings: OnchainFinding[] = [];
  if (sold != null) {
    onchainFindings.push({
      metric: 'dev sold',
      value: sold ? 'yes' : 'not yet',
      source: 'solana-rpc',
      status: sold ? 'flag' : 'ok',
    });
  }
  return { signal, findings, onchainFindings };
}

async function currentHolding(owner: PublicKey, mintInfo: MintInfo): Promise<{ raw: bigint; pct: number }> {
  const resp = await solanaConnection.getParsedTokenAccountsByOwner(owner, { mint: mintInfo.address });
  let raw = 0n;
  for (const { account } of resp.value) {
    const amt: unknown = (account.data as { parsed?: { info?: { tokenAmount?: { amount?: unknown } } } }).parsed
      ?.info?.tokenAmount?.amount;
    if (typeof amt === 'string') raw += BigInt(amt);
  }
  const supply = mintInfo.mint.supply;
  const pct = supply > 0n ? Number((raw * 1_000_000n) / supply) / 10_000 : 0;
  return { raw, pct };
}

/**
 * Has the creator ever moved tokens out of their own (ATA) balance for this
 * mint? Derived from real on-chain pre/post-token-balance snapshots on their
 * associated token account — not from guessing at instruction semantics
 * (transfer vs swap vs burn all look the same from this angle: balance went
 * down). Compares the *current* balance against the highest balance ever
 * recorded for that account; a drop past dust tolerance means tokens left.
 * Returns null when there's no ATA activity to read at all (never received
 * tokens the standard way, or scan bound exhausted) — inconclusive, not "no".
 */
async function hasDevSold(owner: PublicKey, mintInfo: MintInfo): Promise<boolean | null> {
  const ata = getAssociatedTokenAddressSync(mintInfo.address, owner, true, mintInfo.programId);
  let sigs;
  try {
    sigs = await solanaConnection.getSignaturesForAddress(ata, { limit: ATA_HISTORY_LIMIT });
  } catch (err) {
    log.warn({ err: String(err) }, 'getSignaturesForAddress (creator ATA) failed');
    return null;
  }
  if (sigs.length === 0) return null;

  let peakRaw = 0n;
  let sawBalance = false;
  for (const sig of sigs) {
    let tx;
    try {
      tx = await solanaConnection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
    } catch {
      continue;
    }
    if (!tx?.meta) continue;
    const idx = tx.transaction.message.accountKeys.findIndex((k) => k.pubkey.equals(ata));
    if (idx === -1) continue;
    const pre = tx.meta.preTokenBalances?.find((b) => b.accountIndex === idx);
    const post = tx.meta.postTokenBalances?.find((b) => b.accountIndex === idx);
    if (pre) {
      sawBalance = true;
      const raw = BigInt(pre.uiTokenAmount.amount);
      if (raw > peakRaw) peakRaw = raw;
    }
    if (post) {
      sawBalance = true;
      const raw = BigInt(post.uiTokenAmount.amount);
      if (raw > peakRaw) peakRaw = raw;
    }
  }
  if (!sawBalance || peakRaw === 0n) return null;

  const current = await currentHolding(owner, mintInfo);
  const dust = (peakRaw * BigInt(Math.round(SOLD_DUST_FRACTION * 1_000_000))) / 1_000_000n;
  return current.raw < peakRaw - dust;
}

function empty(): DeployerSignal {
  return { available: false, creator: null, contractAgeDays: null, priorDeploys: null, provider: 'solana-rpc' };
}
