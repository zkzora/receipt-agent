import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { attestDeliverable } from '../cap/client.js';
import { buildReceiptModel } from './format.js';
import { renderReceiptPng } from './render.js';

/**
 * `pnpm smoke:receipt` — renders one sample receipt to ./receipts-out so you can
 * eyeball the PNG without booting CAP. Pure render path, no network.
 */
async function main() {
  const attestation = attestDeliverable({ demo: 'smoke', subject: '$LUNAR' });
  const model = buildReceiptModel({
    subject: '$LUNAR',
    subjectAddress: '0x9f2a000000000000000000000000000000000c81',
    sourceUrl: null,
    isManual: true,
    claims: ['fully audited · 10M TVL · tier-1 backed · LP locked'],
    claimChecks: [
      { claim: 'fully audited', status: 'FALSE', note: 'contract is unverified' },
      { claim: '10M TVL', status: 'FALSE', note: 'true TVL $42K' },
      { claim: 'LP locked', status: 'UNVERIFIABLE', note: 'lock status unknown' },
    ],
    findings: [
      { metric: 'contract', value: 'UNVERIFIED', source: 'basescan', status: 'flag' },
      { metric: 'true TVL', value: '$42,000', source: 'dexscreener', status: 'flag' },
      { metric: 'top-5 holders', value: '68%', source: 'rpc', status: 'flag' },
      { metric: 'honeypot', value: 'none', source: 'goplus', status: 'ok' },
      { metric: 'tax b/s', value: '4% / 35%', source: 'goplus', status: 'flag' },
    ],
    deployer: [{ fact: '7 prior deploys, 5 LP-pulled <48h' }],
    offchain: {
      provider: 'linked-urls',
      query: '$LUNAR official site',
      searched_at: new Date().toISOString(),
      sources: [
        { url: 'https://lunar.example', kind: 'official_site', title: 'LUNAR', fetched: true, excerpt: '' },
        { url: 'https://github.com/lunar/contracts', kind: 'github', title: '', fetched: false, excerpt: '' },
      ],
      skipped: ['https://x.com/lunar/status/123'],
      assessments: [],
    },
    axes: [
      { axis: 'SAFETY', status: 'FAIL', detail: 'sell tax 35%' },
      { axis: 'HONESTY', status: 'FAIL', detail: '2/3 claims contradicted' },
      { axis: 'DISTRIBUTION', status: 'WARN', detail: 'top-5 hold 68%' },
    ],
    verdict: 'BULLSHIT',
    confidence: 'HIGH',
    note: '',
    attestation,
  });

  const png = await renderReceiptPng(model);
  const out = resolve(process.cwd(), 'receipts-out', 'smoke-receipt.png');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, png);

  console.log(`wrote ${out} (${png.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
