import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { attestDeliverable } from '../cap/client.js';
import { runPipeline } from '../engine/pipeline.js';
import { receiptModelFromAnalysis } from './from-analysis.js';
import { renderReceiptPng } from './render.js';

/**
 * `pnpm run smoke:solana` — synthesizes a CAP order for a known Solana token CA
 * and runs it through the REAL pipeline (classify → gatherEvidenceSolana → judge
 * → gate → render), hitting live RPC + DexScreener + Raydium, then writes the PNG
 * to ./receipts-out. End-to-end proof the chain router + Solana evidence pipeline
 * works, not just a hand-built model (see smoke.ts for the pure-render,
 * network-free EVM version). No CAP negotiate/pay lifecycle needed — this calls
 * runPipeline() directly, the same seam the CAP provider and /dev/analyze use.
 */
const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

async function main() {
  const requirements = {
    claim: '$BONK — LP burned, mint renounced, no dev wallet, fully organic community coin.',
    subject_address: BONK_MINT,
    chain: 'solana',
  };

  console.log(`running Solana pipeline against ${BONK_MINT} …`);
  const analysis = await runPipeline(requirements, {});
  console.log(`verdict: ${analysis.verdict} (${analysis.confidence}) — chain=${analysis.chain}`);

  const attestation = attestDeliverable({ ...analysis });
  const model = receiptModelFromAnalysis(analysis, attestation);
  const png = await renderReceiptPng(model);

  const out = resolve(process.cwd(), 'receipts-out', 'smoke-solana-receipt.png');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, png);

  console.log(`wrote ${out} (${png.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
