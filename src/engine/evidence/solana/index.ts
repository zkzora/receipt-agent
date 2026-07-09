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
export async function gatherEvidenceSolana(
  address: string,
  scope: 'full' | 'lp' = 'full',
): Promise<Evidence> {
  const t0 = Date.now();
  const mintInfo = await fetchMintInfo(address);
  const security = buildSecuritySignal(mintInfo);

  // LP tier: liquidity-focused. Fetch only what's cheap + relevant (mint account
  // is already in hand for SAFETY + holders); skip the bounded launch-signature
  // scan and the RPC-heavy deployer/bundle streams entirely.
  if (scope === 'lp') {
    const liquidity = await solanaLiquidityCheck(address);
    const holders = await solanaHoldersCheck(
      mintInfo,
      liquidity.signal.pairAddresses,
      liquidity.lpBurnedOrLocked,
    );
    const lpEvidence: Evidence = {
      security: security.signal,
      liquidity: liquidity.signal,
      holders: holders.signal,
      deployer: { available: false, creator: null, contractAgeDays: null, priorDeploys: null, provider: 'solana-rpc' },
      onchainFindings: [...security.findings, ...liquidity.findings, ...holders.findings],
      deployerFindings: [],
    };
    log.info({ ms: Date.now() - t0, scope: 'lp', liquidity: liquidity.signal.available }, 'solana evidence gathered');
    return lpEvidence;
  }

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
