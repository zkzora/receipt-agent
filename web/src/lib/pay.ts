import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';

export interface PaymentConfig {
  priceUsdc: number;
  receiveWallet: string;
  usdcMint: string;
}

const USDC_DECIMALS = 6;

type SendTx = (tx: Transaction, connection: Connection) => Promise<string>;

/**
 * Build → sign (in the wallet) → send → confirm a USDC payment for one scan.
 * Returns the tx signature the agent verifies before running. Creates the
 * recipient's USDC account on the fly if it doesn't exist yet.
 */
export async function payForScan(
  connection: Connection,
  payer: PublicKey,
  sendTransaction: SendTx,
  cfg: PaymentConfig,
): Promise<string> {
  const mint = new PublicKey(cfg.usdcMint);
  const recipient = new PublicKey(cfg.receiveWallet);
  const fromAta = await getAssociatedTokenAddress(mint, payer);
  const toAta = await getAssociatedTokenAddress(mint, recipient);
  const amount = BigInt(Math.round(cfg.priceUsdc * 10 ** USDC_DECIMALS));

  const tx = new Transaction();
  const toInfo = await connection.getAccountInfo(toAta);
  if (!toInfo) {
    tx.add(createAssociatedTokenAccountInstruction(payer, toAta, recipient, mint));
  }
  tx.add(createTransferCheckedInstruction(fromAta, mint, toAta, payer, amount, USDC_DECIMALS));

  const latest = await connection.getLatestBlockhash();
  tx.feePayer = payer;
  tx.recentBlockhash = latest.blockhash;

  const sig = await sendTransaction(tx, connection);
  await confirmBySignature(connection, sig);
  return sig;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Confirm a signature by polling `getSignatureStatuses` over HTTP. We avoid
 * `connection.confirmTransaction`, which opens a websocket — the agent's `/rpc`
 * proxy is HTTP-only. Resolves once the tx is confirmed/finalized; throws on an
 * on-chain error or after ~90s.
 */
async function confirmBySignature(connection: Connection, sig: string): Promise<void> {
  for (let i = 0; i < 45; i++) {
    const st = (await connection.getSignatureStatuses([sig])).value[0];
    if (st?.err) throw new Error('Payment transaction failed on-chain.');
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return;
    await sleep(2000);
  }
  throw new Error('Timed out confirming payment — check your wallet; it may have gone through.');
}
