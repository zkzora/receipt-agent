import type { Analysis } from '../lib/types.ts';

/**
 * Full example results (shape-identical to the live agent's JSON deliverable),
 * one per scan tier, used to preview the compact result UI without a live call.
 * Swap for a real `POST /scan` response once the endpoint is wired.
 */
export const DEMO_RESULTS: Record<string, Analysis> = {
  degen: {
    mode: 'vibe_check',
    scan_mode: 'degen',
    subject: '$WIF',
    subject_address: '9nEqaUcb16sQ3Tn1psbkWqyhPdLmfHWjKGymREjsAgpump',
    chain: 'solana',
    source_url: null,
    claims_detected: [],
    claim_checks: [],
    onchain_findings: [
      { metric: 'mint permission', value: 'active', source: 'spl-token', status: 'flag' },
      { metric: 'freeze permission', value: 'revoked', source: 'spl-token', status: 'ok' },
      { metric: 'true TVL', value: '$18.4K', source: 'dexscreener', status: 'ok' },
      { metric: 'LP status', value: 'bonding curve — protocol-locked', source: 'pump.fun', status: 'ok' },
      { metric: 'pair age', value: '6h', source: 'dexscreener', status: 'flag' },
      { metric: 'top-5 holders', value: '54%', source: 'solana-rpc', status: 'flag' },
      { metric: 'largest non-AMM wallet', value: '19%', source: 'solana-rpc', status: 'flag' },
      { metric: 'dex paid', value: 'no', source: 'dexscreener', status: 'ok' },
      { metric: 'trading fees (24h)', value: '$412', source: 'raydium', status: 'ok' },
      { metric: 'dev sold', value: 'yes', source: 'solana-rpc', status: 'flag' },
      { metric: 'launch-slot wallets (heuristic)', value: '31% of supply, 14 wallets', source: 'solana-rpc', status: 'flag' },
    ],
    deployer_findings: [
      { fact: 'deployed 6h ago by 4xTq…8kR2', source: 'solana-rpc' },
      { fact: 'creator currently holds 2.1% of supply', source: 'solana-rpc' },
    ],
    offchain: {
      provider: 'dexscreener',
      query: '',
      searched_at: '2026-07-12T09:14:00.000Z',
      sources: [
        { url: 'https://wifsol.xyz', kind: 'official_site', title: 'WIF', fetched: true, excerpt: '' },
      ],
      skipped: [],
      assessments: [],
      narrative: 'Claims to be a community dog memecoin on Solana with liquidity "locked and thrown away".',
    },
    axes: [
      { axis: 'SAFETY', status: 'WARN', detail: 'mint permission still active' },
      { axis: 'HONESTY', status: 'UNKNOWN', detail: 'no claims stated' },
      { axis: 'DISTRIBUTION', status: 'FAIL', detail: 'top-5 hold 54%; dev sold' },
    ],
    verdict: 'RED_FLAGS',
    confidence: 'HIGH',
    caveats:
      'Supply still mintable, creator has sold, and a launch-slot cohort holds 31% — high rug/dump risk.',
    attestation: {
      hash: '0x8f3ad9c1e7b24a55d0148704fb3af31e9aeccf2bca7235dc31a17e4c9403140',
      timestamp: '2026-07-12T09:14:02.000Z',
      chain: 'base',
    },
  },

  lp: {
    mode: 'vibe_check',
    scan_mode: 'lp',
    subject: '$MOON',
    subject_address: 'BhV5s2mQ8yKfN3xR7wZ1dP4uT6cA9eLmY2nH8jXvQpump',
    chain: 'solana',
    source_url: null,
    claims_detected: [],
    claim_checks: [],
    onchain_findings: [
      { metric: 'true TVL', value: '$74.2K', source: 'dexscreener', status: 'ok' },
      { metric: 'FDV', value: '$310K', source: 'dexscreener', status: 'ok' },
      { metric: 'pair age', value: '11d', source: 'dexscreener', status: 'ok' },
      { metric: 'LP burned', value: 'yes (PumpSwap migration)', source: 'pump.fun', status: 'ok' },
      { metric: 'top-5 holders', value: '22%', source: 'solana-rpc', status: 'ok' },
      { metric: 'largest non-AMM wallet', value: '7.4%', source: 'solana-rpc', status: 'ok' },
    ],
    deployer_findings: [],
    offchain: null,
    axes: [
      { axis: 'SAFETY', status: 'PASS', detail: 'no scam mechanics' },
      { axis: 'HONESTY', status: 'UNKNOWN', detail: 'no claims stated' },
      { axis: 'DISTRIBUTION', status: 'PASS', detail: 'top-5 22%' },
    ],
    verdict: 'BASED',
    confidence: 'HIGH',
    caveats: '',
    attestation: {
      hash: '0x2c91a4773ed2abe08d0148704fb3af31e9aeccf2bca7235dc31a17e4b09250',
      timestamp: '2026-07-12T09:15:40.000Z',
      chain: 'base',
    },
  },

  full: {
    mode: 'claim_check',
    scan_mode: 'full',
    subject: '$LUNAR',
    subject_address: '0x9f2a000000000000000000000000000000000c81',
    chain: 'base',
    source_url: 'https://x.com/someshiller/status/123',
    claims_detected: ['fully audited', '10M TVL', 'LP locked'],
    claim_checks: [
      { claim: 'fully audited', status: 'FALSE', note: 'contract is unverified' },
      { claim: '10M TVL', status: 'FALSE', note: 'true TVL $42K' },
      { claim: 'LP locked', status: 'UNVERIFIABLE', note: 'LP not in a known locker' },
    ],
    onchain_findings: [
      { metric: 'contract', value: 'UNVERIFIED', source: 'basescan', status: 'flag' },
      { metric: 'security score', value: '35/100', source: 'goplus', status: 'flag' },
      { metric: 'honeypot', value: 'none', source: 'goplus', status: 'ok' },
      { metric: 'tax b/s', value: '4% / 35%', source: 'goplus', status: 'flag' },
      { metric: 'true TVL', value: '$42K', source: 'dexscreener', status: 'ok' },
      { metric: 'top-5 holders', value: '68%', source: 'goplus', status: 'flag' },
    ],
    deployer_findings: [
      { fact: '7 prior deploys, 5 LP-pulled within 48h', source: 'basescan' },
    ],
    offchain: {
      provider: 'brave',
      query: '$LUNAR audit',
      searched_at: '2026-07-12T09:16:00.000Z',
      sources: [
        { url: 'https://lunar.example', kind: 'official_site', title: 'LUNAR', fetched: true, excerpt: '' },
        { url: 'https://github.com/lunar', kind: 'github', title: 'repo', fetched: true, excerpt: '' },
      ],
      skipped: ['https://x.com/someshiller/status/123'],
      assessments: [],
      narrative: 'Claims to be a fully-audited, tier-1-backed liquidity protocol on Base.',
    },
    axes: [
      { axis: 'SAFETY', status: 'FAIL', detail: 'security score 35/100' },
      { axis: 'HONESTY', status: 'FAIL', detail: '2/3 claims contradicted' },
      { axis: 'DISTRIBUTION', status: 'WARN', detail: 'top-5 hold 68%' },
    ],
    verdict: 'BULLSHIT',
    confidence: 'HIGH',
    caveats: '',
    attestation: {
      hash: '0xeaa2dfda9f3cd94e33d30ea00e74c28da15bf29a4505dc41716eb3251d7634f4',
      timestamp: '2026-07-12T09:16:12.000Z',
      chain: 'base',
    },
  },
};
