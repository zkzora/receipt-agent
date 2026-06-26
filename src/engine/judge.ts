import { chatJson } from '../llm/client.js';
import { logger } from '../logger.js';
import type { Evidence } from './evidence/index.js';
import { fmtPct, fmtUsd } from './evidence/util.js';

const log = logger.child({ mod: 'judge' });

export interface Judgement {
  /** The model's lean. Gating is authoritative; this only fills the narrative. */
  lean: 'BASED' | 'BULLSHIT' | 'RED_FLAGS' | 'MIXED';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** One-sentence verdict for the receipt. */
  summary: string;
  /** Optional disclaimer / nuance. */
  caveats: string;
}

const SYSTEM = `You are the judgment stage of an on-chain lie detector ("RECEIPT").
You are given a token's claims and the on-chain evidence gathered about it.
Weigh the claims against reality and respond with ONLY a JSON object:
{
  "lean": "BASED" | "BULLSHIT" | "RED_FLAGS" | "MIXED",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "summary": "one blunt sentence verdict, plain English, no hedging",
  "caveats": "short note on data gaps or nuance, or empty string"
}
Guidance: BASED = claims hold up and on-chain looks clean. BULLSHIT = claims are
contradicted or it shows scam mechanics (honeypot, extreme tax, unverified + whale-held).
RED_FLAGS = serious risks even if not an outright scam. MIXED = some claims true, some false.
Be specific and cite the numbers. Confidence LOW when key data is missing.`;

/**
 * LLM judgment over the evidence. Produces the human-readable verdict text. The
 * final BASED/BULLSHIT stamp is decided deterministically in gating.ts — the LLM
 * never gets to override a honeypot — so this is safe to skip when unavailable.
 */
export async function judge(
  subject: string,
  claims: string[],
  evidence: Evidence,
): Promise<Judgement | null> {
  const out = await chatJson<Partial<Judgement>>({
    system: SYSTEM,
    user: buildPrompt(subject, claims, evidence),
    maxTokens: 600,
  });
  if (!out || typeof out.summary !== 'string') {
    log.warn('LLM judge unavailable — gating will synthesise a summary');
    return null;
  }
  return {
    lean: isLean(out.lean) ? out.lean : 'MIXED',
    confidence: isConfidence(out.confidence) ? out.confidence : 'LOW',
    summary: out.summary.trim(),
    caveats: typeof out.caveats === 'string' ? out.caveats.trim() : '',
  };
}

function buildPrompt(subject: string, claims: string[], e: Evidence): string {
  const lines: string[] = [`Token: ${subject}`];
  lines.push(claims.length ? `Claims:\n${claims.map((c) => `- ${c}`).join('\n')}` : 'Claims: (none stated)');

  lines.push('\nOn-chain evidence:');
  if (e.security.available) {
    lines.push(
      `- security score ${e.security.securityScore}/100 (${e.security.provider})` +
        `; honeypot=${e.security.isHoneypot}; verified=${e.security.verified}` +
        `; buy/sell tax ${fmtPct(e.security.buyTaxPct)}/${fmtPct(e.security.sellTaxPct)}` +
        (e.security.vulnerabilities.length ? `; flags: ${e.security.vulnerabilities.join(', ')}` : ''),
    );
  } else {
    lines.push('- security: no data');
  }
  lines.push(
    e.liquidity.available
      ? `- liquidity ${fmtUsd(e.liquidity.liquidityUsd)}, FDV ${fmtUsd(e.liquidity.fdvUsd)}, pair age ${e.liquidity.pairAgeDays?.toFixed(1) ?? 'n/a'}d`
      : '- liquidity: no data',
  );
  lines.push(
    e.holders.available
      ? `- top-5 holders ${fmtPct(e.holders.top5Pct)}, holder count ${e.holders.holderCount ?? 'n/a'}, LP locked=${e.holders.lpLocked}`
      : '- holders: no data',
  );
  lines.push(
    e.deployer.available
      ? `- deployer ${e.deployer.creator}, contract age ${e.deployer.contractAgeDays?.toFixed(1) ?? 'n/a'}d, prior deploys ${e.deployer.priorDeploys ?? 'n/a'}`
      : '- deployer: no data',
  );
  return lines.join('\n');
}

function isLean(v: unknown): v is Judgement['lean'] {
  return v === 'BASED' || v === 'BULLSHIT' || v === 'RED_FLAGS' || v === 'MIXED';
}
function isConfidence(v: unknown): v is Judgement['confidence'] {
  return v === 'HIGH' || v === 'MEDIUM' || v === 'LOW';
}
