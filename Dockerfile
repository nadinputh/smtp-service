FROM node:22-alpine AS base
# Fixed, world-readable corepack cache so the non-root runtime user never has
# to download pnpm at start-up
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/env/package.json packages/env/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
COPY packages/storage/package.json packages/storage/
COPY apps/api/package.json apps/api/
COPY apps/smtp/package.json apps/smtp/
COPY apps/workers/package.json apps/workers/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Build all packages
FROM deps AS build
COPY . .
RUN pnpm build

# ─── Migrate (run-once) ───────────────────────────────────
FROM base AS migrate
COPY --from=build /app .
RUN corepack install
USER node
WORKDIR /app/packages/db
CMD ["pnpm", "migrate"]

# ─── API Service ───────────────────────────────────────────
FROM base AS api
COPY --from=build /app .
# Local storage (STORAGE_DRIVER=local) writes under /app/data
RUN mkdir -p /app/data && chown node:node /app/data
USER node
WORKDIR /app/apps/api
EXPOSE 3002
CMD ["node", "--import", "tsx", "src/index.ts"]

# ─── SMTP Server ──────────────────────────────────────────
FROM base AS smtp
COPY --from=build /app .
RUN mkdir -p /app/data && chown node:node /app/data
USER node
WORKDIR /app/apps/smtp
EXPOSE 2525 1025
CMD ["node", "--import", "tsx", "src/index.ts"]

# ─── Workers Service ──────────────────────────────────────
FROM base AS workers

COPY --from=build /app .
RUN mkdir -p /app/data && chown node:node /app/data
USER node
WORKDIR /app/apps/workers
CMD ["node", "--import", "tsx", "src/index.ts"]

# ─── Web Service ──────────────────────────────────────────
FROM base AS web
COPY --from=build /app/apps/web/.output .output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
