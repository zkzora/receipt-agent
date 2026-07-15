import { config } from '../config.js';
import { logger } from '../logger.js';
import { solanaConnection } from '../engine/evidence/solana/connection.js';

const log = logger.child({ mod: 'payment' });

export type VerifyResult = { ok: true; payer: string } | { ok: false; reason: string };

/**
 * Verify a Solana payment before running a paid scan. The tx must be confirmed
 * and move at least PRICE_USDC of the configured USDC mint INTO RECEIVE_WALLET.
 * Derived from real pre/post token-balance snapshots — not trusted instruction
 * parsing — so it can't be spoofed by crafting a look-alike instruction.
 */
export async function verifyPayment(txSig: string): Promise<VerifyResult> {
  const sig = txSig.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,120}$/.test(sig)) return { ok: false, reason: 'bad_signature' };

  let tx;
  try {
    tx = await solanaConnection.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
  } catch (err) {
    log.warn({ err: String(err), sig }, 'getParsedTransaction failed');
    return { ok: false, reason: 'lookup_failed' };
  }
  if (!tx) return { ok: false, reason: 'not_found' };
  if (tx.meta?.err) return { ok: false, reason: 'tx_failed' };

  const wallet = config.payment.receiveWallet;
  const mint = config.payment.usdcMint;

  // Find the recipient's USDC balance change (owner == wallet, mint == USDC).
  const post = (tx.meta?.postTokenBalances ?? []).find((b) => b.owner === wallet && b.mint === mint);
  if (!post) return { ok: false, reason: 'no_transfer_to_wallet' };
  const pre = (tx.meta?.preTokenBalances ?? []).find((b) => b.accountIndex === post.accountIndex);

  const received = (post.uiTokenAmount.uiAmount ?? 0) - (pre?.uiTokenAmount.uiAmount ?? 0);
  if (received + 1e-9 < config.payment.priceUsdc) {
    return { ok: false, reason: `underpaid: ${received} < ${config.payment.priceUsdc} USDC` };
  }

  const payer = tx.transaction.message.accountKeys[0]?.pubkey.toBase58() ?? 'unknown';
  log.info({ sig, payer, received }, 'payment verified');
  return { ok: true, payer };
}
