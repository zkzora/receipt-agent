/**
 * A2A test requester — hires the live RECEIPT agent over CROO's CAP and prints
 * the verdict it gets back. This is the *counterparty* side of the marketplace:
 * it proves RECEIPT is composable by another agent (the A2A / composability
 * signal for the hackathon), not the provider side that RECEIPT normally runs.
 *
 * Flow (verified against @croo-network/sdk v0.2.1 + its README "Requester Agent"
 * example and docs.croo.network):
 *
 *   connectWebSocket
 *     → negotiateOrder(serviceId, requirements)        [requester]
 *     → provider (RECEIPT) accepts  → backend creates on-chain order
 *     → on OrderCreated   : payOrder(orderId)          [requester pays in USDC]
 *     → provider runs pipeline + deliverOrder
 *     → on OrderCompleted : getDelivery(orderId)       → print full JSON
 *
 * Notes that matter when you actually run this:
 *   • payOrder() takes NO amount — the price is fixed by the *service*
 *     registration on CROO, so we just pay whatever order.price says (your
 *     .env's SERVICE_PRICE_USDC is this agent's *own* sell price, unrelated).
 *   • The requester's AA wallet (shown in the CROO dashboard, NOT the controller
 *     address) must already hold USDC on Base for the price + the escrow fee.
 *   • If CROO_REQUESTER_SDK_KEY is unset we fall back to CROO_SDK_KEY — i.e.
 *     RECEIPT hires *itself* (requester_agent_id == provider_agent_id). That is
 *     the simplest demo but the backend may reject self-dealing; set a separate
 *     requester agent's key to be safe. We log which identity is in use.
 */
import { AgentClient, EventType, isInsufficientBalance, type Event } from '@croo-network/sdk';
import { config } from '../config.js';

/** The live RECEIPT service to hire. Override with CROO_TARGET_SERVICE_ID. */
const TARGET_SERVICE_ID =
  process.env.CROO_TARGET_SERVICE_ID || 'c35b2f68-ea14-419d-8738-f6ad3917812f';

/** Requester identity. Prefer a dedicated requester agent; fall back to the
 *  provider key (self-hire) so the demo runs with zero extra setup. */
const REQUESTER_SDK_KEY = process.env.CROO_REQUESTER_SDK_KEY || config.cap.sdkKey;

/** Give up if the round trip (negotiate → pay → deliver) isn't done in time. */
const TIMEOUT_MS = 6 * 60 * 1000;

/** The shill we ask RECEIPT to grade. Sent in CROO's native `{ text }` shape —
 *  which also exercises the parseInput text→claim recovery end-to-end. */
const TEST_PAYLOAD = process.env.CROO_REQUIREMENTS_JSON
  ? JSON.parse(process.env.CROO_REQUIREMENTS_JSON)
  : {
      text:
        'Token: XOCHI ($XOCHI) CA: 0x23c384C5b5a2033aD45a914eD3D489494ab0E021 ' +
        'Chain: #BASE MC: $56367 — fully organic growth, LP locked, no dev wallet',
    };

// ── timestamped trace so the full A2A handshake is greppable in one screenshot ─
const startedAt = Date.now();
function trace(step: string, data?: unknown): void {
  const ts = new Date().toISOString();
  const rel = `+${((Date.now() - startedAt) / 1000).toFixed(2)}s`.padStart(8);
  const tail =
    data === undefined ? '' : ' ' + (typeof data === 'string' ? data : JSON.stringify(data));
  console.log(`[${ts}] [${rel}] ${step}${tail}`);
}

/** Route the SDK's own logs (WS connect/reconnect) into the same trace stream. */
const sdkLogger = {
  info: (m: string, ...a: unknown[]) => trace(`sdk · ${m}`, a.length ? a : undefined),
  warn: (m: string, ...a: unknown[]) => trace(`sdk · WARN ${m}`, a.length ? a : undefined),
  error: (m: string, ...a: unknown[]) => trace(`sdk · ERROR ${m}`, a.length ? a : undefined),
  debug: () => {}, // keep the trace readable — drop debug chatter
};

function parseDeliverable(text: string): Record<string, any> {
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return { _raw: text };
  }
}

async function main(): Promise<void> {
  if (!REQUESTER_SDK_KEY) {
    trace('FATAL no SDK key — set CROO_REQUESTER_SDK_KEY (or CROO_SDK_KEY) in .env');
    process.exit(1);
  }

  const selfHire = REQUESTER_SDK_KEY === config.cap.sdkKey;
  trace('A2A requester starting', {
    targetServiceId: TARGET_SERVICE_ID,
    apiUrl: config.cap.apiUrl,
    wsUrl: config.cap.wsUrl,
    rpcUrl: config.chain.rpcUrl,
    requesterIdentity: selfHire ? 'SELF (provider key — self-hire)' : 'dedicated requester key',
  });
  if (selfHire) {
    trace(
      'NOTE: requester == provider. CROO may reject self-dealing; if so, register a ' +
        'separate requester agent and set CROO_REQUESTER_SDK_KEY.',
    );
  }

  const client = new AgentClient(
    {
      baseURL: config.cap.apiUrl,
      wsURL: config.cap.wsUrl,
      rpcURL: config.chain.rpcUrl,
      logger: sdkLogger,
    },
    REQUESTER_SDK_KEY,
  );

  // Mutable flow state. We match events to OUR ids so a shared (self-hire) key
  // that also sees the provider's own traffic can't make us act on a stray order.
  let negotiationId: string | null = null;
  let orderId: string | null = null;
  let paying = false;
  let stream: Awaited<ReturnType<AgentClient['connectWebSocket']>> | null = null;

  const finish = (code: number, why: string): void => {
    trace(code === 0 ? `DONE ✅ ${why}` : `EXIT ✖ ${why}`);
    clearTimeout(timer);
    try {
      stream?.close();
    } catch {
      /* ignore */
    }
    process.exit(code);
  };

  const timer = setTimeout(() => {
    finish(1, `timeout — no completed delivery within ${TIMEOUT_MS / 60000} min (orderId=${orderId})`);
  }, TIMEOUT_MS);

  /** Only react to the order spawned by OUR negotiation. */
  const isOurNegotiation = (e: Event): boolean =>
    !negotiationId || !e.negotiation_id || e.negotiation_id === negotiationId;
  const isOurOrder = (e: Event): boolean => !orderId || !e.order_id || e.order_id === orderId;

  stream = await client.connectWebSocket();
  trace('websocket connected — listening for order lifecycle events');

  stream.onAny((e: Event) =>
    trace(`◂ event ${e.type}`, {
      negotiation_id: e.negotiation_id,
      order_id: e.order_id,
      status: e.status,
      reason: e.reason || undefined,
    }),
  );

  // Provider accepted the negotiation → backend created the on-chain order → pay it.
  stream.on(EventType.OrderCreated, async (e: Event) => {
    if (!e.order_id || !isOurNegotiation(e) || orderId || paying) return;
    paying = true;
    orderId = e.order_id;
    try {
      const order = await client.getOrder(orderId);
      trace('order created by provider → paying', {
        orderId,
        price: order.price,
        paymentToken: order.paymentToken,
        feeAmount: order.feeAmount,
        status: order.status,
      });
      const res = await client.payOrder(orderId);
      trace('payOrder submitted — USDC in escrow', {
        txHash: res.txHash,
        status: res.order.status,
      });
    } catch (err) {
      if (isInsufficientBalance(err)) {
        finish(
          1,
          `insufficient balance in requester AA wallet — token=${err.token} required=${err.required.toString()} balance=${err.balance.toString()} (fund the AA wallet with USDC on Base)`,
        );
        return;
      }
      finish(1, `payOrder failed: ${String(err)}`);
    }
  });

  // Delivery verified on-chain → fetch and print the deliverable.
  stream.on(EventType.OrderCompleted, async (e: Event) => {
    if (!e.order_id || !isOurOrder(e)) return;
    try {
      trace('order completed — fetching delivery', { orderId: e.order_id });
      const delivery = await client.getDelivery(e.order_id);
      const result = parseDeliverable(delivery.deliverableText);

      console.log('\n==================== RECEIPT DELIVERY (full JSON) ====================');
      console.log(JSON.stringify(result, null, 2));
      console.log('=====================================================================\n');

      trace('RESULT SUMMARY', {
        mode: result.mode,
        verdict: result.verdict,
        confidence: result.confidence,
        subject: result.subject,
        subject_address: result.subject_address,
        attestation_hash: result.attestation?.hash,
        delivery_contentHash: delivery.contentHash,
        delivery_status: delivery.status,
      });
      finish(0, `RECEIPT verdict for ${result.subject ?? 'subject'}: ${result.verdict} (${result.confidence})`);
    } catch (err) {
      finish(1, `getDelivery failed: ${String(err)}`);
    }
  });

  // ── failure / terminal paths ─────────────────────────────────────────────
  stream.on(EventType.NegotiationRejected, (e: Event) => {
    if (!isOurNegotiation(e)) return;
    finish(1, `negotiation rejected by provider: ${e.reason || '(no reason)'}`);
  });
  stream.on(EventType.NegotiationExpired, (e: Event) => {
    if (!isOurNegotiation(e)) return;
    finish(1, 'negotiation expired before the provider accepted');
  });
  stream.on(EventType.OrderRejected, (e: Event) => {
    if (!isOurOrder(e)) return;
    finish(1, `order rejected: ${e.reason || '(no reason)'}`);
  });
  stream.on(EventType.OrderExpired, (e: Event) => {
    if (!isOurOrder(e)) return;
    finish(1, 'order expired before delivery');
  });

  // ── kick off the negotiation ─────────────────────────────────────────────
  trace('negotiating order', { serviceId: TARGET_SERVICE_ID, requirements: TEST_PAYLOAD });
  try {
    const neg = await client.negotiateOrder({
      serviceId: TARGET_SERVICE_ID,
      requirements: JSON.stringify(TEST_PAYLOAD),
    });
    negotiationId = neg.negotiationId;
    trace('negotiation created — waiting for provider to accept', {
      negotiationId,
      status: neg.status,
    });
  } catch (err) {
    finish(1, `negotiateOrder failed: ${String(err)}`);
  }
}

process.on('SIGINT', () => {
  trace('interrupted (SIGINT) — closing');
  process.exit(130);
});

main().catch((err) => {
  trace(`FATAL ${String(err)}`);
  process.exit(1);
});
