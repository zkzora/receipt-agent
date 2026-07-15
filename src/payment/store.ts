import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';

/**
 * Anti-replay store for pay-per-scan: one payment tx = one scan. Backed by the
 * built-in `node:sqlite` (no native build — works on the VPS and Windows dev).
 */
export interface PaymentStore {
  /** True if this payment tx signature has already been redeemed. */
  isUsed(sig: string): boolean;
  /** Record a signature as redeemed. Idempotent (INSERT OR IGNORE). */
  markUsed(sig: string, payer: string, amountUsdc: number): void;
  close(): void;
}

export function createPaymentStore(dbPath: string): PaymentStore {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      tx_sig      TEXT PRIMARY KEY,
      payer       TEXT NOT NULL,
      amount_usdc REAL NOT NULL,
      used_at     INTEGER NOT NULL
    );
  `);
  const selectStmt = db.prepare('SELECT 1 FROM payments WHERE tx_sig = ?');
  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO payments (tx_sig, payer, amount_usdc, used_at) VALUES (?, ?, ?, ?)',
  );
  return {
    isUsed: (sig) => selectStmt.get(sig.trim()) != null,
    markUsed: (sig, payer, amountUsdc) => {
      insertStmt.run(sig.trim(), payer, amountUsdc, Date.now());
    },
    close: () => db.close(),
  };
}

let _store: PaymentStore | null = null;

/** Lazily-created process-wide payment store using config. */
export function paymentStore(): PaymentStore {
  if (!_store) _store = createPaymentStore(config.payment.dbPath);
  return _store;
}
