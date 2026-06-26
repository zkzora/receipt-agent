import { z } from 'zod';

export const ModeSchema = z.enum(['claim_check', 'vibe_check', 'insufficient']);
export type Mode = z.infer<typeof ModeSchema>;

export const VerdictSchema = z.enum(['BASED', 'BULLSHIT', 'RED_FLAGS', 'MIXED', 'INSUFFICIENT']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const ConfidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const FindingStatusSchema = z.enum(['ok', 'flag', 'unavailable']);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

/** One machine-checkable on-chain metric, always carrying its source. */
export const OnchainFindingSchema = z.object({
  metric: z.string(),
  value: z.string(),
  source: z.string(),
  status: FindingStatusSchema,
});
export type OnchainFinding = z.infer<typeof OnchainFindingSchema>;

/** Deployer facts ONLY — never a label like "scammer" (SPEC §5 hard rule). */
export const DeployerFindingSchema = z.object({
  fact: z.string(),
  source: z.string(),
});
export type DeployerFinding = z.infer<typeof DeployerFindingSchema>;

/**
 * The three independent axes the verdict is decomposed into, so one stamp no
 * longer has to carry every concern. SAFETY is the authoritative on-chain hard
 * gate; HONESTY is whether the claims hold up; DISTRIBUTION is holder spread.
 */
export const AxisNameSchema = z.enum(['SAFETY', 'HONESTY', 'DISTRIBUTION']);
export type AxisName = z.infer<typeof AxisNameSchema>;

export const AxisStatusSchema = z.enum(['PASS', 'WARN', 'FAIL', 'UNKNOWN']);
export type AxisStatus = z.infer<typeof AxisStatusSchema>;

export const AxisResultSchema = z.object({
  axis: AxisNameSchema,
  status: AxisStatusSchema,
  detail: z.string(),
});
export type AxisResult = z.infer<typeof AxisResultSchema>;

/** Per-claim line item — the heart of "show me the receipts". */
export const ClaimVerdictSchema = z.enum(['TRUE', 'FALSE', 'UNVERIFIABLE']);
export type ClaimVerdict = z.infer<typeof ClaimVerdictSchema>;

export const ClaimCheckSchema = z.object({
  claim: z.string(),
  status: ClaimVerdictSchema,
  note: z.string(),
});
export type ClaimCheck = z.infer<typeof ClaimCheckSchema>;

/**
 * Snapshot of the off-chain evidence pass (public sites/repos the shill linked +
 * optional web search). Stored verbatim in the deliverable so the receipt — and
 * its attestation hash — stay reproducible from exactly what was read, since web
 * pages mutate. Feeds the HONESTY axis ONLY; it can never change SAFETY.
 */
export const OffchainSourceKindSchema = z.enum([
  'official_site',
  'github',
  'docs',
  'search_result',
  'reference',
]);
export type OffchainSourceKind = z.infer<typeof OffchainSourceKindSchema>;

export const OffchainSourceSchema = z.object({
  url: z.string(),
  kind: OffchainSourceKindSchema,
  title: z.string(),
  /** false for X/Twitter (never fetched — reference only) and unfetched hits. */
  fetched: z.boolean(),
  excerpt: z.string(),
});
export type OffchainSource = z.infer<typeof OffchainSourceSchema>;

export const OffchainAssessmentSchema = z.object({
  claim: z.string(),
  status: z.enum(['supported', 'contradicted', 'unverifiable']),
  evidence: z.string(),
  source_url: z.string().nullable(),
});
export type OffchainAssessment = z.infer<typeof OffchainAssessmentSchema>;

export const OffchainSnapshotSchema = z.object({
  provider: z.string(),
  query: z.string(),
  searched_at: z.string(),
  sources: z.array(OffchainSourceSchema),
  /** URLs deliberately not fetched (X/Twitter) — kept as references. */
  skipped: z.array(z.string()),
  assessments: z.array(OffchainAssessmentSchema),
});
export type OffchainSnapshot = z.infer<typeof OffchainSnapshotSchema>;

export const AttestationSchema = z.object({
  hash: z.string(),
  timestamp: z.string(),
  chain: z.literal('base'),
});
export type AttestationOut = z.infer<typeof AttestationSchema>;

/** The CAP deliverable (SPEC §7). This is the contract the buyer receives. */
export const OutputSchema = z.object({
  mode: ModeSchema,
  subject: z.string(),
  subject_address: AddressOrNull(),
  source_url: z.string().nullable(),
  claims_detected: z.array(z.string()),
  claim_checks: z.array(ClaimCheckSchema),
  onchain_findings: z.array(OnchainFindingSchema),
  deployer_findings: z.array(DeployerFindingSchema),
  offchain: OffchainSnapshotSchema.nullable(),
  axes: z.array(AxisResultSchema),
  verdict: VerdictSchema,
  confidence: ConfidenceSchema,
  caveats: z.string(),
  receipt_image: z.string(),
  attestation: AttestationSchema,
});
export type ReceiptOutput = z.infer<typeof OutputSchema>;

function AddressOrNull() {
  return z.union([z.string().regex(/^0x[a-fA-F0-9]{40}$/), z.null()]);
}

/** Color tokens used by both the PNG renderer and the website (kept in sync). */
export const VERDICT_COLORS: Record<Verdict, string> = {
  BASED: '#00D17A',
  BULLSHIT: '#FF2D2D',
  RED_FLAGS: '#FF2D2D',
  MIXED: '#FFB020',
  INSUFFICIENT: '#FFB020',
};

/** Human label for the rubber stamp (RED_FLAGS renders as "RED FLAGS"). */
export const VERDICT_LABELS: Record<Verdict, string> = {
  BASED: 'BASED',
  BULLSHIT: 'BULLSHIT',
  RED_FLAGS: 'RED FLAGS',
  MIXED: 'MIXED',
  INSUFFICIENT: 'INSUFFICIENT',
};

/** Axis-status colours (kept in sync with the website's types.ts). */
export const AXIS_STATUS_COLORS: Record<AxisStatus, string> = {
  PASS: '#00D17A',
  WARN: '#FFB020',
  FAIL: '#FF2D2D',
  UNKNOWN: '#777777',
};

/** Per-claim verdict colours. */
export const CLAIM_VERDICT_COLORS: Record<ClaimVerdict, string> = {
  TRUE: '#00D17A',
  FALSE: '#FF2D2D',
  UNVERIFIABLE: '#777777',
};
