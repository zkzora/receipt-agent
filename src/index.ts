import Fastify from 'fastify';
import { config, canRunLiveCap } from './config.js';
import { logger } from './logger.js';
import { createCapClient, attestDeliverable } from './cap/client.js';
import { registerProvider } from './cap/provider.js';
import { runPipeline } from './engine/pipeline.js';
import { receiptModelFromAnalysis } from './receipt/from-analysis.js';
import { renderReceiptPng } from './receipt/render.js';
import { ScanModeSchema, type ScanMode } from './schema/output.js';
import { verifyPayment } from './payment/verify.js';
import { paymentStore } from './payment/store.js';

const log = logger.child({ mod: 'main' });

/** Dev-only: let `?mode=degen|lp|full` override the scan tier for local testing.
 *  In production the tier comes from the order's serviceId (see provider.ts). */
function devScanMode(query: unknown): ScanMode | undefined {
  const parsed = ScanModeSchema.safeParse((query as { mode?: unknown })?.mode);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Service entry point (M1 — "prove the pipe").
 *
 * Wires the CAP client to the provider pipeline and exposes a small HTTP surface
 * for liveness + local inspection. In CAP_MODE=mock the client synthesizes a demo
 * order on boot, so a single `pnpm dev` exercises the entire path end-to-end:
 *   negotiate → accept → pay → runPipeline → render PNG → upload → deliver → attest.
 * The rendered PNG lands in ./receipts-out.
 */
async function main(): Promise<void> {
  // Pre-flight: refuse to silently no-op in a misconfigured live mode.
  if (config.cap.mode === 'live' && !canRunLiveCap()) {
    log.error(
      'CAP_MODE=live but CROO_SDK_KEY is empty. Either set CROO_SDK_KEY (and wire ' +
        'CrooCapClient — see src/cap/client.ts) or run with CAP_MODE=mock.',
    );
    process.exit(1);
  }

  const cap = createCapClient();
  registerProvider(cap);

  // trustProxy so `request.ip` reflects the real client behind Caddy/nginx.
  const app = Fastify({ logger: false, trustProxy: true });

  // ── CORS (browser → agent). Preflight short-circuits here. ────────────────
  app.addHook('onRequest', async (req, reply) => {
    reply.header('access-control-allow-origin', config.web.origin);
    reply.header('vary', 'Origin');
    reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
    reply.header('access-control-allow-headers', 'content-type');
    reply.header('access-control-max-age', '86400');
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  // ── Liveness / readiness ──────────────────────────────────────────────────
  app.get('/health', async () => ({
    ok: true,
    service: 'receipt-agent',
    capMode: config.cap.mode,
    chain: config.chain.name,
    uptimeSec: Math.round(process.uptime()),
  }));

  // ── Public service descriptor (mirrors the CROO listing) ──────────────────
  app.get('/', async () => ({
    name: 'RECEIPT',
    tagline: 'on-chain lie detector for crypto shills',
    capMode: config.cap.mode,
    priceUsdc: config.cap.priceUsdc,
    slaSeconds: config.cap.slaSeconds,
    payment: config.payment.required
      ? {
          priceUsdc: config.payment.priceUsdc,
          receiveWallet: config.payment.receiveWallet,
          usdcMint: config.payment.usdcMint,
        }
      : null,
  }));

  // ── Public scan endpoint (website → agent). ───────────────────────────────
  // Free + per-IP rate-limited for now; 0.1 USDC payment gating is the next step
  // (verify a payment tx before running). Works in mock AND live mode.
  const scanHits = new Map<string, number[]>();
  app.post('/scan', async (request, reply) => {
    const body = (request.body ?? {}) as { input?: unknown; mode?: unknown; paymentTx?: unknown };
    const input = typeof body.input === 'string' ? body.input.trim() : '';
    if (!input) return reply.code(400).send({ error: 'missing_input' });
    const parsedMode = ScanModeSchema.safeParse(body.mode);
    const mode: ScanMode = parsedMode.success ? parsedMode.data : 'full';

    // ── Gate: verified USDC payment when configured, else free + per-IP rate-limit ──
    if (config.payment.required) {
      const sig = typeof body.paymentTx === 'string' ? body.paymentTx.trim() : '';
      if (!sig) {
        return reply.code(402).send({
          error: 'payment_required',
          price_usdc: config.payment.priceUsdc,
          receive_wallet: config.payment.receiveWallet,
          usdc_mint: config.payment.usdcMint,
        });
      }
      if (paymentStore().isUsed(sig)) return reply.code(402).send({ error: 'payment_already_used' });
      const v = await verifyPayment(sig);
      if (!v.ok) return reply.code(402).send({ error: 'payment_invalid', reason: v.reason });
      paymentStore().markUsed(sig, v.payer, config.payment.priceUsdc);
    } else {
      const ip = request.ip;
      const now = Date.now();
      const recent = (scanHits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
      if (recent.length >= config.web.scanRatePerHour) {
        return reply.code(429).send({ error: 'rate_limited', retry_after_sec: 3600 });
      }
      recent.push(now);
      scanHits.set(ip, recent);
    }

    try {
      const analysis = await runPipeline({ text: input }, { cap, mode });
      const attestation = attestDeliverable({ ...analysis } as Record<string, unknown>);
      log.info({ mode, verdict: analysis.verdict }, 'scan delivered');
      return { ...analysis, attestation };
    } catch (err) {
      log.error({ err, mode }, 'scan failed');
      return reply.code(500).send({ error: 'scan_failed' });
    }
  });

  // ── Dev-only: run the pipeline on demand and stream back the receipt PNG ──
  // Lets you exercise the manual / vibe / insufficient paths without waiting for
  // the mock client's synthetic order. Disabled in live mode (orders go via CAP).
  if (config.cap.mode === 'mock') {
    // Render-free: returns the structured verdict JSON (the CAP deliverable minus
    // the image). Use this to test the engine from curl/Postman — it never touches
    // the PNG renderer, so it works even where the native render deps are missing.
    app.post('/dev/analyze.json', async (request) => {
      const requirements = (request.body ?? {}) as Record<string, unknown>;
      const analysis = await runPipeline(requirements, { cap, mode: devScanMode(request.query) });
      const attestation = attestDeliverable({ ...analysis } as Record<string, unknown>);
      return { ...analysis, attestation };
    });

    app.post('/dev/analyze', async (request, reply) => {
      const requirements = (request.body ?? {}) as Record<string, unknown>;
      const analysis = await runPipeline(requirements, { cap, mode: devScanMode(request.query) });
      const attestation = attestDeliverable({ ...analysis } as Record<string, unknown>);
      const model = receiptModelFromAnalysis(analysis, attestation);
      const png = await renderReceiptPng(model);
      return reply
        .header('x-receipt-verdict', analysis.verdict)
        .header('x-receipt-attestation', attestation.hash)
        .type('image/png')
        .send(Buffer.from(png));
    });
  }

  await app.listen({ port: config.runtime.port, host: '0.0.0.0' });
  log.info(
    { port: config.runtime.port, mode: config.cap.mode, chain: config.chain.name },
    'receipt-agent listening',
  );

  await cap.start();

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  let closing = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    log.info({ signal }, 'shutting down');
    try {
      await cap.stop();
      await app.close();
    } catch (err) {
      log.error({ err }, 'error during shutdown');
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.fatal({ err }, 'fatal boot error');
  process.exit(1);
});
