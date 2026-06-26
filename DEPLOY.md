# RECEIPT — Go-Live Runbook

How to take RECEIPT public: the **agent** (backend) runs on a VPS as a paid CROO
CAP provider that settles in USDC, and the **website** is a static marketing
showcase on Cloudflare Pages that funnels buyers to the CROO listing.

```
PAID (USDC)  CROO Store / OpenClaw / other agents ──order_paid──▶ ┌────────────────────────┐
                                                                  │ RECEIPT agent (VPS)    │ CAP_MODE=live
                                                                  │ @croo-network/sdk      │ deliver → CROO
FUNNEL       Website (Cloudflare Pages, static) ──CTA buttons────▶│  auto-settles USDC     │
              "Verify on CROO →"                                  └────────────────────────┘
```

> **Where USDC actually changes hands:** the website never charges. A buyer pays
> USDC into CROO's escrow (CAPVault) when they pay an order; once the agent
> delivers and delivery is confirmed on-chain, CAPVault auto-distributes
> (platform fee → treasury, remainder → your provider AA wallet). The agent must
> be **online in live mode** to receive `order_paid` and deliver within the SLA.

---

## 0. Prerequisites

- A **CROO account** + agent registered at https://agent.croo.network (you already
  have an SDK key: `croo_sk_…`). Keep it secret — it is shown only once.
- **OpenRouter** API key (LLM) — `OPENAI_API_KEY`.
- Recommended data keys: **GoPlus** (`GOPLUS_APP_KEY/SECRET`), **Basescan**
  (`BASESCAN_API_KEY`). Optional: **Serper/Brave** (`SEARCH_API_KEY`).
- A **VPS** (1–2 vCPU, 1–2 GB RAM is plenty) with Docker, e.g. Hetzner / DigitalOcean / Fly.
- A **Cloudflare account** + a domain (for the website + custom domain).

---

## 1. CROO dashboard — finish the service (Step 1 on your Configure Agent screen)

In the CROO dashboard, complete the agent profile and **add one service**:

| Field          | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Service name   | e.g. `RECEIPT — on-chain shill fact-check`                            |
| Price (USDC)   | e.g. `0.50` — must equal `SERVICE_PRICE_USDC` in `.env`               |
| SLA            | e.g. `300s` — must be `>=` `SERVICE_SLA_SECONDS` and `> PIPELINE_BUDGET_MS` |
| Deliverable    | **Text** (we deliver the canonical receipt JSON as text)              |
| Requirements   | JSON: `{ "x_url"?, "claim"?, "subject_address"?, "chain"? }`          |
| Description    | What it does + that output is the 3-axis receipt + attestation hash   |

You do **not** start the provider from the dashboard — our own service is the
provider (Step 3 below replaces `npx ts-node examples/provider.ts`).

---

## 2. Backend on the VPS (Docker)

```bash
# on the VPS
git clone <your repo> receipt && cd receipt
cp .env.example .env
nano .env            # fill the [LIVE] values, see below
```

Minimum `.env` for live (see `.env.example` for the full list):

```ini
CAP_MODE=live
CROO_SDK_KEY=croo_sk_********
CROO_API_URL=https://api.croo.network
CROO_WS_URL=wss://api.croo.network/ws
OPENAI_API_KEY=sk-or-********
LLM_MODEL=anthropic/claude-haiku-4.5
GOPLUS_APP_KEY=...
GOPLUS_APP_SECRET=...
BASESCAN_API_KEY=...
SERVICE_PRICE_USDC=0.5          # == dashboard price
SERVICE_SLA_SECONDS=300         # <= dashboard SLA
PIPELINE_BUDGET_MS=240000       # < SLA, so we always deliver in time
# optional paid web search (DexScreener discovery works without it):
# SEARCH_PROVIDER=serper
# SEARCH_API_KEY=...
```

Build + run:

```bash
docker compose up -d --build
docker compose logs -f          # watch it connect
```

Expected log lines:

```
receipt-agent listening            (port 8787, mode live)
CAP live (CROO) connected — listening for negotiations + paid orders
```

The agent should now flip to **Online** in the CROO dashboard. Health check:
`curl http://localhost:8787/health` → `{"ok":true,"capMode":"live",...}`.

> The container restarts on crash (`restart: unless-stopped`) and has a Docker
> healthcheck on `/health`. `/health` is the only public HTTP surface in live
> mode — there is **no** analyze endpoint exposed (orders arrive over the CROO
> WebSocket), so nothing to rate-limit or abuse.

### Notes

- **Secrets**: `.env` is git-ignored and excluded from the image (`.dockerignore`)
  — it is injected at runtime via `env_file`. Never bake it into the image.
- **Time budget**: keep `PIPELINE_BUDGET_MS` < your SLA. A check is typically
  5–10s (on-chain + off-chain + LLM); 300s SLA is very safe.
- **Updating**: `git pull && docker compose up -d --build`.

---

## 3. Website on Cloudflare Pages (static showcase)

The site is a pure static Vite build — **no API, no inputs** (anti-abuse by
design). All CTAs link to your CROO listing.

**Option A — Cloudflare dashboard (Git integration):**

| Setting             | Value                          |
| ------------------- | ------------------------------ |
| Framework preset    | Vite                           |
| Root directory      | `web`                          |
| Build command       | `npm install -g pnpm && pnpm install && pnpm build` |
| Build output dir    | `web/dist`                     |
| Env var             | `VITE_CROO_URL` = your CROO listing URL |

> Pages runs the build from the repo root; set **Root directory = `web`** so it
> builds the website workspace. If your Pages build can't run the monorepo
> install, use Option B (prebuilt upload) instead.

**Option B — Wrangler (prebuilt upload, simplest for a pnpm monorepo):**

```bash
# locally / in CI
VITE_CROO_URL="https://<your-croo-listing-url>" pnpm web:build
npx wrangler pages deploy web/dist --project-name receipt
```

Then add your custom domain in **Cloudflare Pages → Custom domains**.

`VITE_CROO_URL` sets every CTA button + nav/footer link. If unset it defaults to
`https://agent.croo.network` — point it at your published service listing.

---

## 4. End-to-end verification (real USDC)

1. Open your CROO listing (or use OpenClaw/Hermes to chat your agent).
2. Place a paid order with a real payload, e.g.
   `{ "subject_address": "0x980e…fba3", "claim": "fully audited, LP locked, renounced" }`.
3. Pay the USDC. Watch the agent logs:
   ```
   order_paid → running pipeline
   delivered order (CROO) — USDC settles to provider AA wallet on confirmation
   ```
4. The buyer gets the receipt (text JSON + uploaded PNG object key + attestation
   hash). Settlement lands in your provider AA wallet after delivery confirmation.

If a delivery fails, the agent logs the error and does **not** crash; the order
times out per CROO's SLA and is not settled.

---

## 5. Operations

- **Logs**: `docker compose logs -f receipt-agent` (JSON pino lines).
- **Restart**: `docker compose restart receipt-agent`.
- **Pretty logs** locally: set `DEV_PRETTY_LOGS=1`.
- **Rollback**: `git checkout <prev>` then rebuild.
- Keep the VPS clock synced (NTP) — SLA deadlines are time-sensitive.

## 6. Security

- Only `/health` is exposed; bind the VPS firewall so 8787 is internal or behind
  a reverse proxy if you want TLS on it (not required — CROO talks to you over an
  outbound WebSocket, so no inbound port is strictly needed beyond your own ops).
- Rotate `CROO_SDK_KEY` from the dashboard if leaked.
- The website is static and calls nothing — no CORS, no keys shipped to the browser.
