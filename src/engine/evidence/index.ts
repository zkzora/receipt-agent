import { logger } from '../../logger.js';
import type { CapClient } from '../../cap/types.js';
import { securityCheck } from './security.js';
import { liquidityCheck } from './liquidity.js';
import { holdersCheck } from './holders.js';
import { deployerCheck } from './deployer.js';
import type { Evidence } from './types.js';

const log = logger.child({ mod: 'evidence' });

export type { Evidence } from './types.js';

/**
 * Run all four evidence streams concurrently and assemble the bundle the judge +
 * gating steps consume. Each provider is internally guarded, so one slow or dead
 * source degrades to `available:false` rather than failing the whole receipt.
 */
export async function gatherEvidence(address: string, cap?: CapClient): Promise<Evidence> {
  const t0 = Date.now();
  // Holders runs after liquidity so it can exclude the AMM pools DexScreener found
  // from the concentration figure. Its GoPlus fetch is the same memoised call
  // securityCheck already warmed, so this adds processing, not a round-trip
  // (except in live A2A-security mode, where holders makes the one GoPlus call).
  const [security, liquidity, deployer] = await Promise.all([
    securityCheck(address, cap),
    liquidityCheck(address),
    deployerCheck(address),
  ]);
  const holders = await holdersCheck(address, liquidity.signal.pairAddresses);

  const evidence: Evidence = {
    security: security.signal,
    liquidity: liquidity.signal,
    holders: holders.signal,
    deployer: deployer.signal,
    onchainFindings: [...security.findings, ...liquidity.findings, ...holders.findings],
    deployerFindings: deployer.findings,
  };

  log.info(
    {
      ms: Date.now() - t0,
      security: security.signal.available,
      liquidity: liquidity.signal.available,
      holders: holders.signal.available,
      deployer: deployer.signal.available,
    },
    'evidence gathered',
  );
  return evidence;
}
