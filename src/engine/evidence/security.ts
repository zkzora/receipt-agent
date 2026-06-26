import { config } from '../../config.js';
import { logger } from '../../logger.js';
import type { CapClient } from '../../cap/types.js';
import type { OnchainFinding } from '../../schema/output.js';
import { callSubAgent } from '../a2a.js';
import { getTokenSecurity } from './goplus.js';
import { bool01, fmtPct, pctFromFraction } from './util.js';
import type { ProviderResult, SecuritySignal } from './types.js';

const log = logger.child({ mod: 'security' });

/** Shape we expect back from the ChainGuard A2A auditor (SUBAGENT_SECURITY_SERVICE_ID). */
interface ChainGuardResult {
  securityScore?: number;
  vulnerabilities?: string[];
  isHoneypot?: boolean;
}

/**
 * Check A — security audit.
 *
 * Composes the external ChainGuard auditor over CAP when one is configured AND we
 * have a live connection; otherwise derives a local score from GoPlus Token
 * Security. The two paths return the same {@link SecuritySignal} shape so gating
 * doesn't care which produced it.
 */
export async function securityCheck(
  address: string,
  cap?: CapClient,
): Promise<ProviderResult<SecuritySignal>> {
  const serviceId = config.subAgents.security;
  if (serviceId && config.cap.mode === 'live' && cap) {
    const viaA2A = await securityViaA2A(address, serviceId, cap);
    if (viaA2A) return viaA2A;
    log.warn('ChainGuard A2A unavailable — falling back to local GoPlus');
  }
  return securityViaGoPlus(address);
}

async function securityViaA2A(
  address: string,
  serviceId: string,
  cap: CapClient,
): Promise<ProviderResult<SecuritySignal> | null> {
  const out = await callSubAgent<ChainGuardResult>(cap, serviceId, { contractAddress: address });
  if (!out || typeof out.securityScore !== 'number') return null;

  const score = clampScore(out.securityScore);
  const vulns = Array.isArray(out.vulnerabilities) ? out.vulnerabilities : [];
  const signal: SecuritySignal = {
    available: true,
    securityScore: score,
    isHoneypot: out.isHoneypot ?? null,
    cannotSell: null,
    buyTaxPct: null,
    sellTaxPct: null,
    verified: null,
    ownerCanMint: null,
    vulnerabilities: vulns,
    provider: 'ChainGuard A2A',
  };
  const findings: OnchainFinding[] = [
    { metric: 'security score', value: `${score}/100`, source: 'ChainGuard A2A', status: score < 60 ? 'flag' : 'ok' },
  ];
  if (out.isHoneypot != null) {
    findings.push({ metric: 'honeypot', value: out.isHoneypot ? 'YES' : 'none', source: 'ChainGuard A2A', status: out.isHoneypot ? 'flag' : 'ok' });
  }
  return { signal, findings };
}

async function securityViaGoPlus(address: string): Promise<ProviderResult<SecuritySignal>> {
  const t = await getTokenSecurity(address);
  if (!t) {
    return {
      signal: emptySignal(),
      findings: [{ metric: 'contract security', value: 'no data', source: 'goplus', status: 'unavailable' }],
    };
  }

  const isHoneypot = bool01(t.is_honeypot);
  const cannotSell = bool01(t.cannot_sell_all);
  const buyTax = pctFromFraction(t.buy_tax);
  const sellTax = pctFromFraction(t.sell_tax);
  const verified = bool01(t.is_open_source);
  const mintable = bool01(t.is_mintable);
  const takeBack = bool01(t.can_take_back_ownership);
  const hiddenOwner = bool01(t.hidden_owner);
  const pausable = bool01(t.transfer_pausable);
  const slippageMod = bool01(t.slippage_modifiable);

  // Deterministic local risk score: start clean, subtract for each red flag.
  let score = 100;
  const vulns: string[] = [];
  if (isHoneypot) {
    score = 0;
    vulns.push('honeypot: sells blocked');
  }
  if (cannotSell) {
    score = Math.min(score, 5);
    vulns.push('cannot sell entire balance');
  }
  if (sellTax != null && sellTax >= 50) {
    score = Math.min(score, 10);
    vulns.push(`extreme sell tax ${fmtPct(sellTax)}`);
  } else if (sellTax != null && sellTax > 10) {
    score -= 30;
    vulns.push(`high sell tax ${fmtPct(sellTax)}`);
  }
  if (buyTax != null && buyTax > 10) {
    score -= 15;
    vulns.push(`high buy tax ${fmtPct(buyTax)}`);
  }
  if (verified === false) {
    score -= 25;
    vulns.push('source not verified');
  }
  if (takeBack) {
    score -= 20;
    vulns.push('owner can reclaim ownership');
  }
  if (hiddenOwner) {
    score -= 25;
    vulns.push('hidden owner');
  }
  if (mintable) {
    score -= 10;
    vulns.push('supply is mintable');
  }
  if (pausable) {
    score -= 15;
    vulns.push('transfers pausable');
  }
  if (slippageMod) {
    score -= 10;
    vulns.push('tax is modifiable');
  }
  score = clampScore(score);

  const signal: SecuritySignal = {
    available: true,
    securityScore: score,
    isHoneypot,
    cannotSell,
    buyTaxPct: buyTax,
    sellTaxPct: sellTax,
    verified,
    ownerCanMint: mintable,
    vulnerabilities: vulns,
    provider: 'goplus',
  };

  const findings: OnchainFinding[] = [
    { metric: 'security score', value: `${score}/100`, source: 'goplus', status: score < 60 ? 'flag' : 'ok' },
    {
      metric: 'contract',
      value: verified == null ? 'unknown' : verified ? 'verified' : 'UNVERIFIED',
      source: 'goplus',
      status: verified == null ? 'unavailable' : verified ? 'ok' : 'flag',
    },
    {
      metric: 'honeypot',
      value: isHoneypot == null ? 'unknown' : isHoneypot ? 'YES' : 'none',
      source: 'goplus',
      status: isHoneypot == null ? 'unavailable' : isHoneypot ? 'flag' : 'ok',
    },
  ];
  if (buyTax != null || sellTax != null) {
    findings.push({
      metric: 'tax b/s',
      value: `${fmtPct(buyTax)} / ${fmtPct(sellTax)}`,
      source: 'goplus',
      status: (sellTax ?? 0) > 10 || (buyTax ?? 0) > 10 ? 'flag' : 'ok',
    });
  }
  return { signal, findings };
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function emptySignal(): SecuritySignal {
  return {
    available: false,
    securityScore: null,
    isHoneypot: null,
    cannotSell: null,
    buyTaxPct: null,
    sellTaxPct: null,
    verified: null,
    ownerCanMint: null,
    vulnerabilities: [],
    provider: 'goplus',
  };
}
