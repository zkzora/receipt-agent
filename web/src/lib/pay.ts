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
  await connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
  return sig;
}
