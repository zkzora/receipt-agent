import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { keccak256, stringToBytes } from 'viem';
import { AgentClient, DeliverableType, EventType, type Event, type EventStream } from '@croo-network/sdk';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type {
  Attestation,
  CapClient,
  DeliveryPayload,
  Negotiation,
  NegotiationHandler,
  OrderPaidHandler,
  PaidOrder,
  UploadResult,
} from './types.js';

const log = logger.child({ mod: 'cap' });

/** Deterministic keccak256 attestation over the canonical deliverable JSON. */
export function attestDeliverable(result: Record<string, unknown>): Attestation {
  const canonical = JSON.stringify(result);
  return {
    hash: keccak256(stringToBytes(canonical)),
    timestamp: new Date().toISOString(),
    chain: 'base',
  };
}

/**
 * Local, network-free implementation that exercises the entire provider pipe:
 *   start → (after delay) negotiation_created → acceptNegotiation
 *         → (after delay) order_paid → provider runs pipeline → uploadFile
 *         → deliverOrder → attestation
 *
 * This is what satisfies M1 ("prove the pipe") before any real CROO credentials
 * exist. Uploaded PNGs land in ./receipts-out so you can open them.
 */
export class MockCapClient implements CapClient {
  private negotiationHandlers: NegotiationHandler[] = [];
  private orderPaidHandlers: OrderPaidHandler[] = [];
  private timers: NodeJS.Timeout[] = [];
  private seq = 0;
  private readonly outDir = resolve(process.cwd(), 'receipts-out');
  private readonly deliveries = new Map<string, DeliveryPayload>();

  async start(): Promise<void> {
    await mkdir(this.outDir, { recursive: true });
    log.info({ mode: 'mock' }, 'CAP mock client started — synthesizing a demo order');
    // Kick off a synthetic negotiation shortly after boot.
    this.timers.push(setTimeout(() => void this.emitNegotiation(), 1200));
  }

  async stop(): Promise<void> {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  onNegotiationCreated(handler: NegotiationHandler): void {
    this.negotiationHandlers.push(handler);
  }

  onOrderPaid(handler: OrderPaidHandler): void {
    this.orderPaidHandlers.push(handler);
  }

  async acceptNegotiation(negotiationId: string): Promise<void> {
    log.info({ negotiationId }, 'accepted negotiation (mock) — simulating buyer payment');
    // Buyer "pays" shortly after we accept.
    this.timers.push(setTimeout(() => void this.emitOrderPaid(negotiationId), 900));
  }

  async rejectNegotiation(negotiationId: string, reason: string): Promise<void> {
    log.warn({ negotiationId, reason }, 'rejected negotiation (mock)');
  }

  async uploadFile(
    bytes: Uint8Array,
    filename: string,
    contentType: string,
  ): Promise<UploadResult> {
    const path = join(this.outDir, filename);
    await writeFile(path, bytes);
    const objectKey = `mock://receipts-out/${filename}`;
    log.info({ objectKey, bytes: bytes.byteLength, contentType }, 'uploaded file (mock)');
    return { objectKey };
  }

  async deliverOrder(payload: DeliveryPayload): Promise<Attestation> {
    const attestation = attestDeliverable(payload.result);
    this.deliveries.set(payload.orderId, payload);
    log.info(
      { orderId: payload.orderId, hash: attestation.hash },
      'delivered order (mock) — settlement + attestation simulated',
    );
    return attestation;
  }

  // ── Requester side (A2A) — simulated no-ops for local dev ────────────────
  async negotiateOrder(serviceId: string): Promise<string> {
    const id = `mock-neg-${++this.seq}`;
    log.info({ serviceId, negotiationId: id }, 'negotiateOrder (mock)');
    return id;
  }

  async payOrder(negotiationId: string): Promise<string> {
    const orderId = `mock-order-${++this.seq}`;
    log.info({ negotiationId, orderId }, 'payOrder (mock)');
    return orderId;
  }

  async getDelivery(orderId: string): Promise<DeliveryPayload | null> {
    return this.deliveries.get(orderId) ?? null;
  }

  async getDownloadUrl(objectKey: string): Promise<string> {
    return objectKey.replace('mock://', `file://${this.outDir}/`).replace('receipts-out/', '');
  }

  // ── internal demo drivers ────────────────────────────────────────────────
  private async emitNegotiation(): Promise<void> {
    const negotiation: Negotiation = {
      negotiationId: `mock-neg-${++this.seq}`,
      serviceId: 'receipt.fact-check',
      buyerAddress: '0xDEMO000000000000000000000000000000000001',
      // A juicy claim_check demo payload (manual path — the reliable one).
      requirements: {
        claim: '$LUNAR — fully audited, 10M TVL, tier-1 backed, LP locked.',
        subject_address: '0x9f2a000000000000000000000000000000000c81',
        chain: 'base',
      },
    };
    for (const h of this.negotiationHandlers) await h(negotiation);
  }

  private async emitOrderPaid(negotiationId: string): Promise<void> {
    const order: PaidOrder = {
      orderId: `mock-order-${++this.seq}`,
      negotiationId,
      serviceId: 'receipt.fact-check',
      buyerAddress: '0xDEMO000000000000000000000000000000000001',
      requirements: {
        claim: '$LUNAR — fully audited, 10M TVL, tier-1 backed, LP locked.',
        subject_address: '0x9f2a000000000000000000000000000000000c81',
        chain: 'base',
      },
      deadlineMs: Date.now() + config.cap.slaSeconds * 1000,
    };
    for (const h of this.orderPaidHandlers) await h(order);
  }
}

/**
 * Live CROO implementation — maps our CapClient surface onto `@croo-network/sdk`
 * (AgentClient, v0.2.x; verified against docs.croo.network SDK Reference).
 *
 * Provider flow: connect WS → on `order_negotiation_created` fetch the negotiation,
 * validate, accept/reject → on `order_paid` fetch the order, run the pipeline,
 * uploadFile(PNG) → deliverOrder(canonical JSON as text). CROO's CAPVault settles
 * USDC to the provider's AA wallet automatically once delivery is confirmed
 * on-chain (fee → treasury, remainder → provider). We never move funds ourselves.
 *
 * Auth is via the SDK-Key alone (issued in the CROO dashboard); the agent wallet /
 * on-chain createOrder + settlement are handled custodially by the CROO backend.
 */
export class CrooCapClient implements CapClient {
  private client: AgentClient | null = null;
  private stream: EventStream | null = null;
  private negotiationHandlers: NegotiationHandler[] = [];
  private orderPaidHandlers: OrderPaidHandler[] = [];

  async start(): Promise<void> {
    this.client = new AgentClient(
      {
        baseURL: config.cap.apiUrl,
        wsURL: config.cap.wsUrl,
        rpcURL: config.chain.rpcUrl,
        logger: sdkLogger,
      },
      config.cap.sdkKey,
    );
    this.stream = await this.client.connectWebSocket();
    this.stream.on(EventType.NegotiationCreated, (e) => void this.handleNegotiation(e));
    this.stream.on(EventType.OrderPaid, (e) => void this.handleOrderPaid(e));
    log.info(
      { apiUrl: config.cap.apiUrl, wsUrl: config.cap.wsUrl },
      'CAP live (CROO) connected — listening for negotiations + paid orders',
    );
  }

  async stop(): Promise<void> {
    this.stream?.close();
    this.stream = null;
  }

  onNegotiationCreated(handler: NegotiationHandler): void {
    this.negotiationHandlers.push(handler);
  }
  onOrderPaid(handler: OrderPaidHandler): void {
    this.orderPaidHandlers.push(handler);
  }

  // The WS Event carries only ids; fetch the full record so the provider sees the
  // same {requirements} shape it does in mock mode.
  private async handleNegotiation(e: Event): Promise<void> {
    const client = this.client;
    if (!client || !e.negotiation_id) return;
    try {
      const n = await client.getNegotiation(e.negotiation_id);
      const negotiation: Negotiation = {
        negotiationId: n.negotiationId,
        serviceId: n.serviceId,
        requirements: parseJsonObject(n.requirements),
      };
      for (const h of this.negotiationHandlers) await h(negotiation);
    } catch (err) {
      log.error({ err, negotiationId: e.negotiation_id }, 'failed to handle negotiation_created');
    }
  }

  private async handleOrderPaid(e: Event): Promise<void> {
    const client = this.client;
    if (!client || !e.order_id) return;
    try {
      const order = await client.getOrder(e.order_id);
      const negotiation = await client.getNegotiation(order.negotiationId);
      const paid: PaidOrder = {
        orderId: order.orderId,
        negotiationId: order.negotiationId,
        serviceId: order.serviceId,
        requirements: parseJsonObject(negotiation.requirements),
        buyerAddress: order.requesterWalletAddress || undefined,
        deadlineMs: Date.parse(order.slaDeadline) || Date.now() + config.cap.slaSeconds * 1000,
      };
      for (const h of this.orderPaidHandlers) await h(paid);
    } catch (err) {
      log.error({ err, orderId: e.order_id }, 'failed to handle order_paid');
    }
  }

  async acceptNegotiation(negotiationId: string): Promise<void> {
    await this.require().acceptNegotiation(negotiationId);
    log.info({ negotiationId }, 'accepted negotiation (CROO) — order created on-chain');
  }
  async rejectNegotiation(negotiationId: string, reason: string): Promise<void> {
    await this.require().rejectNegotiation(negotiationId, reason);
  }

  async uploadFile(bytes: Uint8Array, filename: string): Promise<UploadResult> {
    const objectKey = await this.require().uploadFile(filename, Buffer.from(bytes));
    return { objectKey };
  }

  async deliverOrder(payload: DeliveryPayload): Promise<Attestation> {
    const res = await this.require().deliverOrder(payload.orderId, {
      deliverableType: DeliverableType.Text,
      deliverableText: JSON.stringify(payload.result),
    });
    log.info(
      { orderId: payload.orderId, deliverTxHash: res.txHash, contentHash: res.delivery?.contentHash },
      'delivered order (CROO) — USDC settles to provider AA wallet on confirmation',
    );
    // The keccak attestation we embedded in the deliverable is authoritative; fall
    // back to a fresh hash over the result only if it is somehow absent.
    const embedded = payload.result.attestation as Attestation | undefined;
    return embedded ?? attestDeliverable(payload.result);
  }

  // ── Requester side (A2A — composing other CROO agents) ───────────────────
  async negotiateOrder(serviceId: string, requirements: Record<string, unknown>): Promise<string> {
    const n = await this.require().negotiateOrder({
      serviceId,
      requirements: JSON.stringify(requirements),
    });
    return n.negotiationId;
  }
  /** NB: CROO pays an *order*, so this arg is an orderId (created after the
   *  provider accepts), not a negotiationId. */
  async payOrder(orderId: string): Promise<string> {
    const res = await this.require().payOrder(orderId);
    return res.order.orderId;
  }
  async getDelivery(orderId: string): Promise<DeliveryPayload | null> {
    const d = await this.require().getDelivery(orderId);
    if (!d) return null;
    return { orderId, result: parseJsonObject(d.deliverableText), objectKey: '' };
  }
  async getDownloadUrl(objectKey: string): Promise<string> {
    return this.require().getDownloadURL(objectKey);
  }

  private require(): AgentClient {
    if (!this.client) throw new Error('CrooCapClient.start() must be called before use');
    return this.client;
  }
}

/** Adapter so our pino logger satisfies the SDK's flat `Logger` interface. */
const sdkLogger = {
  info: (m: string, ...a: unknown[]) => log.info({ a }, m),
  warn: (m: string, ...a: unknown[]) => log.warn({ a }, m),
  error: (m: string, ...a: unknown[]) => log.error({ a }, m),
  debug: (m: string, ...a: unknown[]) => log.debug({ a }, m),
};

/** CROO carries requirements/deliverables as a JSON string; tolerate plain text
 *  (a bare claim) by wrapping it so the pipeline still gets a usable payload. */
function parseJsonObject(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  return { claim: raw };
}

/** Pick the implementation based on config. */
export function createCapClient(): CapClient {
  if (config.cap.mode === 'live') {
    log.info('CAP_MODE=live → CrooCapClient (requires verified SDK wiring)');
    return new CrooCapClient();
  }
  return new MockCapClient();
}

/** Re-exported for callers that read a delivered receipt back during dev. */
export async function readReceiptFile(filename: string): Promise<Uint8Array> {
  return readFile(resolve(process.cwd(), 'receipts-out', filename));
}
