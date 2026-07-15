# RECEIPT — Deploy Guide (agent → VPS → website → payment)

End-to-end setup: run the **agent** on a VPS, expose it over HTTPS, deploy the
**website** (`web/`) to Cloudflare Pages so people can scan a token directly, and
(planned) charge **0.1 USDC per scan**.

```
Browser (website on Cloudflare Pages, HTTPS)
        │  POST /scan { input, mode }
        ▼
https://api.yourdomain.com     ← Caddy (auto-HTTPS reverse proxy)
        │
        ▼
localhost:8787                 ← the agent (Node/tsx, kept alive by pm2)
        │
        ▼
pipeline → JSON verdict (+ PNG receipt)
```

Two things ship: **the agent** (this repo, on a VPS) and **the website** (`web/`
in this repo, on Cloudflare Pages). The glue is a domain + HTTPS so the browser
can reach the agent.

---

## Part 1 — Run the agent on the VPS

**Prereqs (Ubuntu):** Node 20+ and git.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

git clone https://github.com/zkzora/receipt-agent.git
cd receipt-agent
corepack pnpm install
```

> `bigint-buffer` may warn on native build and fall back to a JS version — fine.

**Configure `.env`:**

```bash
cp .env.example .env
nano .env
```

Minimum for a good website scan:

| Var | What | Where |
|---|---|---|
| `OPENAI_API_KEY` | LLM for classify/judge + narrative | OpenRouter key (`OPENAI_API_BASE` is already OpenRouter) |
| `SOLANA_RPC_URL` | Solana reads (holders, dev-sold, bundle) | **Alchemy** — public RPC gets rate-limited |
| `WEB_ORIGIN` | CORS allow-list | your web domain (or `*` while testing) |
| `CAP_MODE` | `mock` is fine for the website | leave `mock` unless wiring live CROO |
| `BASESCAN_API_KEY`, `GOPLUS_APP_KEY/SECRET` | Base-chain evidence | optional (Base tokens only) |

The verdict runs even without the LLM key (deterministic, no narrative), but set
`OPENAI_API_KEY` + a paid `SOLANA_RPC_URL` for the full experience.

**Run with pm2:**

```bash
sudo npm install -g pm2
pm2 start "corepack pnpm start" --name receipt-agent
pm2 save
pm2 startup     # run the printed command to enable boot-start
```

> One instance only (fork mode) — the agent is stateful.

**Verify on the VPS:**

```bash
curl localhost:8787/health
curl -X POST localhost:8787/scan -H "content-type: application/json" \
  -d '{"input":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263","mode":"lp"}'
```

---

## Part 2 — Expose over HTTPS (domain + Caddy)

The website is HTTPS, so it **cannot** call `http://your-ip:8787` (mixed content).
Put Caddy in front — it gets Let's Encrypt certs automatically.

**1. DNS:** `A` record `api.yourdomain.com` → your VPS IP.

**2. Install Caddy:**

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

**3.** `/etc/caddy/Caddyfile`:

```
api.yourdomain.com {
    reverse_proxy localhost:8787
}
```

**4.**

```bash
sudo systemctl reload caddy
sudo ufw allow 80,443/tcp        # if using ufw
curl https://api.yourdomain.com/health   # HTTPS works now
```

---

## Part 3 — Lock down CORS

`WEB_ORIGIN=*` is fine for testing. For production set it to your exact web origin:

```bash
# .env on the VPS
WEB_ORIGIN=https://receipt-agent.pages.dev
```

```bash
pm2 restart receipt-agent
```

---

## Part 4 — Deploy the website to Cloudflare Pages

The website lives in `web/` **in this repo**, so Pages can build straight from git.

**Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git →
pick `zkzora/receipt-agent`.** Then set:

| Setting | Value |
|---|---|
| Production branch | `master` |
| Root directory (Advanced) | `web` |
| Framework preset | Vite |
| Build command | `npm install && npm run build` |
| Build output directory | `dist` |

**Environment variables** (Pages → Settings → Environment variables):

| Var | Value |
|---|---|
| `VITE_API_URL` | `https://api.yourdomain.com` (your agent) |
| `VITE_CROO_URL` | your CROO listing URL (optional) |

`VITE_API_URL` is what points the Scan button at your VPS agent. Without it the
site falls back to `http://localhost:8787` (local dev only).

**Deploy → open the site → `#scan` → paste a Solana mint → Scan.** You should get a
live verdict from the VPS (not the demo). Every `git push` auto-redeploys.

> **OG image:** in `web/index.html`, once you have the final domain, change
> `og:image` / `twitter:image` from `/receipt-logo.png` to
> `https://yourdomain.com/receipt-logo.png` so link previews render on X/Discord.

### Local build check (optional, before deploying)

```bash
npm run build --prefix web   # tsc + vite build → web/dist
npm run preview --prefix web # serve the production build locally
```

---

## Part 5 — Payment: 0.1 USDC per scan  *(planned — not wired yet)*

`/scan` is currently **free + rate-limited** (`SCAN_RATE_PER_HOUR`, default 30/IP).
The paid flow:

```
1. User connects Phantom on the website.
2. On Scan: website sends 0.1 USDC (SPL) to your receiving wallet → gets a tx signature.
3. Website calls POST /scan { input, mode, paymentTx }.
4. Agent verifies the tx on-chain (amount, wallet, not already used) → runs the pipeline.
   One payment = one scan (anti-replay store).
```

**To enable, we build:**
- Frontend: Phantom wallet-adapter + the 0.1 USDC transfer, then send `paymentTx`.
- Backend: `/scan` verifies the payment before running + an anti-replay store
  (`node:sqlite`) of used tx signatures.
- New config: `RECEIVE_WALLET` (your Solana address) + `PRICE_USDC=0.1`.

Pay in **USDC on Solana** (audience has Phantom, no bridge). No Privy needed for
launch — plain wallet-adapter is enough.

> **Next step:** give a dedicated **Solana receiving wallet address**, and this
> section gets implemented.

---

## Updating (after any push)

```bash
cd receipt-agent
git pull
corepack pnpm install     # only if deps changed
pm2 restart receipt-agent
```

The website redeploys automatically on push (Pages ↔ git).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser **CORS error** | Set `WEB_ORIGIN` to your web origin (or `*`), `pm2 restart`. |
| Browser **mixed content / blocked** | Agent must be HTTPS — finish Part 2 (Caddy). |
| Scan says **"can't reach the agent"** | Check `VITE_API_URL` + `curl https://api.yourdomain.com/health`. |
| Solana findings **"unavailable"** | Public RPC rate-limited — set a paid `SOLANA_RPC_URL` (Alchemy). |
| **429 rate_limited** | Free-tier cap; raise `SCAN_RATE_PER_HOUR` or add payment. |
| `EADDRINUSE :8787` | A stray instance is running — `pm2 list`, kill it. |
| No **narrative** in results | Needs `OPENAI_API_KEY` + the token must have fetchable public pages. |
| Pages **build fails** | Confirm Root dir = `web`, build = `npm install && npm run build`, output = `dist`. |

---

## Quick reference

| Thing | Value |
|---|---|
| Agent port | `8787` |
| Health | `GET /health` |
| Scan | `POST /scan { "input": "<CA or claim>", "mode": "full\|degen\|lp" }` |
| Web dev | `npm run dev --prefix web` (→ `:5173`) |
| Agent dev | `corepack pnpm dev` (watch) / `corepack pnpm start` |
