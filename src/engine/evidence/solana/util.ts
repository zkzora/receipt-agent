/**
 * Solana-specific constants shared by the mint/liquidity/holders/deployer checks.
 * Formatting helpers (fmtUsd, fmtPct, num, shortAddr, WHALE_*) are chain-agnostic
 * and reused directly from '../util.js'.
 */

/** All-zero pubkey — the base58 encoding of 32 zero bytes. Conventionally used
 *  as a burn destination on Solana (also the System Program's own address). */
export const SOLANA_NULL_ADDRESS = '11111111111111111111111111111111';

/**
 * AMM program ids whose pool-vault authorities should be excluded from holder
 * concentration — a vault PDA "owned by" one of these programs is pool
 * infrastructure, not a real holder. Mirrors the Base AMM_INFRA_ADDRESSES
 * exclusion in ../util.ts (Uniswap v4 PoolManager), same rationale.
 */
export const SOLANA_AMM_PROGRAM_IDS = new Set<string>([
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM v4
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', // Raydium CPMM (CP-Swap)
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca Whirlpool
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP', // Orca Token Swap v2
]);

/** Raydium AMM program id families recognised in DexScreener's `dexId`. */
export const RAYDIUM_DEX_IDS = new Set(['raydium', 'raydium-clmm', 'raydium-cpmm']);

/** LP burn share above this is treated as effectively fully burned (dust from
 *  rounding / the tiny permanent-lock deposit some pools require). */
export const LP_BURN_THRESHOLD_PCT = 90;
