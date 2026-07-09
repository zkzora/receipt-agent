import { PublicKey } from '@solana/web3.js';
import { logger } from '../../../logger.js';
import type { OnchainFinding } from '../../../schema/output.js';
import { fmtPct } from '../util.js';
import { solanaConnection } from './connection.js';
import type { MintInfo } from './mint.js';
import type { LaunchInfo } from './launch.js';
import { SOLANA_AMM_PROGRAM_IDS, SOLANA_NULL_ADDRESS } from './util.js';

const log = logger.child({ mod: 'solana-bundle' });

/** Extra slots after the launch slot to also scan — Jito bundles land
 *  atomically in one slot, but a coordinated sniper wave can spill into the
 *  next slot or two. Kept small: each extra slot is a full getBlock call. */
const EXTRA_SLOTS = 2;
/** A single-slot buyer cohort above this share of supply is worth flagging. */
const BUNDLE_FLAG_PCT = 15;
/** Bound how many distinct launch-slot wallets we'll resolve current balances
 *  for — a real bundle is usually a handful to a few dozen wallets; this just
 *  keeps a pathological case (thousands of buyers in the launch block) from
 *  blowing the RPC budget. */
const MAX_WALLETS_RESOLVED = 40;

export interface BundleResult {
  findings: OnchainFinding[];
}

/**
 * Best-effort, HEURISTIC bundle detection: wallets that received this token in
 * the exact slot(s) the mint launched are the same signal dedicated bundle
 * scanners (Trench Radar, pump.fun's own detector) surface — Jito bundles
 * execute atomically within one slot, so a cluster of *distinct* first-time
 * recipients landing together is a strong "sniped/bundled at launch" tell.
 * This is explicitly NOT proof: organic simultaneous buys immediately after a
 * hyped launch can land in the same slot too. There is no free public API for
 * this (checked: Trench Radar / pump.fun's own scanner are Telegram-bot / paid
 * only) — findings here are labelled "(heuristic)" and are informational only.
 * Unlike the rest of this evidence pipeline this never feeds the deterministic
 * verdict (gating.ts) — same principle as off-chain evidence enriching HONESTY
 * but never overriding SAFETY.
 *
 * Depends on `getBlock`, which many free public RPCs restrict or heavily
 * rate-limit for arbitrary historical blocks (a paid endpoint like Alchemy/
 * Helius handles it fine) — degrades to no findings rather than guessing when
 * it's unavailable.
 */
export async function solanaBundleCheck(
  mintInfo: MintInfo | null,
  launchInfo: LaunchInfo | null,
): Promise<BundleResult> {
  if (!mintInfo || !launchInfo) return { findings: [] };

  const mintB58 = mintInfo.address.toBase58();
  const creatorB58 = launchInfo.creator?.toBase58();
  const slots = [launchInfo.slot, ...Array.from({ length: EXTRA_SLOTS }, (_, i) => launchInfo.slot + i + 1)];

  const recipients = new Set<string>();
  for (const slot of slots) {
    let block;
    try {
      block = await solanaConnection.getBlock(slot, {
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'full',
        rewards: false,
      });
    } catch (err) {
      log.warn({ err: String(err), slot }, 'getBlock failed — bundle check unavailable for this slot');
      continue;
    }
    if (!block) continue;
    for (const tx of block.transactions) {
      for (const post of tx.meta?.postTokenBalances ?? []) {
        if (post.mint !== mintB58) continue;
        const owner = post.owner;
        if (!owner || owner === creatorB58 || owner === SOLANA_NULL_ADDRESS) continue;
        recipients.add(owner);
      }
    }
  }
  if (recipients.size === 0) return { findings: [] };

  const owners = [...recipients].slice(0, MAX_WALLETS_RESOLVED);
  const truncated = recipients.size > owners.length;
  const ownerPubkeys = owners.map((o) => new PublicKey(o));

  // Exclude AMM pool vault owners the same way holders.ts does (a PDA owned by
  // a known Raydium/Orca program isn't a "sniper wallet").
  const ownerAccountInfos = await solanaConnection.getMultipleAccountsInfo(ownerPubkeys).catch(() => null);
  const wallets = ownerPubkeys.filter((_, i) => {
    const owningProgram = ownerAccountInfos?.[i]?.owner.toBase58();
    return !(owningProgram && SOLANA_AMM_PROGRAM_IDS.has(owningProgram));
  });
  if (wallets.length === 0) return { findings: [] };

  const balances = await Promise.all(
    wallets.map((w) =>
      solanaConnection
        .getParsedTokenAccountsByOwner(w, { mint: mintInfo.address })
        .then((r) => sumRaw(r.value))
        .catch(() => 0n),
    ),
  );
  const totalRaw = balances.reduce((s, b) => s + b, 0n);
  const supply = mintInfo.mint.supply;
  const pct = supply > 0n ? Number((totalRaw * 1_000_000n) / supply) / 10_000 : 0;

  const findings: OnchainFinding[] = [
    {
      metric: 'launch-slot wallets (heuristic)',
      value: `${fmtPct(pct)} of supply, ${wallets.length}${truncated ? '+' : ''} wallet(s) still holding`,
      source: 'solana-rpc',
      status: pct > BUNDLE_FLAG_PCT ? 'flag' : 'ok',
    },
  ];
  return { findings };
}

function sumRaw(accounts: { account: { data: unknown } }[]): bigint {
  let raw = 0n;
  for (const { account } of accounts) {
    const amt: unknown = (account.data as { parsed?: { info?: { tokenAmount?: { amount?: unknown } } } }).parsed
      ?.info?.tokenAmount?.amount;
    if (typeof amt === 'string') raw += BigInt(amt);
  }
  return raw;
}
