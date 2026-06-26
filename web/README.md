# receipt-web

The RECEIPT marketing site **and** live verify console — a Vite + React app that
talks to the `receipt-agent` CAP service.

## Run it

The site calls the agent. Start the agent first, then the web dev server:

```bash
# terminal 1 — the agent (Fastify on :8787, CAP_MODE=mock exposes /dev/*)
pnpm start

# terminal 2 — the website (Vite on :5173)
pnpm web:dev
```

Open http://localhost:5173 and paste a shill — a tweet link, a claim, and/or a
`0x…` Base contract address. The console runs the real pipeline (LLM classify →
on-chain evidence → deterministic verdict) and prints the receipt with its
BASED / BULLSHIT / MIXED stamp. "Download PNG" renders the shareable image.

## How it talks to the agent

Vite proxies same-origin requests to the agent (see `vite.config.ts`):

| Browser           | → Agent                |
| ----------------- | ---------------------- |
| `/api/analyze.json` | `/dev/analyze.json` (verdict JSON) |
| `/api/analyze`      | `/dev/analyze` (receipt PNG)       |
| `/health`           | `/health`                          |

Point at an agent running elsewhere with `VITE_API_TARGET=http://host:port`.
The `/dev/*` routes only exist in `CAP_MODE=mock`; for a live deployment the
site would call the agent through CAP instead.

## Build

```bash
pnpm web:build   # tsc -b && vite build → web/dist (static, deploy anywhere)
```
