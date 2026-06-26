import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import type { DeployerFinding } from '../../schema/output.js';
import { fetchJson } from './http.js';
import { shortAddr } from './util.js';
import type { DeployerSignal } from './types.js';

const log = logger.child({ mod: 'deployer' });

/**
 * Check C — deployer history (local fallback; SUBAGENT_DEPLOYER_SERVICE_ID blank).
 *
 * Uses Basescan to find the contract's creator + creation tx, then the RPC to get
 * the creation block's timestamp (→ contract age). Best-effort: also counts how
 * many contracts the creator has deployed. Per the SPEC §5 hard rule we only
 * emit *facts* here (address, age, count) — never a label like "scammer".
 */
const BASESCAN_API = 'https://api.basescan.org/api';

interface CreationResponse {
  status?: string;
  result?: { contractCreator?: string; txHash?: string }[];
}

interface TxListResponse {
  status?: string;
  result?: { to?: string; contractAddress?: string }[] | string;
}

export interface DeployerResult {
  signal: DeployerSignal;
  findings: DeployerFinding[];
}

const publicClient = createPublicClient({ chain: base, transport: http(config.chain.rpcUrl) });

export async function deployerCheck(address: string): Promise<DeployerResult> {
  const apiKey = config.chain.basescanApiKey;
  if (!apiKey) {
    log.warn('BASESCAN_API_KEY not set — skipping deployer history');
    return { signal: empty(), findings: [] };
  }

  let creator: string | null = null;
  let txHash: string | null = null;
  try {
    const url = `${BASESCAN_API}?module=contract&action=getcontractcreation&contractaddresses=${address}&apikey=${apiKey}`;
    const res = await fetchJson<CreationResponse>(url, { timeoutMs: 10_000 });
    const row = res.result?.[0];
    creator = row?.contractCreator ?? null;
    txHash = row?.txHash ?? null;
  } catch (err) {
    log.warn({ err: String(err), address }, 'Basescan getcontractcreation failed');
    return { signal: empty(), findings: [] };
  }

  if (!creator) {
    return { signal: empty(), findings: [] };
  }

  const contractAgeDays = await ageFromCreationTx(txHash);
  const priorDeploys = await countDeploys(creator, apiKey);

  const signal: DeployerSignal = {
    available: true,
    creator,
    contractAgeDays,
    priorDeploys,
    provider: 'basescan',
  };

  const findings: DeployerFinding[] = [];
  if (contractAgeDays != null) {
    const age = contractAgeDays < 1 ? `${Math.round(contractAgeDays * 24)}h` : `${Math.round(contractAgeDays)}d`;
    findings.push({ fact: `deployed ${age} ago by ${shortAddr(creator)}`, source: 'basescan' });
  } else {
    findings.push({ fact: `deployed by ${shortAddr(creator)}`, source: 'basescan' });
  }
  if (priorDeploys != null) {
    findings.push({ fact: `${priorDeploys} contract deploy(s) from this creator`, source: 'basescan' });
  }
  return { signal, findings };
}

async function ageFromCreationTx(txHash: string | null): Promise<number | null> {
  if (!txHash) return null;
  try {
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
    if (tx.blockNumber == null) return null;
    const block = await publicClient.getBlock({ blockNumber: tx.blockNumber });
    const createdMs = Number(block.timestamp) * 1000;
    return Math.max(0, (Date.now() - createdMs) / 86_400_000);
  } catch (err) {
    log.warn({ err: String(err) }, 'failed to resolve creation block timestamp');
    return null;
  }
}

/** Best-effort count of contract creations by the deployer (first page only). */
async function countDeploys(creator: string, apiKey: string): Promise<number | null> {
  try {
    const url = `${BASESCAN_API}?module=account&action=txlist&address=${creator}&startblock=0&endblock=99999999&page=1&offset=1000&sort=asc&apikey=${apiKey}`;
    const res = await fetchJson<TxListResponse>(url, { timeoutMs: 10_000 });
    if (!Array.isArray(res.result)) return null;
    return res.result.filter((t) => (t.to ?? '') === '' && Boolean(t.contractAddress)).length;
  } catch (err) {
    log.warn({ err: String(err) }, 'failed to count creator deploys');
    return null;
  }
}

function empty(): DeployerSignal {
  return { available: false, creator: null, contractAgeDays: null, priorDeploys: null, provider: 'basescan' };
}
