/**
 * Mirror of the receipt-agent CAP deliverable (src/schema/output.ts).
 * Kept narrow to what the web actually reads from `POST /api/analyze.json`.
 */
export type Verdict = 'BASED' | 'BULLSHIT' | 'RED_FLAGS' | 'MIXED' | 'INSUFFICIENT';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type FindingStatus = 'ok' | 'flag' | 'unavailable';

export interface OnchainFinding {
  metric: string;
  value: string;
  source: string;
  status: FindingStatus;
}

export interface DeployerFinding {
  fact: string;
  source: string;
}

export type AxisName = 'SAFETY' | 'HONESTY' | 'DISTRIBUTION';
export type AxisStatus = 'PASS' | 'WARN' | 'FAIL' | 'UNKNOWN';

export interface AxisResult {
  axis: AxisName;
  status: AxisStatus;
  detail: string;
}

export type ClaimVerdict = 'TRUE' | 'FALSE' | 'UNVERIFIABLE';

export interface ClaimCheck {
  claim: string;
  status: ClaimVerdict;
  note: string;
}

export type OffchainSourceKind = 'official_site' | 'github' | 'docs' | 'search_result' | 'reference';

export interface OffchainSource {
  url: string;
  kind: OffchainSourceKind;
  title: string;
  fetched: boolean;
  excerpt: string;
}

export interface OffchainAssessment {
  claim: string;
  status: 'supported' | 'contradicted' | 'unverifiable';
  evidence: string;
  source_url: string | null;
}

export interface OffchainSnapshot {
  provider: string;
  query: string;
  searched_at: string;
  sources: OffchainSource[];
  skipped: string[];
  assessments: OffchainAssessment[];
}

export interface Attestation {
  hash: string;
  timestamp: string;
  chain: string;
}

export interface Analysis {
  mode: 'claim_check' | 'vibe_check' | 'insufficient';
  subject: string;
  subject_address: string | null;
  source_url: string | null;
  claims_detected: string[];
  claim_checks: ClaimCheck[];
  onchain_findings: OnchainFinding[];
  deployer_findings: DeployerFinding[];
  offchain: OffchainSnapshot | null;
  axes: AxisResult[];
  verdict: Verdict;
  confidence: Confidence;
  caveats: string;
  attestation: Attestation;
}

/** Request accepted by the analyze endpoints (src/schema/input.ts). */
export interface AnalyzeRequest {
  x_url?: string;
  claim?: string;
  subject_address?: string;
  chain?: string;
}

/** Stamp colours — must match VERDICT_COLORS in the backend. */
export const VERDICT_COLORS: Record<Verdict, string> = {
  BASED: '#00D17A',
  BULLSHIT: '#FF2D2D',
  RED_FLAGS: '#FF2D2D',
  MIXED: '#FFB020',
  INSUFFICIENT: '#FFB020',
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  BASED: 'BASED',
  BULLSHIT: 'BULLSHIT',
  RED_FLAGS: 'RED FLAGS',
  MIXED: 'MIXED',
  INSUFFICIENT: 'INSUFFICIENT',
};

/** Axis-status colours — must match AXIS_STATUS_COLORS in the backend. */
export const AXIS_STATUS_COLORS: Record<AxisStatus, string> = {
  PASS: '#00D17A',
  WARN: '#FFB020',
  FAIL: '#FF2D2D',
  UNKNOWN: '#777777',
};

export const CLAIM_VERDICT_COLORS: Record<ClaimVerdict, string> = {
  TRUE: '#00D17A',
  FALSE: '#FF2D2D',
  UNVERIFIABLE: '#777777',
};

/** CSS class on the stamp element, drives colour via index.css. */
export function verdictClass(v: Verdict): string {
  return 'v-' + v.toLowerCase();
}
