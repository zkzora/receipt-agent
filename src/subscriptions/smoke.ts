import { createSubscriptionStore } from './store.js';

/**
 * Deterministic smoke test for the subscription store. Uses an in-memory DB and
 * an injected clock (the optional `now` args) so the daily reset and expiry paths
 * are exercised without waiting. Run: `pnpm smoke:subs`.
 */

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ok  ${msg}`);
  } else {
    console.error(`  FAIL ${msg}`);
    failures += 1;
  }
}

const DAY = 86_400_000;
const DAILY_LIMIT = 3;
const store = createSubscriptionStore(':memory:', DAILY_LIMIT);
const buyer = 'So1anaBuyer1111111111111111111111111111111'; // case-sensitive base58-style
const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);

console.log('subscription store smoke:');

// No subscription yet.
check(store.getSubscription(buyer) === null, 'no subscription initially');
const none = store.tryConsumeScan(buyer, t0);
check(!none.ok && none.reason === 'no_subscription', 'non-subscriber is rejected');

// Activate a 30-day plan.
const sub = store.activateSubscription(buyer, 'all-chain-monthly', 30, t0);
check(sub.expiresAt === t0 + 30 * DAY, 'expiry set 30 days out');
check(store.getSubscription(buyer)?.plan === 'all-chain-monthly', 'subscription persisted');

// Consume up to the daily cap.
const r1 = store.tryConsumeScan(buyer, t0);
check(r1.ok && r1.remaining === 2, 'scan 1/3 -> 2 remaining');
const r2 = store.tryConsumeScan(buyer, t0);
check(r2.ok && r2.remaining === 1, 'scan 2/3 -> 1 remaining');
const r3 = store.tryConsumeScan(buyer, t0);
check(r3.ok && r3.remaining === 0, 'scan 3/3 -> 0 remaining');
const r4 = store.tryConsumeScan(buyer, t0);
check(!r4.ok && r4.reason === 'daily_limit_reached', 'scan 4 blocked by daily cap');

// Same day, a few hours later -> still capped.
const r4b = store.tryConsumeScan(buyer, t0 + 3 * 3_600_000);
check(!r4b.ok && r4b.reason === 'daily_limit_reached', 'still capped later the same UTC day');

// Next UTC day -> counter resets.
const nextDay = store.tryConsumeScan(buyer, t0 + DAY);
check(nextDay.ok && nextDay.remaining === 2, 'next UTC day resets the counter');

// After expiry -> blocked.
const expired = store.tryConsumeScan(buyer, t0 + 31 * DAY);
check(!expired.ok && expired.reason === 'expired', 'expired subscription is blocked');

// Re-activation extends and resets.
const renewed = store.activateSubscription(buyer, 'all-chain-monthly', 30, t0 + 31 * DAY);
check(renewed.expiresAt === t0 + 61 * DAY, 're-activation extends expiry');
const afterRenew = store.tryConsumeScan(buyer, t0 + 31 * DAY);
check(afterRenew.ok && afterRenew.remaining === 2, 'scans work again after renewal');

store.close();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nsubscription store smoke passed');
