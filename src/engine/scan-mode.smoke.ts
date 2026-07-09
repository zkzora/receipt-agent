import type { OnchainFinding } from '../schema/output.js';

/**
 * Deterministic smoke for the scan-tier logic (no network). Sets the tier
 * serviceIds in the env BEFORE importing scan-mode (which reads them via config
 * at module load), then checks resolution + degen-signal gating. Run: `pnpm smoke:mode`.
 */

process.env.CROO_SERVICE_ID_DEGEN = 'svc-degen-xyz';
process.env.CROO_SERVICE_ID_LP = 'svc-lp-xyz';

const { scanModeForService, filterFindingsForMode, DEGEN_METRICS } = await import('./scan-mode.js');

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (cond) console.log(`  ok  ${msg}`);
  else {
    console.error(`  FAIL ${msg}`);
    failures += 1;
  }
}

console.log('scan-mode smoke:');

// ── serviceId → tier resolution ──────────────────────────────────────────
check(scanModeForService('svc-degen-xyz') === 'degen', 'degen serviceId → degen');
check(scanModeForService('svc-lp-xyz') === 'lp', 'lp serviceId → lp');
check(scanModeForService('some-other-id') === 'full', 'unknown serviceId → full');
check(scanModeForService('') === 'full', 'empty serviceId → full');
check(scanModeForService(null) === 'full', 'null serviceId → full');
check(scanModeForService(undefined) === 'full', 'undefined serviceId → full');

// ── degen-signal gating ──────────────────────────────────────────────────
const f = (metric: string): OnchainFinding => ({ metric, value: 'x', source: 's', status: 'ok' });
const findings: OnchainFinding[] = [
  f('true TVL'),
  f('LP burned'),
  f('dex paid'),
  f('trading fees (24h)'),
  f('dev sold'),
  f('launch-slot wallets (heuristic)'),
];

check(DEGEN_METRICS.size === 4, 'four degen metrics registered');

const degen = filterFindingsForMode(findings, 'degen');
check(degen.length === 6, 'degen keeps all findings (incl. degen signals)');

const full = filterFindingsForMode(findings, 'full');
check(full.length === 2, 'full strips the 4 degen signals (keeps 2 core)');
check(!full.some((x) => DEGEN_METRICS.has(x.metric)), 'no degen metric leaks into full');
check(full.some((x) => x.metric === 'true TVL') && full.some((x) => x.metric === 'LP burned'), 'core findings survive full');

const lp = filterFindingsForMode(findings, 'lp');
check(lp.length === 2, 'lp also strips degen signals');

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nscan-mode smoke passed');
