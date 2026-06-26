import { logger } from '../logger.js';
import type { CapClient, Negotiation, PaidOrder } from './types.js';
import { attestDeliverable } from './client.js';
import { parseInput } from '../schema/input.js';
import { OutputSchema, type ReceiptOutput } from '../schema/output.js';
import { runPipeline } from '../engine/pipeline.js';
import { receiptModelFromAnalysis } from '../receipt/from-analysis.js';
import { renderReceiptPng } from '../receipt/render.js';

const log = logger.child({ mod: 'provider' });

/**
 * Provider side of CAP: wires order lifecycle events to the verification pipeline.
 *
 *   negotiation_created → validate input → acceptNegotiation (or reject)
 *   order_paid          → runPipeline → render PNG → uploadFile → deliverOrder
 *
 * Settlement + on-chain anchoring of the deliverable's keccak256 hash is handled
 * by CAP after deliverOrder; we surface that hash as the attestation.
 */
export function registerProvider(cap: CapClient): void {
  cap.onNegotiationCreated(async (n: Negotiation) => {
    const parsed = parseInput(n.requirements);
    // We accept even thin inputs: they resolve to an INSUFFICIENT receipt rather
    // than a rejection (SPEC §4.3). Only malformed payloads are rejected.
    if (!parsed.ok) {
      log.warn(
        { negotiationId: n.negotiationId, reason: parsed.reason },
        'rejecting malformed input',
      );
      await cap.rejectNegotiation(n.negotiationId, `invalid input: ${parsed.reason}`);
      return;
    }
    await cap.acceptNegotiation(n.negotiationId);
  });

  cap.onOrderPaid(async (order: PaidOrder) => {
    const t0 = Date.now();
    const reqLog = log.child({ orderId: order.orderId });
    try {
      reqLog.info('order_paid → running pipeline');
      // Pass the CAP client so the engine can compose sub-agents (A2A) when live.
      const analysis = await runPipeline(order.requirements, { cap });

      // Build the printed model first WITHOUT the attestation hash, render, upload,
      // then deliver — the attestation is computed inside deliverOrder over the
      // canonical JSON. To keep the printed hash consistent with the anchored one,
      // we attest the analysis here and reuse it for both the image and delivery.
      const attestation = attestDeliverable(stripVolatile({ ...analysis }));

      const model = receiptModelFromAnalysis(analysis, attestation);
      const png = await renderReceiptPng(model);
      const filename = `${order.orderId}.png`;
      const { objectKey } = await cap.uploadFile(png, filename, 'image/png');

      const result: ReceiptOutput = OutputSchema.parse({
        ...analysis,
        receipt_image: objectKey,
        attestation,
      });

      const finalAttestation = await cap.deliverOrder({
        orderId: order.orderId,
        result,
        objectKey,
      });

      reqLog.info(
        { ms: Date.now() - t0, verdict: result.verdict, hash: finalAttestation.hash, objectKey },
        'order delivered',
      );
    } catch (err) {
      reqLog.error({ err }, 'pipeline failed for order');
      // Best effort: do not crash the service on a single bad order.
    }
  });
}

/** Attest over the analysis fields only — exclude the image key + attestation
 *  itself so the hash is stable and self-consistent. */
function stripVolatile(o: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...o };
  delete rest.receipt_image;
  delete rest.attestation;
  return rest;
}
