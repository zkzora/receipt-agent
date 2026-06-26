// PM2 process config for the RECEIPT CAP agent.
//
// This is an ALTERNATIVE to Docker (docker-compose.yml). The app loads `.env`
// itself via dotenv (src/config.ts), so just keep `.env` in this directory and
// PM2 will pick it up. CAP_MODE=live is forced here to match the Docker setup;
// dotenv does not override vars already set in process.env, so this wins.
//
// Usage on the VPS:
//   corepack enable && pnpm install --frozen-lockfile --filter receipt-agent...
//   pm2 start ecosystem.config.js
//   pm2 logs receipt-agent
//   pm2 save && pm2 startup   # survive reboots
module.exports = {
  apps: [
    {
      name: 'receipt-agent',
      script: 'pnpm',
      args: 'start',          // -> tsx src/index.ts
      interpreter: 'none',    // run pnpm directly (not through node)
      cwd: __dirname,         // so dotenv finds ./.env
      env: {
        NODE_ENV: 'production',
        CAP_MODE: 'live',     // force live, mirrors docker-compose.yml
        PORT: '8787',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      // pino logs are JSON on stdout; PM2 captures them in ~/.pm2/logs
    },
  ],
};
