/**
 * CAP (CROO Agent Protocol) domain types.
 *
 * These describe the *shape* this agent relies on, decoupled from the concrete
 * SDK. The real `@croo/*` package names, method signatures, and event strings
 * MUST be confirmed against https://docs.croo.network (SDK Reference + Quickstart)
 * before flipping CAP_MODE=live — see cap/client.ts `CrooCapClient`.
 */

/** Order lifecycle as documented in CROO "Order Lifecycle". Verify exact strings. */
export type OrderStatus =
  | 'negotiation_created'
  | 'order_paid'
  | 'order_delivered'
  | 'order_completed'
  | 'order_cancelled';

/** A negotiation opened by a buyer (human or agent) against our service. */
export interface Negotiation {
  negotiationId: string;
  serviceId: string;
  /** Raw requirement payload the buyer submitted; validated against input schema. */
  requirements: Record<string, unknown>;
  buyerAddress?: string;
}

/** A paid order ready for fulfilment. */
export interface PaidOrder {
  orderId: string;
  negotiationId: string;
  serviceId: string;
  requirements: Record<string, unknown>;
  buyerAddress?: string;
  /** Unix ms by which delivery must happen to satisfy the SLA. */
  deadlineMs: number;
}

/** Result of uploading a binary (e.g. the receipt PNG) to CAP object storage. */
export interface UploadResult {
  objectKey: string;
}

/** What we hand to `DeliverOrder`: structured JSON + the uploaded object key. */
export interface DeliveryPayload {
  orderId: string;
  result: Record<string, unknown>;
  objectKey: string;
}

/** On-chain attestation returned/derived after delivery + settlement. */
export interface Attestation {
  hash: string;
  timestamp: string;
  chain: 'base';
}

export type NegotiationHandler = (n: Negotiation) => Promise<void> | void;
export type OrderPaidHandler = (o: PaidOrder) => Promise<void> | void;

/**
 * The surface the rest of the app depends on. `MockCapClient` and `CrooCapClient`
 * both implement it, so provider/requester code is identical in mock + live mode.
 */
export interface CapClient {
  /** Connect, authenticate (SDK-Key + wallet) and ensure the service is registered. */
  start(): Promise<void>;
  stop(): Promise<void>;

  // ── Provider side ──────────────────────────────────────────────────────
  onNegotiationCreated(handler: NegotiationHandler): void;
  onOrderPaid(handler: OrderPaidHandler): void;
  acceptNegotiation(negotiationId: string): Promise<void>;
  rejectNegotiation(negotiationId: string, reason: string): Promise<void>;
  uploadFile(bytes: Uint8Array, filename: string, contentType: string): Promise<UploadResult>;
  deliverOrder(payload: DeliveryPayload): Promise<Attestation>;

  // ── Requester side (A2A) ───────────────────────────────────────────────
  negotiateOrder(serviceId: string, requirements: Record<string, unknown>): Promise<string>;
  payOrder(negotiationId: string): Promise<string>;
  getDelivery(orderId: string): Promise<DeliveryPayload | null>;
  getDownloadUrl(objectKey: string): Promise<string>;
}
