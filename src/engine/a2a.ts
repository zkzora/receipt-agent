import { logger } from '../logger.js';
import type { CapClient } from '../cap/types.js';

const log = logger.child({ mod: 'a2a' });

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface A2AOptions {
  /** How long to wait for the sub-agent's delivery before giving up. */
  budgetMs?: number;
  pollMs?: number;
}

/**
 * Requester side of CAP composability: order a result from another CROO agent
 * (e.g. the ChainGuard security auditor) and return its delivered JSON.
 *
 * The full lifecycle is NegotiateOrder → PayOrder → poll GetDelivery. With the
 * real SDK these map onto:
 *   const negId   = await croo.negotiateOrder(serviceId, requirements);
 *   const orderId = await croo.payOrder(negId);            // pays in USDC via AA wallet
 *   const out     = await croo.getDelivery(orderId);       // resolves once delivered
 * Here we go through the {@link CapClient} abstraction so this code is identical
 * in mock and live mode. It only does real work in live mode — the mock client's
 * requester methods are no-ops, so callers gate the A2A path on `cap.mode==='live'`
 * and fall back to a local provider otherwise.
 *
 * Returns `null` on any failure or timeout so the caller can fall back locally;
 * an A2A hiccup must never sink the whole receipt.
 */
export async function callSubAgent<T>(
  cap: CapClient,
  serviceId: string,
  requirements: Record<string, unknown>,
  opts: A2AOptions = {},
): Promise<T | null> {
  const budgetMs = opts.budgetMs ?? 60_000;
  const pollMs = opts.pollMs ?? 2_000;
  try {
    const negotiationId = await cap.negotiateOrder(serviceId, requirements);
    const orderId = await cap.payOrder(negotiationId);
    log.info({ serviceId, orderId }, 'A2A order paid — awaiting delivery');

    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      const delivery = await cap.getDelivery(orderId);
      if (delivery) return delivery.result as T;
      await sleep(pollMs);
    }
    log.warn({ serviceId, orderId }, 'A2A sub-agent timed out — falling back to local');
    return null;
  } catch (err) {
    log.warn({ err: String(err), serviceId }, 'A2A sub-agent call failed — falling back to local');
    return null;
  }
}
