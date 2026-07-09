import { PublicKey } from '@solana/web3.js';
import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, type Mint } from '@solana/spl-token';
import { logger } from '../../../logger.js';
import type { OnchainFinding } from '../../../schema/output.js';
import type { ProviderResult, SecuritySignal } from '../types.js';
import { solanaConnection } from './connection.js';

const log = logger.child({ mod: 'solana-mint' });

export interface MintInfo {
  address: PublicKey;
  programId: PublicKey;
  mint: Mint;
}

/**
 * Fetch raw mint account data once — shared by the security check (this file),
 * the holders check (needs total supply + the token program id to decode
 * largest-account owners), and the deployer check. Returns null when the
 * address isn't a token mint at all (bad CA, or a wallet address was pasted).
 */
export async function fetchMintInfo(address: string): Promise<MintInfo | null> {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(address);
  } catch {
    return null;
  }
  try {
    const acctInfo = await solanaConnection.getAccountInfo(pubkey);
    if (!acctInfo) return null;
    const programId = acctInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const mint = await getMint(solanaConnection, pubkey, 'confirmed', programId);
    return { address: pubkey, programId, mint };
  } catch (err) {
    log.warn({ err: String(err), address }, 'getMint failed');
    return null;
  }
}

/**
 * Check A (Solana) — SAFETY: mint + freeze authority.
 *
 * Freeze authority lets the issuer halt transfers on any holder's account at
 * will — the direct Solana analogue of an EVM honeypot switch, so it hard-gates
 * the same way `isHoneypot` does in gating.ts. Mint authority lets the issuer
 * inflate supply at will — real risk, but soft-flagged (score hit + vulnerability
 * note) to match how EVM's "mintable" is treated, since many legitimate tokens
 * keep it active during early bootstrapping.
 */
export function buildSecuritySignal(info: MintInfo | null): ProviderResult<SecuritySignal> {
  if (!info) {
    return {
      signal: emptySignal(),
      findings: [{ metric: 'mint account', value: 'no data', source: 'solana-rpc', status: 'unavailable' }],
    };
  }

  const mintAuthorityActive = info.mint.mintAuthority !== null;
  const freezeAuthorityActive = info.mint.freezeAuthority !== null;

  let score = 100;
  const vulns: string[] = [];
  let isHoneypot = false;
  if (freezeAuthorityActive) {
    isHoneypot = true;
    score = 0;
    vulns.push('freeze authority active — issuer can freeze any holder\'s tokens (honeypot risk)');
  }
  if (mintAuthorityActive) {
    score -= 30;
    vulns.push('mint authority active — supply can be inflated at will');
  }
  score = clampScore(score);

  const signal: SecuritySignal = {
    available: true,
    securityScore: score,
    isHoneypot,
    cannotSell: null,
    buyTaxPct: null,
    sellTaxPct: null,
    verified: null,
    ownerCanMint: mintAuthorityActive,
    vulnerabilities: vulns,
    provider: 'solana-rpc',
  };

  const findings: OnchainFinding[] = [
    {
      metric: 'mint authority',
      value: mintAuthorityActive ? 'ACTIVE' : 'renounced',
      source: 'solana-rpc',
      status: mintAuthorityActive ? 'flag' : 'ok',
    },
    {
      metric: 'freeze authority',
      value: freezeAuthorityActive ? 'ACTIVE' : 'renounced',
      source: 'solana-rpc',
      status: freezeAuthorityActive ? 'flag' : 'ok',
    },
    { metric: 'security score', value: `${score}/100`, source: 'solana-rpc', status: score < 60 ? 'flag' : 'ok' },
  ];
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
    provider: 'solana-rpc',
  };
}
