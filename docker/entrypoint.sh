#!/bin/bash
set -e

DATA_DIR="/data"
PG_DATA="$DATA_DIR/postgresql"
REDIS_DATA="$DATA_DIR/redis"
STORAGE_DATA="$DATA_DIR/storage"

# ── Ensure data directories exist ─────────────────────────
mkdir -p "$PG_DATA" "$REDIS_DATA" "$STORAGE_DATA"
chown postgres:postgres "$PG_DATA"
chown redis:redis "$REDIS_DATA"

# ── Configure Redis ───────────────────────────────────────
cat > /etc/redis/redis.conf <<EOF
bind 127.0.0.1
port 6379
dir ${REDIS_DATA}
appendonly yes
requirepass ${REDIS_PASSWORD:-""}
EOF
chown redis:redis /etc/redis/redis.conf

# ── Initialize PostgreSQL if needed ───────────────────────
if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  echo "⏳ Initializing PostgreSQL data directory..."
  su - postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PG_DATA"

  # Allow local connections with password auth
  cat > "$PG_DATA/pg_hba.conf" <<PGEOF
local   all   all                 trust
host    all   all   127.0.0.1/32  md5
host    all   all   ::1/128       md5
PGEOF

  # Listen on localhost only
  echo "listen_addresses = '127.0.0.1'" >> "$PG_DATA/postgresql.conf"

  # Start PostgreSQL temporarily to create user and database
  su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA -w start"

  su - postgres -c "psql -c \"CREATE USER ${PG_USER:-smtp} WITH PASSWORD '${PG_PASSWORD:-smtp_password}';\""
  su - postgres -c "psql -c \"CREATE DATABASE ${PG_DB:-smtp_service} OWNER ${PG_USER:-smtp};\""

  su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA -w stop"
  echo "✅ PostgreSQL initialized"
fi

# ── Run database migrations ───────────────────────────────
echo "⏳ Running database migrations..."

# Start PostgreSQL temporarily for migrations
su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA -w start"

cd /app
export DATABASE_URL="postgresql://${PG_USER:-smtp}:${PG_PASSWORD:-smtp_password}@127.0.0.1:5432/${PG_DB:-smtp_service}"
export REDIS_HOST="127.0.0.1"
export REDIS_PORT="6379"
export REDIS_PASSWORD="${REDIS_PASSWORD:-}"

# Run drizzle migrations
cd /app/packages/db
pnpm drizzle-kit migrate && echo "✅ Migrations applied" || echo "⚠️  Migrations failed"

# Run seed (creates admin user if ADMIN_PASSWORD is set)
if [ -n "${ADMIN_PASSWORD:-}" ]; then
  cd /app/packages/db
  node --import tsx src/seed.ts && echo "✅ Seed completed" || echo "⚠️  Seed failed"
fi

cd /app

su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA -w stop"

# ── Export env for child processes ────────────────────────
export DATABASE_URL="postgresql://${PG_USER:-smtp}:${PG_PASSWORD:-smtp_password}@127.0.0.1:5432/${PG_DB:-smtp_service}"
export REDIS_HOST="127.0.0.1"
export REDIS_PORT="6379"
export REDIS_PASSWORD="${REDIS_PASSWORD:-}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-local}"
export STORAGE_LOCAL_PATH="${STORAGE_LOCAL_PATH:-/data/storage}"

# ── Start all services via supervisord ────────────────────
echo "🚀 Starting all services..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
