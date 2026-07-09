import { logger } from '../../../logger.js';
import type { Evidence } from '../types.js';
import { fetchMintInfo, buildSecuritySignal } from './mint.js';
import { findLaunchInfo } from './launch.js';
import { solanaLiquidityCheck } from './liquidity.js';
import { solanaHoldersCheck } from './holders.js';
import { solanaDeployerCheck } from './deployer.js';
import { solanaBundleCheck } from './bundle.js';

const log = logger.child({ mod: 'solana-evidence' });

/**
 * Run all Solana evidence streams and assemble the same {@link Evidence}
 * bundle the Base pipeline produces, so judge.ts / gating.ts run completely
 * unchanged regardless of which chain the token is on. The mint account and
 * the launch-info lookup (bounded signature scan — see launch.ts) are each
 * fetched once up front and shared, rather than the deployer/bundle checks
 * independently re-running the same expensive scan.
 */
export async function gatherEvidenceSolana(address: string): Promise<Evidence> {
  const t0 = Date.now();
  const mintInfo = await fetchMintInfo(address);
  const security = buildSecuritySignal(mintInfo);
  const launchInfo = mintInfo ? await findLaunchInfo(mintInfo.address) : null;

  const [liquidity, deployer, bundle] = await Promise.all([
    solanaLiquidityCheck(address),
    solanaDeployerCheck(mintInfo, launchInfo),
    solanaBundleCheck(mintInfo, launchInfo),
  ]);
  const holders = await solanaHoldersCheck(mintInfo, liquidity.signal.pairAddresses, liquidity.lpBurnedOrLocked);

  const evidence: Evidence = {
    security: security.signal,
    liquidity: liquidity.signal,
    holders: holders.signal,
    deployer: deployer.signal,
    onchainFindings: [
      ...security.findings,
      ...liquidity.findings,
      ...holders.findings,
      ...deployer.onchainFindings,
      ...bundle.findings,
    ],
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
    'solana evidence gathered',
  );
  return evidence;
}
