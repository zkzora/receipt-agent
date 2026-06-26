import type { OnchainFinding, DeployerFinding } from '../../schema/output.js';

/**
 * Each evidence stream resolves to a typed *signal* (consumed by the deterministic
 * gating step) plus the human-facing *findings* it printed (consumed by the
 * receipt renderer). `available:false` means the source could not be reached or
 * had no record — never treated as a pass or a fail, only as missing data.
 */

export interface SecuritySignal {
  available: boolean;
  /** 0–100; lower = riskier. Derived locally or returned by the A2A auditor. */
  securityScore: number | null;
  isHoneypot: boolean | null;
  cannotSell: boolean | null;
  buyTaxPct: number | null;
  sellTaxPct: number | null;
  verified: boolean | null;
  ownerCanMint: boolean | null;
  vulnerabilities: string[];
  /** "goplus" (local) or "ChainGuard A2A". */
  provider: string;
}

export interface LiquiditySignal {
  available: boolean;
  liquidityUsd: number | null;
  fdvUsd: number | null;
  priceUsd: number | null;
  pairAgeDays: number | null;
  dex: string | null;
  symbol: string | null;
  /** Lowercased addresses of every Base AMM pair found for this token. Fed to the
   *  holders stream so pools are excluded from concentration even when GoPlus
   *  never tagged them as such. */
  pairAddresses: string[];
  /** Project-registered URLs (website / docs / repo / socials) DexScreener
   *  surfaces — keyless discovery for the off-chain HONESTY pass. */
  links: string[];
  provider: string;
}

export interface HoldersSignal {
  available: boolean;
  /** Concentration of the top 5 non-LP / non-burn holders, as a percent. */
  top5Pct: number | null;
  holderCount: number | null;
  lpLocked: boolean | null;
  provider: string;
}

export interface DeployerSignal {
  available: boolean;
  creator: string | null;
  contractAgeDays: number | null;
  priorDeploys: number | null;
  provider: string;
}

export interface ProviderResult<S> {
  signal: S;
  findings: OnchainFinding[];
}

export interface Evidence {
  security: SecuritySignal;
  liquidity: LiquiditySignal;
  holders: HoldersSignal;
  deployer: DeployerSignal;
  onchainFindings: OnchainFinding[];
  deployerFindings: DeployerFinding[];
}
