import type { ReceiptOutput } from '../schema/output.js';
import type { CapClient } from '../cap/types.js';
import { parseInput, isInsufficientInput } from '../schema/input.js';
import { logger } from '../logger.js';
import { classify } from './classify.js';
import { gatherEvidence } from './evidence/index.js';
import { gatherOffchain } from './offchain/index.js';
import { judge } from './judge.js';
import { gate } from './gating.js';

const log = logger.child({ mod: 'engine' });

/** Everything in the deliverable EXCEPT the parts produced at delivery time
 *  (the uploaded image key + the on-chain attestation). */
export type Analysis = Omit<ReceiptOutput, 'receipt_image' | 'attestation'>;

/** Optional capabilities handed to the pipeline. `cap` enables the A2A requester
 *  path (live mode only); without it every check uses its local provider. */
export interface PipelineDeps {
  cap?: CapClient;
}

/**
 * The real verification engine (SPEC §4, replacing the M1 dummy).
 *
 *   parse/validate → classify(LLM) → gather evidence in parallel
 *     (security: A2A ChainGuard-or-local GoPlus, liquidity: DexScreener,
 *      holders: GoPlus, deployer: Basescan+RPC)
 *   → judge(LLM, advisory) → deterministic gating(stamp)
 *
 * The function signature and `Analysis` return type are the stable seam consumed
 * by the CAP provider and the dev endpoint — both call this and render the result.
 */
export async function runPipeline(
  requirements: Record<string, unknown>,
  deps: PipelineDeps = {},
): Promise<Analysis> {
  const parsed = parseInput(requirements);

  if (!parsed.ok) {
    log.warn({ reason: parsed.reason }, 'input failed validation → INSUFFICIENT');
    return insufficient(null, parsed.reason);
  }
  if (isInsufficientInput(parsed.value)) {
    return insufficient(parsed.value.x_url ?? null);
  }

  const sourceUrl = parsed.value.x_url ?? null;
  const subjectAddress = parsed.value.subject_address ?? null;
  const claimText = parsed.value.claim ?? '';

  // ── Intake: extract the ticker + the individually-checkable claims. ──────
  const classified = await classify({
    claim: claimText,
    xUrl: sourceUrl,
    hasAddress: subjectAddress != null,
  });

  // On-chain verification needs an address. Without one (e.g. a bare URL we
  // couldn't resolve) there is nothing to check against → INSUFFICIENT.
  if (!subjectAddress) {
    return {
      mode: 'insufficient',
      subject: classified.ticker ?? '$UNKNOWN',
      subject_address: null,
      source_url: sourceUrl,
      claims_detected: classified.claims,
      claim_checks: [],
      onchain_findings: [],
      deployer_findings: [],
      offchain: null,
      axes: [],
      verdict: 'INSUFFICIENT',
      confidence: 'LOW',
      caveats: 'No contract address was provided or resolvable, so on-chain claims could not be checked.',
    };
  }

  log.info(
    { ticker: classified.ticker, subjectAddress, claims: classified.claims.length, mode: classified.mode },
    'running verification pipeline',
  );

  // ── Evidence → off-chain → judge (advisory) → gating. ────────────────────
  // Off-chain reads the project's OWN public pages to verify claims the chain
  // can't (it feeds HONESTY only). It runs after evidence so it can reuse the
  // authoritative website/repo links DexScreener registered for the token.
  const evidence = await gatherEvidence(subjectAddress, deps.cap);
  // Prefer the DexScreener-reported symbol when the claim text gave no ticker,
  // so off-chain search gets a real symbol to look for — never a placeholder.
  const resolvedTicker = classified.ticker ?? tickerFromEvidence(evidence);
  const offchain = await gatherOffchain({
    subject: resolvedTicker,
    address: subjectAddress,
    claims: classified.claims,
    claimText,
    xUrl: sourceUrl,
    discovered: evidence.liquidity.links,
  });
  const subject = resolvedTicker ?? '$UNKNOWN';

  const judgement = await judge(subject, classified.claims, evidence);
  const { verdict, confidence, caveats, axes, claimChecks } = gate(
    evidence,
    judgement,
    classified.claims,
    offchain,
  );

  log.info({ subject, verdict, confidence }, 'verdict stamped');

  return {
    mode: classified.mode,
    subject,
    subject_address: subjectAddress,
    source_url: sourceUrl,
    claims_detected: classified.claims,
    claim_checks: claimChecks,
    onchain_findings: evidence.onchainFindings,
    deployer_findings: evidence.deployerFindings,
    offchain,
    axes,
    verdict,
    confidence,
    caveats,
  };
}

/** Prefer the DexScreener-reported symbol when the claim text gave no ticker. */
function tickerFromEvidence(evidence: { liquidity: { symbol: string | null } }): string | null {
  const sym = evidence.liquidity.symbol;
  return sym ? `$${sym.replace(/^\$/, '').toUpperCase()}` : null;
}

function insufficient(
  sourceUrl: string | null,
  caveats = 'No token address and no checkable claim were provided.',
): Analysis {
  return {
    mode: 'insufficient',
    subject: '$—',
    subject_address: null,
    source_url: sourceUrl,
    claims_detected: [],
    claim_checks: [],
    onchain_findings: [],
    deployer_findings: [],
    offchain: null,
    axes: [],
    verdict: 'INSUFFICIENT',
    confidence: 'LOW',
    caveats,
  };
}
