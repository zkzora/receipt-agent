# RECEIPT agent — CAP provider (CROO live). Runs the TS service with tsx so the
# image matches `pnpm start` exactly (no separate build step / JS emit needed).
#
# Debian slim (glibc) is required: @resvg/resvg-js ships a prebuilt
# linux-x64-gnu binary used by the PNG renderer — Alpine/musl would need a
# different artifact.
FROM node:20-bookworm-slim

WORKDIR /app
RUN corepack enable

# Install ONLY the backend (root) workspace deps. Copying web/package.json keeps
# the workspace resolvable without pulling in the website's dev toolchain.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
RUN corepack pnpm install --frozen-lockfile --filter receipt-agent...

# App source (node_modules + .env are excluded via .dockerignore — secrets are
# injected at runtime with --env-file, never baked into the image).
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Liveness probe hits the Fastify /health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
