FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
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

# ─── API Service ───────────────────────────────────────────
FROM base AS api
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app .
WORKDIR /app/apps/api
EXPOSE 3002
CMD ["node", "--import", "tsx", "src/index.ts"]

# ─── SMTP Service ─────────────────────────────────────────
FROM base AS smtp
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app .
WORKDIR /app/apps/smtp
EXPOSE 2525 1025
CMD ["node", "--import", "tsx", "src/index.ts"]

# ─── Workers Service ──────────────────────────────────────
FROM base AS workers
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app .
WORKDIR /app/apps/workers
CMD ["node", "--import", "tsx", "src/index.ts"]

# ─── Web Service ──────────────────────────────────────────
FROM base AS web
COPY --from=build /app/apps/web/.output .output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
