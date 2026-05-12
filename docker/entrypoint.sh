#!/bin/sh
set -e

# ── Run database migrations ───────────────────────────────
echo "⏳ Running database migrations..."
cd /app/packages/db
pnpm drizzle-kit migrate && echo "✅ Migrations applied" || { echo "❌ Migrations failed"; exit 1; }

# ── Seed admin user (optional) ────────────────────────────
if [ -n "${ADMIN_PASSWORD:-}" ]; then
  node --import tsx src/seed.ts && echo "✅ Seed completed" || echo "⚠️  Seed failed"
fi

# ── Start all services via supervisord ────────────────────
echo "🚀 Starting all services..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
