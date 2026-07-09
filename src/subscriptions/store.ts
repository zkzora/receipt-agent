import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Subscription store for the monthly all-chain plan (Base + Solana) with a daily
 * scan cap. Backed by SQLite via Node's built-in `node:sqlite` (no native build —
 * works on the Windows dev box and the Linux VPS alike).
 *
 * INTEGRATION SEAM (not yet wired — waits on knowing CAP's subscription signal):
 *   - When a buyer pays for the monthly plan, call `activateSubscription(buyer,
 *     plan, days)`. How CAP surfaces "this order is a plan purchase" vs a
 *     pay-per-scan order must be confirmed against the CROO SDK first.
 *   - In the order handler, before running the pipeline for a plan member, call
 *     `tryConsumeScan(buyer)` and honour the result (reject on daily_limit /
 *     expired, or fall through to pay-per-scan billing).
 *
 * All methods are synchronous. `node:sqlite` is synchronous and JS is
 * single-threaded, so each `tryConsumeScan` read-modify-write runs to completion
 * without interleaving — the daily-reset + limit check is atomic by construction.
 */

const log = logger.child({ mod: 'subscriptions' });

const MS_PER_DAY = 86_400_000;

export interface Subscription {
  buyerAddress: string;
  /** Plan identifier, e.g. 'all-chain-monthly'. */
  plan: string;
  /** Unix ms after which the subscription is no longer valid. */
  expiresAt: number;
  /** Scans consumed on `lastResetDate`. */
  scansToday: number;
  /** UTC calendar day the counter was last reset, 'YYYY-MM-DD'. */
  lastResetDate: string;
}

export type ConsumeResult =
  | { ok: true; remaining: number; expiresAt: number }
  | { ok: false; reason: 'no_subscription' | 'expired' | 'daily_limit_reached' };

export interface SubscriptionStore {
  /** Current subscription for a buyer, or null if none exists. */
  getSubscription(buyer: string): Subscription | null;
  /** Start/extend a plan: sets expiry `days` out and resets the daily counter. */
  activateSubscription(buyer: string, plan: string, days: number, now?: number): Subscription;
  /** Atomically check the plan is active + under the daily cap, then consume one scan. */
  tryConsumeScan(buyer: string, now?: number): ConsumeResult;
  close(): void;
}

interface Row {
  buyer_address: string;
  plan: string;
  expires_at: number;
  scans_today: number;
  last_reset_date: string;
}

/** UTC calendar day. UTC avoids ambiguity when the VPS timezone differs from the buyer's. */
function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function toSub(r: Row): Subscription {
  return {
    buyerAddress: r.buyer_address,
    plan: r.plan,
    expiresAt: r.expires_at,
    scansToday: r.scans_today,
    lastResetDate: r.last_reset_date,
  };
}

export function createSubscriptionStore(dbPath: string, dailyLimit: number): SubscriptionStore {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      buyer_address   TEXT PRIMARY KEY,
      plan            TEXT NOT NULL,
      expires_at      INTEGER NOT NULL,
      scans_today     INTEGER NOT NULL DEFAULT 0,
      last_reset_date TEXT NOT NULL
    );
  `);

  const selectStmt = db.prepare('SELECT * FROM subscriptions WHERE buyer_address = ?');
  const upsertStmt = db.prepare(`
    INSERT INTO subscriptions (buyer_address, plan, expires_at, scans_today, last_reset_date)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(buyer_address) DO UPDATE SET
      plan            = excluded.plan,
      expires_at      = excluded.expires_at,
      scans_today     = excluded.scans_today,
      last_reset_date = excluded.last_reset_date
  `);
  const updateCountersStmt = db.prepare(
    'UPDATE subscriptions SET scans_today = ?, last_reset_date = ? WHERE buyer_address = ?',
  );

  // NB: do NOT lowercase — Solana (base58) addresses are case-sensitive; only trim.
  const key = (buyer: string): string => buyer.trim();

  function getSubscription(buyer: string): Subscription | null {
    const row = selectStmt.get(key(buyer)) as Row | undefined;
    return row ? toSub(row) : null;
  }

  function activateSubscription(
    buyer: string,
    plan: string,
    days: number,
    now: number = Date.now(),
  ): Subscription {
    const b = key(buyer);
    const sub: Subscription = {
      buyerAddress: b,
      plan,
      expiresAt: now + days * MS_PER_DAY,
      scansToday: 0,
      lastResetDate: utcDay(now),
    };
    upsertStmt.run(b, sub.plan, sub.expiresAt, sub.scansToday, sub.lastResetDate);
    log.info({ buyer: b, plan, expiresAt: sub.expiresAt }, 'subscription activated');
    return sub;
  }

  function tryConsumeScan(buyer: string, now: number = Date.now()): ConsumeResult {
    const b = key(buyer);
    const row = selectStmt.get(b) as Row | undefined;
    if (!row) return { ok: false, reason: 'no_subscription' };
    if (now >= row.expires_at) return { ok: false, reason: 'expired' };

    const day = utcDay(now);
    // Roll the counter over at the UTC day boundary.
    const scansToday = row.last_reset_date === day ? row.scans_today : 0;
    if (scansToday >= dailyLimit) return { ok: false, reason: 'daily_limit_reached' };

    const next = scansToday + 1;
    updateCountersStmt.run(next, day, b);
    return { ok: true, remaining: dailyLimit - next, expiresAt: row.expires_at };
  }

  return { getSubscription, activateSubscription, tryConsumeScan, close: () => db.close() };
}

let _store: SubscriptionStore | null = null;

/** Lazily-created process-wide store using config (path + daily limit). */
export function subscriptions(): SubscriptionStore {
  if (!_store) {
    _store = createSubscriptionStore(config.subscriptions.dbPath, config.subscriptions.dailyLimit);
  }
  return _store;
}
