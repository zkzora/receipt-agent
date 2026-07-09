import type { Analysis } from '../engine/pipeline.js';
import type { Attestation } from '../cap/types.js';
import { buildReceiptModel, type ReceiptModel } from './format.js';

/**
 * Map a pipeline {@link Analysis} + its attestation into the printable receipt
 * model. Shared by the CAP provider (real delivery path) and the dev HTTP
 * endpoint so both render byte-identical receipts from the same analysis.
 */
export function receiptModelFromAnalysis(
  analysis: Analysis,
  attestation: Attestation,
): ReceiptModel {
  return buildReceiptModel({
    subject: analysis.subject,
    subjectAddress: analysis.subject_address,
    chain: analysis.chain,
    sourceUrl: analysis.source_url,
    isManual: !analysis.source_url,
    claims: analysis.claims_detected,
    claimChecks: analysis.claim_checks,
    findings: analysis.onchain_findings,
    deployer: analysis.deployer_findings,
    offchain: analysis.offchain,
    axes: analysis.axes,
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    note: noteFromCaveats(analysis.caveats, analysis.verdict),
    attestation,
  });
}

/** Caveats are only surfaced on the receipt when the verdict is itself hedged. */
export function noteFromCaveats(caveats: string, verdict: string): string {
  if (verdict === 'MIXED' || verdict === 'INSUFFICIENT') return caveats;
  return '';
}
