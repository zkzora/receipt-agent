import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

/**
 * Centralised, validated configuration. Nothing else in the codebase reads
 * `process.env` directly — import from here so a missing/invalid var fails fast
 * at boot with a readable message instead of `undefined` deep in the pipeline.
 */
const BoolFromEnv = z
  .string()
  .optional()
  .transform((v) => v === '1' || v?.toLowerCase() === 'true');

const EnvSchema = z.object({
  // Core LLM — OpenAI-compatible endpoint (OpenRouter by default). The classify +
  // judge steps POST to `${OPENAI_API_BASE}/chat/completions`. ANTHROPIC_API_KEY
  // is kept for back-compat but unused while routing through OpenRouter.
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  OPENAI_API_BASE: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().default('claude-haiku-4-5-20251001'),

  // CAP / CROO
  CAP_MODE: z.enum(['mock', 'live']).default('mock'),
  CROO_SDK_KEY: z.string().optional().default(''),
  /** CROO backend endpoints — the @croo-network/sdk AgentClient targets these. */
  CROO_API_URL: z.string().url().default('https://api.croo.network'),
  CROO_WS_URL: z.string().default('wss://api.croo.network/ws'),
  /** Per-tier serviceIds. An order's serviceId selects the scan mode; anything
   *  not matching these two runs the flagship `full` verify. Blank = disabled. */
  CROO_SERVICE_ID_DEGEN: z.string().optional().default(''),
  CROO_SERVICE_ID_LP: z.string().optional().default(''),
  AGENT_WALLET_ADDRESS: z.string().optional().default(''),
  AGENT_WALLET_PRIVATE_KEY: z.string().optional().default(''),
  SERVICE_PRICE_USDC: z.coerce.number().positive().default(0.5),
  SERVICE_SLA_SECONDS: z.coerce.number().int().min(300).default(300),

  // Chain / providers
  BASE_RPC_URL: z.string().url().default('https://mainnet.base.org'),
  BASESCAN_API_KEY: z.string().optional().default(''),
  GOPLUS_APP_KEY: z.string().optional().default(''),
  GOPLUS_APP_SECRET: z.string().optional().default(''),

  // Solana — public RPC by default; swap in a paid endpoint (Helius/Triton/QuickNode)
  // if rate limits bite, same as BASE_RPC_URL.
  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),

  // A2A sub-agents
  SUBAGENT_SECURITY_SERVICE_ID: z.string().optional().default(''),
  SUBAGENT_LIQUIDITY_SERVICE_ID: z.string().optional().default(''),
  SUBAGENT_DEPLOYER_SERVICE_ID: z.string().optional().default(''),

  // Off-chain evidence stream (feeds the HONESTY axis ONLY — never SAFETY). On by
  // default; reads public sites/repos the shill linked + (optionally) web search.
  // X/Twitter URLs are NEVER fetched — kept only as a source_url reference.
  OFFCHAIN_ENABLED: z
    .string()
    .optional()
    .default('1')
    .transform((v) => v !== '0' && v.toLowerCase() !== 'false'),
  // Web search is pluggable + optional. With no key the engine still reads URLs the
  // claim itself linked; a key unlocks discovery of sites the claim didn't mention.
  SEARCH_PROVIDER: z.enum(['none', 'brave', 'serper']).default('none'),
  SEARCH_API_KEY: z.string().optional().default(''),

  // Public scan endpoint (website → agent). CORS origin: set to your web domain
  // in production (e.g. https://receipt.pages.dev); '*' is fine for local dev.
  WEB_ORIGIN: z.string().default('*'),
  SCAN_RATE_PER_HOUR: z.coerce.number().int().positive().default(30),

  // Payment — pay-per-scan in USDC (SPL) on Solana. When RECEIVE_WALLET is set,
  // /scan requires a verified 0.1 USDC payment; blank = free (rate-limited).
  RECEIVE_WALLET: z.string().optional().default(''),
  PRICE_USDC: z.coerce.number().positive().default(0.1),
  PAYMENT_USDC_MINT: z.string().default('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  PAYMENT_DB_PATH: z.string().default('./data/payments.db'),

  // Runtime
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PIPELINE_BUDGET_MS: z.coerce.number().int().positive().default(240_000),
  DEV_PRETTY_LOGS: BoolFromEnv,
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');

  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;

/** Base mainnet. Token Security / DexScreener / Basescan all key off this id. */
export const BASE_CHAIN_ID = 8453;

export const config = {
  llm: {
    /** OpenAI-compatible base URL (e.g. OpenRouter's https://openrouter.ai/api/v1). */
    baseUrl: env.OPENAI_API_BASE,
    apiKey: env.OPENAI_API_KEY,
    model: env.LLM_MODEL,
    /** classify + judge are the only LLM calls; keep them cheap + deterministic. */
    temperature: 0,
    maxRetries: 1,
  },
  cap: {
    mode: env.CAP_MODE,
    sdkKey: env.CROO_SDK_KEY,
    apiUrl: env.CROO_API_URL,
    wsUrl: env.CROO_WS_URL,
    degenServiceId: env.CROO_SERVICE_ID_DEGEN,
    lpServiceId: env.CROO_SERVICE_ID_LP,
    walletAddress: env.AGENT_WALLET_ADDRESS,
    walletPrivateKey: env.AGENT_WALLET_PRIVATE_KEY,
    priceUsdc: env.SERVICE_PRICE_USDC,
    slaSeconds: env.SERVICE_SLA_SECONDS,
  },
  chain: {
    id: BASE_CHAIN_ID,
    name: 'base' as const,
    rpcUrl: env.BASE_RPC_URL,
    basescanApiKey: env.BASESCAN_API_KEY,
    goPlusKey: env.GOPLUS_APP_KEY,
    goPlusSecret: env.GOPLUS_APP_SECRET,
  },
  solana: {
    rpcUrl: env.SOLANA_RPC_URL,
  },
  subAgents: {
    security: env.SUBAGENT_SECURITY_SERVICE_ID,
    liquidity: env.SUBAGENT_LIQUIDITY_SERVICE_ID,
    deployer: env.SUBAGENT_DEPLOYER_SERVICE_ID,
  },
  offchain: {
    enabled: env.OFFCHAIN_ENABLED,
    searchProvider: env.SEARCH_PROVIDER,
    searchApiKey: env.SEARCH_API_KEY,
    /** Hard caps so a hostile page can't hang or balloon the pipeline. */
    maxSources: 5,
    fetchTimeoutMs: 8_000,
    maxBytes: 512 * 1024,
    maxChars: 4_000,
  },
  web: {
    origin: env.WEB_ORIGIN,
    scanRatePerHour: env.SCAN_RATE_PER_HOUR,
  },
  payment: {
    /** Blank disables payment (scan stays free + rate-limited). */
    receiveWallet: env.RECEIVE_WALLET,
    priceUsdc: env.PRICE_USDC,
    usdcMint: env.PAYMENT_USDC_MINT,
    dbPath: env.PAYMENT_DB_PATH,
    required: env.RECEIVE_WALLET.trim().length > 0,
  },
  runtime: {
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    prettyLogs: env.DEV_PRETTY_LOGS,
    pipelineBudgetMs: env.PIPELINE_BUDGET_MS,
  },
} as const;

export type AppConfig = typeof config;

/** True when CAP is configured well enough to attempt a live connection. */
export function canRunLiveCap(): boolean {
  return config.cap.mode === 'live' && config.cap.sdkKey.length > 0;
}
