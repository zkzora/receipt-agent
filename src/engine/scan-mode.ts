import { config } from '../config.js';
import type { OnchainFinding, ScanMode } from '../schema/output.js';

/**
 * Which service tier an incoming order maps to. The three CROO services share one
 * agent + pipeline; the serviceId is the only thing that distinguishes them.
 * See src/schema/output.ts `ScanMode` for what each tier does.
 */

/**
 * On-chain findings that are exclusive to the Degen Scan tier — the "degen alpha"
 * signals layered on top of the core 3-axis scan. Matched by their exact `metric`
 * string as emitted by the Solana evidence streams:
 *   - 'dex paid'                     → solana/liquidity.ts (dexPaidCheck)
 *   - 'trading fees (24h)'           → solana/liquidity.ts (raydiumBurnCheck)
 *   - 'dev sold'                     → solana/deployer.ts
 *   - 'launch-slot wallets (heuristic)' → solana/bundle.ts
 * Keep this in sync if a metric label above changes.
 */
export const DEGEN_METRICS: ReadonlySet<string> = new Set([
  'dex paid',
  'trading fees (24h)',
  'dev sold',
  'creator holds',
  'launch-slot wallets (heuristic)',
]);

/** Resolve the scan tier from an order's serviceId. Unknown/blank → `full`. */
export function scanModeForService(serviceId: string | null | undefined): ScanMode {
  const id = serviceId?.trim();
  if (!id) return 'full';
  if (config.cap.degenServiceId && id === config.cap.degenServiceId) return 'degen';
  if (config.cap.lpServiceId && id === config.cap.lpServiceId) return 'lp';
  return 'full';
}

/**
 * Gate the degen-only signals to the Degen tier. `degen` keeps everything;
 * `full` and `lp` strip the degen-exclusive findings so those receipts stay
 * focused (and so the cheaper tiers don't leak the paid tier's extra signals).
 */
export function filterFindingsForMode(findings: OnchainFinding[], mode: ScanMode): OnchainFinding[] {
  if (mode === 'degen') return findings;
  return findings.filter((f) => !DEGEN_METRICS.has(f.metric));
}
