<div align="center">

# RECEIPT

### on-chain lie detector for crypto shills

A paid [CAP](https://docs.croo.network) agent on the **CROO Agent Store** that reads a crypto shill, checks every claim against the chain, and returns a verdict you can verify.

[![CROO Agent Protocol](https://img.shields.io/badge/CROO-Agent%20Protocol-00D17A)](https://docs.croo.network)
[![Base · USDC](https://img.shields.io/badge/Base-USDC%20settlement-0052FF)](https://base.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

</div>

> **The pitch:** "LP locked, no dev wallet, fully organic growth" is free to say and expensive to believe. Give RECEIPT a tweet or a contract-address drop, and it pulls the receipts — security, liquidity, holder distribution, deployer history — scores three independent axes, and returns a **verdict** (`BASED` / `BULLSHIT` / `RED_FLAGS` / `MIXED` / `INSUFFICIENT`) anchored on Base. No vibes. Receipts.

---

## Status

| | |
| --- | --- |
| **Live** | CAP provider listed on the CROO Agent Store, settling USDC on Base |
| **Live** | A2A round-trip verified on mainnet — a separate buyer agent hired RECEIPT, paid into escrow, and received a signed receipt |
| **Pending** | Demo video |

## Demo

- **Video:** _[link placeholder]_
- **Live service:** `c35b2f68-ea14-419d-8738-f6ad3917812f` on the CROO Agent Store
- **Try it:** https://agent.croo.network

## Why this is agent-to-agent (A2A)

RECEIPT sits on both sides of the CROO marketplace:

- **As a provider** it sells fact-checks. Another agent (or a human via the CROO Store) negotiates an order, pays **USDC into escrow**, and RECEIPT delivers the receipt. Settlement is automatic — no key custody, no invoices.
- **As a requester** it can compose *other* agents — hiring dedicated sub-agents over CAP for independent evidence, and falling back to its own checks when those services aren't configured.

That makes RECEIPT a **composable counterparty**: agents hire it, and it hires agents — money and verdicts moving over the same protocol.

```
 buyer agent ──negotiate──▶ ┌─────────────────────────────┐
             ──pay USDC────▶ │ RECEIPT · CAP provider      │──┐ A2A requester:
               (escrow)      │ intake → evidence → judge   │  │ hires sub-agents for
 signed receipt ◀─────────── │ (advisory) → gating → stamp │◀─┘ independent evidence
 + on-chain hash             └─────────────────────────────┘
```

**Verified on mainnet.** A separate buyer agent negotiated an order, paid `0.15 USDC` into CAP escrow on Base, and received a signed receipt — the round-trip ran end-to-end, not in mock:

```
negotiate → order_created → payOrder (USDC escrow) → order_completed → verdict
$XOCHI → MIXED (MEDIUM)        settlement tx 0x89e4d136…be0f9 (Base)
```

## What it delivers

Every order returns one canonical JSON deliverable (also rendered to a PNG receipt). It decomposes the verdict into **three independent axes**, so one stamp never has to carry every concern:

```json
{
  "subject": "$XOCHI",
  "subject_address": "0x23c384C5b5a2033aD45a914eD3D489494ab0E021",
  "claim_checks": [
    { "claim": "LP locked",     "status": "FALSE",        "note": "on-chain data contradicts the claim" },
    { "claim": "no dev wallet", "status": "UNVERIFIABLE", "note": "no signal to confirm or deny" }
  ],
  "axes": [
    { "axis": "SAFETY",       "status": "PASS", "detail": "no scam mechanics detected" },
    { "axis": "HONESTY",      "status": "FAIL", "detail": "a claim is contradicted by the chain" },
    { "axis": "DISTRIBUTION", "status": "PASS", "detail": "supply not concentrated" }
  ],
  "verdict": "MIXED",
  "confidence": "MEDIUM",
  "caveats": "Claims LP locked, but on-chain data shows it is not. Token is very new — insufficient history to confirm organic growth.",
  "attestation": { "hash": "0x7d714d8c…d16d48", "chain": "base" }
}
```

At delivery, CAP **anchors a keccak256 hash of the deliverable on-chain** — a tamper-evident content hash, no custom attestation contract required. The receipt is also **reproducible from exactly what was read**: off-chain sources are snapshotted verbatim, since web pages mutate.

## The three axes

| Axis | What it answers | Grounded in |
| --- | --- | --- |
| **SAFETY** | Are there scam mechanics? — the authoritative hard gate | On-chain token-security signals |
| **HONESTY** | Do the spoken claims hold up? | Per-claim checks + source-traceable evidence |
| **DISTRIBUTION** | Is supply dangerously concentrated? | Holder distribution |

Off-chain evidence feeds **HONESTY only** — it can never override SAFETY. Social-media URLs are kept as references but treated as claims, not proof.

## How it works

```
intake            recover the token + the individually-checkable claims from a raw shill drop
  → evidence      gather independent on-chain + off-chain signals, each tagged with its source
  → judge         an LLM narrates the findings — advisory only, never the verdict
  → gating        a deterministic layer turns hard evidence into the final stamp + confidence
  → deliver       render the receipt, deliver over CAP, hash anchored on-chain
```

The verdict is a **deterministic function of evidence** — the LLM extracts claims and writes the explanation, but it does not decide the stamp.

## Design philosophy

- **Verdict from facts, not opinions.** A deterministic gating layer makes the final stamp; the LLM is advisory only. The verdict can't be talked into `BASED`.
- **Three-axes framework.** SAFETY / HONESTY / DISTRIBUTION — separating concerns so one stamp doesn't have to carry every signal.
- **Claim, not person.** RECEIPT flags the *claim* or the *token* — it never labels individuals.
- **Source-traceable evidence.** Every finding cites where it came from. A check that can't be run returns `unavailable` — never assumed, never guessed.

## SDK methods used (CAP)

Documents the `@croo-network/sdk` surface RECEIPT calls. (File references below — internal logic omitted.)

**Provider** — `src/cap/provider.ts`, `src/cap/client.ts`
- `stream.on(...)` — subscribe to order-lifecycle events
- `acceptNegotiation()`
- `uploadFile()`
- `deliverOrder()`

**Requester (A2A)** — `src/a2a-test/requester.ts`, `src/cap/client.ts`
- `negotiateOrder()`
- `payOrder()`
- `getDelivery()`

**Events consumed**
- `order_negotiation_created` → provider validates + accepts
- `order_paid` → provider runs the pipeline and delivers
- `order_created` → requester pays the escrow
- `order_completed` → requester fetches the deliverable

## Integration notes

Things we learned the hard way — useful for the next CAP builder:

- **Input shape.** CROO delivers the buyer's order as `{ "text": "..." }`; we normalize it into our structured claim field before validation, so a pasted CA drop still resolves.
- **Fund before accept.** The provider's ERC-4337 AA wallet needs USDC on hand — CAP uses Pimlico ERC-20 gas sponsorship, so an unfunded wallet fails at `acceptNegotiation`.
- **One WebSocket per SDK key.** A duplicate instance triggers a `duplicate key` policy rejection and the second connection goes silent — watch for this with multiple replicas.
- **Minimum SLA is 300s**, enforced by CAP — keep the pipeline budget comfortably under it.
- **Attestation is built in.** Deliverables are keccak256-hashed and anchored on-chain by CAP at delivery — no custom attestation contract needed.

## Input

Buyers send either a tweet URL or a manual claim + address; CROO's native `{ "text": "…" }` shape is also accepted.

```jsonc
{ "x_url": "https://x.com/..." }                                                   // OR
{ "claim": "fully organic, LP locked", "subject_address": "0x…", "chain": "base" } // OR
{ "text": "Token: XOCHI CA: 0x23c3…E021 Chain: #BASE — LP locked, no dev wallet" }
```

Thin inputs are never rejected — they resolve to an honest `INSUFFICIENT` receipt instead.

## Run it

```bash
pnpm install
cp .env.example .env          # fill in the keys you have

# Local end-to-end, no network/creds — synthesizes a demo order through the whole
# pipe (negotiate → pay → pipeline → render → deliver). PNG lands in ./receipts-out.
CAP_MODE=mock pnpm dev

# A2A: hire the live RECEIPT agent as a buyer and print the verdict.
# Needs a *second* CAP agent (CROO_REQUESTER_SDK_KEY) with USDC on Base.
pnpm run a2a:test
```

| Script | Does |
| --- | --- |
| `pnpm dev` | Watch-mode provider (mock by default) |
| `pnpm start` | Run the provider |
| `pnpm run a2a:test` | Buyer agent hires RECEIPT and prints the verdict |
| `pnpm smoke:receipt` | Render a sample receipt |
| `pnpm typecheck` | `tsc --noEmit` |

Production runbook in [`DEPLOY.md`](./DEPLOY.md).

## Tech stack

| Layer | Choice |
| --- | --- |
| Language / runtime | TypeScript, Node 20, `tsx` |
| Agent protocol | [`@croo-network/sdk`](https://docs.croo.network) (CAP) — negotiate / pay / deliver / settle |
| Chain | Base mainnet via `viem`; USDC settlement through CAP escrow (ERC-4337 AA wallets) |
| Evidence | Independent on-chain + off-chain sources, each finding source-tagged |
| LLM | Production inference via OpenRouter — advisory only (claim extraction + narration) |
| Receipt | JSON deliverable → PNG (`satori` + `@resvg/resvg-js`), keccak256-anchored on-chain by CAP |
| Service | `fastify` (`/health`), `pino` logs, `zod` schemas |

## Built for

The **CROO Agent Protocol** hackathon — an agent that is paid in USDC, settles trustlessly, and proves A2A composability by being hired by another agent on mainnet.

## License

[MIT](./LICENSE) © 2026 RECEIPT
