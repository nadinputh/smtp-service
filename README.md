# MailPocket

A friendly, local email service that works as an **email sinkhole** (Mailtrap-like) for development testing and as a **production relay** (Mailgun-like) for outbound delivery. Built with a pnpm monorepo architecture.

## Features

- **Dual Mode** — `testing` (catch-all sinkhole) / `production` (real SMTP relay with DKIM signing)
- **Multi-Port SMTP** — Listens on ports 2525 and 1025 simultaneously
- **REST API** — Send, search, filter, template, batch send, schedule emails
- **Web Dashboard** — Nuxt 3 UI with analytics charts, dark mode, inbox management
- **Spam Scoring** — Built-in heuristic spam analysis (SpamAssassin-style)
- **Webhooks** — Fire on `received`, `delivered`, `bounced`, `opened` events with retry logic
- **Open/Click Tracking** — Pixel injection and link wrapping
- **Templates** — Reusable HTML templates with `{{variable}}` substitution
- **Attachments** — S3/MinIO storage with inline preview (images, PDFs, text)
- **Export** — MBOX, CSV, or EML (ZIP) export per inbox
- **Teams** — Multi-user collaboration with inbox sharing and role-based access
- **API Keys** — Scoped `smtps_live_*` keys for programmatic access
- **RBAC** — Admin/user roles with system-level OAuth2 OIDC and LDAP support

## Architecture

```
apps/
  api/        → Fastify REST API (port 3002)
  smtp/       → SMTP ingress server (ports 2525, 1025)
  workers/    → BullMQ consumers (parsing, outbound delivery, webhooks, tracking, cleanup)
  web/        → Nuxt 3 frontend (port 3000)
packages/
  db/         → Drizzle ORM + PostgreSQL schema & migrations
  env/        → Zod-validated environment config
  queue/      → BullMQ connection & job types
  storage/    → MinIO/S3 wrapper
```

**Flow:** SMTP ingress → MinIO (raw .eml) → BullMQ → Worker (parse, spam score, save) → PostgreSQL + webhooks → Outbound queue (production mode) → DKIM sign → MX lookup → deliver

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** (corepack enabled)
- **Docker & Docker Compose** (for PostgreSQL, Redis, MinIO)

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url> && cd mailpocket
corepack enable
pnpm install
```

### 2. Start infrastructure

```bash
docker compose up -d postgres redis minio
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your settings (see Environment Variables below)
```

### 4. Run database migrations

```bash
pnpm db:migrate
```

### 5. Seed admin user (optional)

```bash
# Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first
pnpm --filter @mailpocket/db seed
```

### 6. Start all services

```bash
pnpm dev
```

This starts the API (3002), SMTP (2525/1025), Workers, and Web UI (3000) in parallel.

### 7. Send a test email

```bash
swaks --to recipient@example.com \
      --from sender@example.com \
      --server localhost:2525 \
      --auth-user testuser \
      --auth-password testpass \
      --header "Subject: Test Email" \
      --body "Hello from swaks!"
```

Open http://localhost:3000 to view captured emails.

## Docker Deployment

Build and run all services:

```bash
docker compose up -d --build
```

Services:
| Service | Port(s) | Description |
|------------|-------------|--------------------------|
| web | 3000 | Nuxt 3 dashboard |
| api | 3002 | Fastify REST API |
| smtp | 2525, 1025 | SMTP ingress server |
| workers | — | Background job processors |
| postgres | 5432 | PostgreSQL 16 |
| redis | 6379 | Redis 7 |
| minio | 9080, 9001 | MinIO (S3-compatible) |

## Environment Variables

| Variable                | Required | Default                 | Description                                  |
| ----------------------- | -------- | ----------------------- | -------------------------------------------- |
| `DATABASE_URL`          | Yes      | —                       | PostgreSQL connection string                 |
| `JWT_SECRET`            | Yes      | —                       | Secret for JWT signing (min 16 chars)        |
| `MINIO_ACCESS_KEY`      | Yes      | —                       | MinIO access key                             |
| `MINIO_SECRET_KEY`      | Yes      | —                       | MinIO secret key                             |
| `REDIS_HOST`            | No       | `localhost`             | Redis hostname                               |
| `REDIS_PORT`            | No       | `6379`                  | Redis port                                   |
| `REDIS_PASSWORD`        | No       | —                       | Redis password                               |
| `MINIO_ENDPOINT`        | No       | `localhost`             | MinIO hostname                               |
| `MINIO_PORT`            | No       | `9000`                  | MinIO port                                   |
| `MINIO_BUCKET`          | No       | `emails`                | MinIO bucket name                            |
| `MINIO_USE_SSL`         | No       | `false`                 | Use SSL for MinIO                            |
| `SMTP_PORT`             | No       | `2525`                  | Primary SMTP port                            |
| `SMTP_HOST`             | No       | `0.0.0.0`               | SMTP bind address                            |
| `SMTP_PORTS`            | No       | —                       | Additional SMTP ports (comma-separated)      |
| `API_PORT`              | No       | `3001`                  | API server port                              |
| `API_HOST`              | No       | `0.0.0.0`               | API bind address                             |
| `APP_MODE`              | No       | `testing`               | `testing` (sinkhole) or `production` (relay) |
| `TRACKING_BASE_URL`     | No       | `http://localhost:3002` | Base URL for open/click tracking             |
| `CLEANUP_MAX_AGE_HOURS` | No       | `24`                    | Auto-cleanup retention (hours)               |
| `OAUTH2_ENABLED`        | No       | `false`                 | Enable OAuth2 OIDC login                     |
| `OAUTH2_ISSUER_URL`     | No       | —                       | OIDC issuer URL                              |
| `OAUTH2_CLIENT_ID`      | No       | —                       | OIDC client ID                               |
| `OAUTH2_REDIRECT_URI`   | No       | —                       | OIDC redirect URI                            |
| `OAUTH2_SCOPES`         | No       | `openid profile email`  | OIDC scopes                                  |
| `LDAP_ENABLED`          | No       | `false`                 | Enable LDAP authentication                   |
| `LDAP_URL`              | No       | —                       | LDAP server URL                              |
| `LDAP_BIND_DN`          | No       | —                       | LDAP bind DN                                 |
| `LDAP_BIND_PASSWORD`    | No       | —                       | LDAP bind password                           |
| `LDAP_SEARCH_BASE`      | No       | —                       | LDAP search base                             |
| `LDAP_SEARCH_FILTER`    | No       | `(uid={{username}})`    | LDAP search filter                           |
| `ADMIN_EMAIL`           | No       | `admin@localhost`       | Admin user email (for seed script)           |
| `ADMIN_PASSWORD`        | No       | —                       | Admin user password (for seed script)        |

## API Reference

### Authentication

All API routes require authentication via JWT (`Authorization: Bearer <token>`) or API key (`Authorization: Bearer smtps_live_*` / `X-API-Key: smtps_live_*`).

#### Auth

| Method | Endpoint                     | Description            |
| ------ | ---------------------------- | ---------------------- |
| POST   | `/api/auth/register`         | Register a new user    |
| POST   | `/api/auth/login`            | Login (returns JWT)    |
| POST   | `/api/auth/ldap`             | LDAP login             |
| GET    | `/api/auth/oauth2/authorize` | Start OAuth2 PKCE flow |
| POST   | `/api/auth/oauth2/callback`  | Complete OAuth2 flow   |
| GET    | `/api/auth/me`               | Get current user       |

#### Inboxes

| Method | Endpoint                    | Description         |
| ------ | --------------------------- | ------------------- |
| POST   | `/api/inboxes`              | Create inbox        |
| GET    | `/api/inboxes`              | List user's inboxes |
| GET    | `/api/inboxes/:id`          | Get inbox details   |
| PUT    | `/api/inboxes/:id`          | Update inbox        |
| DELETE | `/api/inboxes/:id`          | Delete inbox        |
| DELETE | `/api/inboxes/:id/messages` | Purge all messages  |

#### Messages

| Method | Endpoint                               | Description                              |
| ------ | -------------------------------------- | ---------------------------------------- |
| GET    | `/api/inboxes/:id/messages`            | List messages (search, filter, paginate) |
| GET    | `/api/messages/:id`                    | Get message detail                       |
| GET    | `/api/messages/:id/raw`                | Download raw .eml                        |
| GET    | `/api/messages/:id/headers`            | Parsed headers                           |
| GET    | `/api/messages/:id/spam-report`        | Spam analysis                            |
| GET    | `/api/messages/:id/attachments/:index` | Stream attachment                        |
| POST   | `/api/messages/:id/forward`            | Forward email                            |
| DELETE | `/api/messages/:id`                    | Delete message                           |
| DELETE | `/api/messages/:id/schedule`           | Cancel scheduled send                    |

#### Send API

| Method | Endpoint             | Description                       |
| ------ | -------------------- | --------------------------------- |
| POST   | `/v1/messages`       | Send email (JSON or multipart)    |
| POST   | `/v1/messages/batch` | Batch send to multiple recipients |

Supports `templateId` + `variables`, `sendAt` for scheduling, and custom `X-*` headers.

#### Templates

| Method | Endpoint             | Description     |
| ------ | -------------------- | --------------- |
| POST   | `/api/templates`     | Create template |
| GET    | `/api/templates`     | List templates  |
| GET    | `/api/templates/:id` | Get template    |
| PUT    | `/api/templates/:id` | Update template |
| DELETE | `/api/templates/:id` | Delete template |

#### Domains

| Method | Endpoint                  | Description                      |
| ------ | ------------------------- | -------------------------------- |
| POST   | `/api/domains`            | Add domain (generates DKIM keys) |
| GET    | `/api/domains`            | List domains                     |
| GET    | `/api/domains/:id`        | Get domain + DNS records         |
| POST   | `/api/domains/:id/verify` | Verify DNS records               |
| DELETE | `/api/domains/:id`        | Delete domain                    |

#### Webhooks

| Method | Endpoint                              | Description    |
| ------ | ------------------------------------- | -------------- |
| POST   | `/api/inboxes/:id/webhooks`           | Create webhook |
| GET    | `/api/inboxes/:id/webhooks`           | List webhooks  |
| PUT    | `/api/inboxes/:id/webhooks/:wid`      | Update webhook |
| DELETE | `/api/inboxes/:id/webhooks/:wid`      | Delete webhook |
| GET    | `/api/inboxes/:id/webhooks/:wid/logs` | Delivery logs  |

#### API Keys

| Method | Endpoint        | Description                       |
| ------ | --------------- | --------------------------------- |
| POST   | `/api/keys`     | Create key (returns raw key once) |
| GET    | `/api/keys`     | List keys                         |
| DELETE | `/api/keys/:id` | Revoke key                        |

#### Suppressions

| Method | Endpoint                | Description                  |
| ------ | ----------------------- | ---------------------------- |
| POST   | `/api/suppressions`     | Add suppressed email         |
| GET    | `/api/suppressions`     | List (paginated, searchable) |
| DELETE | `/api/suppressions/:id` | Remove suppression           |

#### Teams

| Method | Endpoint                 | Description     |
| ------ | ------------------------ | --------------- |
| POST   | `/api/teams`             | Create team     |
| GET    | `/api/teams`             | List teams      |
| GET    | `/api/teams/:id`         | Get team detail |
| PUT    | `/api/teams/:id`         | Update team     |
| DELETE | `/api/teams/:id`         | Delete team     |
| GET    | `/api/teams/:id/members` | List members    |

#### Inbox Members

| Method | Endpoint                        | Description     |
| ------ | ------------------------------- | --------------- |
| POST   | `/api/inboxes/:id/members`      | Invite by email |
| GET    | `/api/inboxes/:id/members`      | List members    |
| PUT    | `/api/inboxes/:id/members/:mid` | Update role     |
| DELETE | `/api/inboxes/:id/members/:mid` | Remove member   |

#### Analytics

| Method | Endpoint                        | Description           |
| ------ | ------------------------------- | --------------------- |
| GET    | `/api/analytics/overview`       | Summary stats         |
| GET    | `/api/analytics/timeseries`     | Time-series data      |
| GET    | `/api/analytics/bounce-rate`    | Bounce rate over time |
| GET    | `/api/analytics/top-recipients` | Top recipient domains |

#### Export

| Method | Endpoint                              | Description                 |
| ------ | ------------------------------------- | --------------------------- |
| GET    | `/api/inboxes/:id/export?format=mbox` | Export as MBOX              |
| GET    | `/api/inboxes/:id/export?format=csv`  | Export as CSV               |
| GET    | `/api/inboxes/:id/export?format=eml`  | Export as ZIP of .eml files |

#### Admin

| Method | Endpoint           | Description                |
| ------ | ------------------ | -------------------------- |
| GET    | `/admin/users`     | List all users             |
| PUT    | `/admin/users/:id` | Update user role           |
| DELETE | `/admin/users/:id` | Delete user                |
| GET    | `/admin/queues/*`  | Bull Board queue dashboard |

#### Other

| Method | Endpoint                     | Description                            |
| ------ | ---------------------------- | -------------------------------------- |
| GET    | `/health`                    | Health check                           |
| GET    | `/api/sse/inbox/:id`         | SSE stream for real-time inbox updates |
| GET    | `/api/account/quotas`        | User quotas and usage                  |
| GET    | `/tracking/open/:messageId`  | Open tracking pixel                    |
| GET    | `/tracking/click/:messageId` | Click tracking redirect                |

## Scripts

| Command                             | Description                    |
| ----------------------------------- | ------------------------------ |
| `pnpm dev`                          | Start all services in dev mode |
| `pnpm dev:api`                      | Start API only                 |
| `pnpm dev:smtp`                     | Start SMTP only                |
| `pnpm dev:workers`                  | Start workers only             |
| `pnpm dev:web`                      | Start web UI only              |
| `pnpm build`                        | Build all packages             |
| `pnpm test`                         | Run all tests                  |
| `pnpm test:watch`                   | Run tests in watch mode        |
| `pnpm db:generate`                  | Generate Drizzle migrations    |
| `pnpm db:migrate`                   | Run database migrations        |
| `pnpm db:studio`                    | Open Drizzle Studio            |
| `pnpm --filter @mailpocket/db seed` | Seed admin user                |

## Testing

```bash
# Run all tests
pnpm test

# Run in watch mode
pnpm test:watch

# Run specific test file
npx vitest run apps/api/tests/api.integration.test.ts
npx vitest run apps/workers/tests/spam-scorer.test.ts
npx vitest run apps/workers/tests/tracking.test.ts
```

Integration tests require running infrastructure (PostgreSQL, Redis, MinIO). Start them with `docker compose up -d postgres redis minio` before running tests.

## License

Private
