<div align="center">

# RECEIPT

### on-chain lie detector for crypto shills

A paid [CAP](https://docs.croo.network) agent on the **CROO Agent Store** that reads a shill, checks every claim against the chain, and stamps a verdict you can verify.

[![CROO Agent Protocol](https://img.shields.io/badge/CROO-Agent%20Protocol-00D17A)](https://docs.croo.network)
[![Agent-to-Agent](https://img.shields.io/badge/Agent--to--Agent-A2A-7C5CFF)](#why-this-is-agent-to-agent-a2a)
[![Base · USDC](https://img.shields.io/badge/Base-USDC%20settlement-0052FF)](https://base.org)
[![Receipt](https://img.shields.io/badge/output-signed%20receipt-FFB020)](#what-it-delivers)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

</div>

> **The pitch:** "LP locked, no dev wallet, fully organic growth" is free to say and expensive to believe. Give RECEIPT a tweet or a contract-address drop, and it pulls the receipts — GoPlus security, DexScreener liquidity, holder spread, deployer history — scores three independent axes, and returns a **signed verdict** (`BASED` / `BULLSHIT` / `RED_FLAGS` / `MIXED` / `INSUFFICIENT`) with a keccak256 attestation anchored on Base. No vibes. Receipts.

---

## Why this is agent-to-agent (A2A)

RECEIPT lives on both sides of the CROO marketplace:

- **As a provider** it sells fact-checks. Another agent (or a human via the CROO Store) negotiates an order, pays **USDC into escrow**, and RECEIPT delivers the receipt + attestation. Settlement is automatic — no key custody, no invoices.
- **As a requester** it composes *other* agents. The pipeline can hire a dedicated **security** sub-agent (ChainGuard), **liquidity**, and **deployer** services over CAP, falling back to its own local checks when those service IDs aren't configured.

That makes RECEIPT a **composable counterparty**: agents hire it, and it hires agents — money and verdicts moving over the same protocol.

```
  buyer agent ───negotiate(serviceId)──▶ ┌────────────────────────────┐
  (any CAP                               │          RECEIPT           │
   requester)  ───pay 0.15 USDC ────────▶│   CAP provider on CROO     │
                  into CAPVault escrow    │                            │
                                          │  classify → evidence →     │──▶ A2A: hires sub-agents
                                          │  off-chain → judge →       │     ChainGuard / liquidity /
   receipt JSON + PNG  ◀──────────────────│  gating → deliver          │     deployer  (CAP requester)
   + attestation hash                     └────────────────────────────┘
   (anchored on Base, USDC settles to provider)
```

**Proven on mainnet.** A separate buyer agent hired RECEIPT live, paid `0.15 USDC` on Base, and got a verdict back — full trace in [`a2a-proof.log`](./a2a-proof.log):

```
negotiate → order_created → payOrder (0.15 USDC escrow) → order_completed → verdict
$XOCHI → MIXED (MEDIUM)   attestation 0x7d714d8c…d16d48   tx 0x89e4d136…be0f9
```

## What it delivers

Every order returns one canonical JSON deliverable (rendered to a PNG receipt and hashed). It decomposes the verdict into **three independent axes**, so one stamp never has to carry every concern:

```json
{
  "mode": "claim_check",
  "subject": "$XOCHI",
  "subject_address": "0x23c384C5b5a2033aD45a914eD3D489494ab0E021",
  "claim_checks": [
    { "claim": "LP locked", "status": "FALSE", "note": "LP is not locked" },
    { "claim": "no dev wallet", "status": "UNVERIFIABLE", "note": "no on-chain signal" }
  ],
  "axes": [
    { "axis": "SAFETY",       "status": "PASS", "detail": "no scam mechanics (100/100)" },
    { "axis": "HONESTY",      "status": "FAIL", "detail": "1/3 claim(s) contradicted" },
    { "axis": "DISTRIBUTION", "status": "PASS", "detail": "top-5 4.0%" }
  ],
  "verdict": "MIXED",
  "confidence": "MEDIUM",
  "caveats": "Claims LP locked but it is not. New token (0.7d) — insufficient time to assess organic growth.",
  "attestation": {
    "hash": "0x7d714d8c3caf103e9f9f13659568ac38dbf976d9a94176d33d1626d3d9d16d48",
    "chain": "base"
  }
}
```

The `attestation.hash` is a keccak256 over the canonical receipt — recompute it from the JSON and it matches the on-chain content hash CAP anchors at delivery. The receipt is **reproducible from exactly what was read** (off-chain sources are snapshotted verbatim, since web pages mutate).

## The three axes

| Axis | What it answers | Source |
| --- | --- | --- |
| **SAFETY** | Are there scam mechanics? (honeypot, mint, blacklist, unverified) — the authoritative hard gate | GoPlus Token Security (on-chain) |
| **HONESTY** | Do the spoken claims hold up? | Per-claim checks + off-chain evidence (the project's own pages) |
| **DISTRIBUTION** | Is supply concentrated? | Holder spread, top-5 concentration (GoPlus) |

Off-chain evidence feeds **HONESTY only** — it can never override SAFETY. X/Twitter URLs are kept as references but **never fetched**.

## How it works

```
parse / validate          recover ticker + contract address from a raw shill drop
   → classify (LLM)        extract the individually-checkable claims
   → gather evidence       SAFETY (GoPlus) · liquidity (DexScreener) · holders · deployer (Basescan) — in parallel
   → off-chain             read the project's own site/repo to verify claims the chain can't
   → judge (LLM, advisory) narrate the findings, never overrule the gate
   → gating (deterministic) stamp verdict + confidence from hard evidence
   → render → upload → deliver → attest
```

The LLM is used **only** for claim extraction and narration — the verdict itself is a deterministic function of on-chain evidence, so it can't be talked into a `BASED`.

## Tech stack

| Layer | Choice |
| --- | --- |
| Language / runtime | TypeScript, Node 20, `tsx` |
| Agent protocol | [`@croo-network/sdk`](https://docs.croo.network) (CAP) — negotiate / pay / deliver / settle |
| Chain | Base mainnet via `viem`; USDC settlement through CAPVault escrow |
| Evidence | GoPlus (security + holders), DexScreener (liquidity/TVL/FDV), Basescan + RPC (deployer) |
| Off-chain | Serper / Brave search + page fetch (keyless DexScreener discovery by default) |
| LLM | OpenAI-compatible endpoint (OpenRouter) — classify + judge only |
| Receipt render | `satori` + `@resvg/resvg-js` (JSON → PNG) |
| Service | `fastify` (`/health` only in live mode), `pino` logs, `zod` schemas |
| Website | Vite + React, static on Cloudflare Pages |

## Run it

```bash
pnpm install
cp .env.example .env          # fill in the keys you have (see below)

# 1) Local end-to-end, no network/creds — synthesizes a demo order through the
#    whole pipe (negotiate → pay → pipeline → render → deliver → attest).
#    The rendered PNG lands in ./receipts-out.
CAP_MODE=mock pnpm dev

# 2) Render-only smoke test of the receipt template
pnpm smoke:receipt

# 3) A2A: hire the live RECEIPT agent as a buyer and print the verdict.
#    Needs CROO_REQUESTER_SDK_KEY (a *second* agent) funded with USDC on Base.
pnpm run a2a:test
```

Minimum keys for a live provider (`CAP_MODE=live`): `CROO_SDK_KEY`, plus `OPENAI_API_KEY` (narration), `GOPLUS_APP_KEY/SECRET` and `BASESCAN_API_KEY` (evidence). The engine degrades gracefully when optional keys are absent. Full production runbook in [`DEPLOY.md`](./DEPLOY.md).

| Script | Does |
| --- | --- |
| `pnpm dev` | Watch-mode provider (mock by default) |
| `pnpm start` | Run the provider |
| `pnpm run a2a:test` | Buyer agent hires RECEIPT and prints the verdict |
| `pnpm smoke:receipt` | Render a sample receipt PNG |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm web:dev` / `web:build` | The static showcase site |

## Input

Buyers send either a tweet URL or a manual claim + address. CROO's native `{ "text": "…" }` shape is also accepted — RECEIPT recovers the contract address straight out of a pasted CA drop.

```jsonc
{ "x_url": "https://x.com/...", }                                  // OR
{ "claim": "fully organic, LP locked", "subject_address": "0x…", "chain": "base" }  // OR
{ "text": "Token: XOCHI CA: 0x23c3…E021 Chain: #BASE — LP locked, no dev wallet" }
```

Thin inputs are never rejected — they resolve to an honest `INSUFFICIENT` receipt instead.

## Built for

The **CROO Agent Protocol** hackathon — an agent that is paid in USDC, settles trustlessly, and proves A2A composability by being hired by another agent on mainnet. Live service ID: `c35b2f68-ea14-419d-8738-f6ad3917812f`.

## License

[MIT](./LICENSE) © 2026 RECEIPT
