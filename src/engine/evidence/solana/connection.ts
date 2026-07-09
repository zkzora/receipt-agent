import { Connection } from '@solana/web3.js';
import { config } from '../../../config.js';

/** Shared connection for every Solana evidence check — same pattern as the
 *  single viem `publicClient` in evidence/deployer.ts for Base. */
export const solanaConnection = new Connection(config.solana.rpcUrl, 'confirmed');
