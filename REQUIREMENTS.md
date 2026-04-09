# SMTP Service - Project Requirements & Progress Tracker

This project aims to build a hybrid SMTP service.

1. **Testing Mode (Mailtrap-like):** Acts as an SMTP sinkhole to capture and inspect emails during development.
2. **Production Mode (Mailgun-like):** Acts as a scalable Mail Transfer Agent (MTA) with an HTTP API to deliver emails to the outside world.

## Tech Stack & Architecture

- **Architecture:** Monorepo (pnpm workspaces / Turborepo) with isolated services
- **Backend API:** Node.js (TypeScript, Express/Fastify)
- **SMTP Ingress:** `smtp-server` (Node.js, standalone TCP service)
- **Background Workers:** Node.js (BullMQ consumers for parsing & delivery)
- **Email Parser:** `mailparser` (Node.js)
- **Frontend:** Nuxt.js (Vue 3, Tailwind CSS)
- **Message Queue:** Redis + BullMQ (For async processing, retries, and pub/sub)
- **Database:** PostgreSQL (Stores users, inboxes, and email metadata) + Drizzle ORM or Prisma
- **File Storage:** MinIO (S3-compatible storage for raw `.eml` and attachments)

### Monorepo Structure

```text
├── apps/
│   ├── api/                 # HTTP REST API (Fastify/Express, user auth, endpoints)
│   ├── smtp/                # Ingress SMTP Server (smtp-server, streams to MinIO)
│   ├── workers/             # Background Jobs (BullMQ consumers: parsing & outbound delivery)
│   └── web/                 # Frontend UI (Nuxt 3 dashboard)
├── packages/                # Shared internal libraries
│   ├── db/                  # PostgreSQL schema & ORM setup
│   ├── storage/             # MinIO / S3 wrapper
│   ├── queue/               # BullMQ connection and Job payload types
│   └── env/                 # Environment validation (e.g., with Zod)
```

---

## 🎯 Phase 1: The SMTP Sinkhole (Local Testing)

_The goal of this phase is to successfully receive an email via SMTP, parse it, save it, and view it in a UI._

### Backend (SMTP & Processing)

- [x] Initialize Node.js TypeScript project.
- [x] Setup PostgreSQL connection and basic schema (`inboxes`, `messages`).
- [x] Setup MinIO client for object storage.
- [x] Implement TCP SMTP Listener on port `2525` using `smtp-server`.
- [x] Accept incoming connections and basic `AUTH PLAIN/LOGIN`.
- [x] Stream incoming raw email data (`.eml`) directly to MinIO.
- [x] Publish an event to Redis (BullMQ) after the stream completes.

### Worker (BullMQ)

- [x] Create a BullMQ worker to consume new email events.
- [x] Download the raw `.eml` from MinIO and parse it using `mailparser`.
- [x] Extract headers (To, From, Subject, Date).
- [x] Extract body (HTML and Plain Text).
- [x] Upload parsed attachments back to MinIO.
- [x] Save the parsed metadata and MinIO object references to PostgreSQL.

### Frontend (Nuxt.js UI)

- [x] Initialize Nuxt 3 project.
- [x] Create a basic layout (Sidebar for inboxes, Main panel for emails).
- [x] API endpoint: `GET /api/inboxes` (List all inboxes).
- [x] API endpoint: `GET /api/inboxes/:id/messages` (List emails in an inbox).
- [x] API endpoint: `GET /api/messages/:id` (Fetch email details, HTML preview, text, and attachments).
- [x] Implement Real-time updates (WebSockets/SSE) when a new email arrives.

---

## 🔒 Phase 2: API, Auth, and Multi-Tenancy

_The goal of this phase is to allow multiple users to have isolated inboxes and send emails via an HTTP API._

### Authentication & Management

- [x] Implement user registration and login (JWT or Session).
- [x] Allow users to generate SMTP credentials (Username/Password) for their specific inboxes.
- [x] Update the SMTP listener to validate incoming `AUTH` against the database to route emails to the correct inbox.

### HTTP Send API

- [x] Implement `POST /v1/messages` endpoint (similar to Mailgun).
- [x] Accept JSON payloads (To, From, Subject, HTML, Text).
- [x] Accept `multipart/form-data` for file attachments.
- [x] Construct the MIME message from the API payload and push it to the processing queue.

---

## 🚀 Phase 3: Production Relay (Outbound Delivery)

_The goal of this phase is to actually send emails to the internet, handle bounces, and manage IP reputation._

### Outbound Worker (BullMQ)

- [x] Implement an outbound delivery queue in BullMQ.
- [x] Implement DNS resolution to find the `MX` records of the recipient domain.
- [x] Establish an outbound SMTP connection to the destination MTA.
- [x] Implement TLS (`STARTTLS`) for secure outbound delivery.
- [x] Handle temporary failures (greylisting, rate limits) with exponential backoff retries in BullMQ.
- [x] Handle permanent failures (hard bounces, non-existent addresses) and log them.

### Deliverability & Security

- [x] Implement DKIM (DomainKeys Identified Mail) signing for outgoing messages.
- [x] Document SPF (Sender Policy Framework) setup for users.
- [x] Implement click and open tracking (wrapping links and injecting tracking pixels).
- [x] Implement Webhooks to notify users when an email is `Delivered`, `Bounced`, or `Opened`.

---

## 🧪 Phase 4: Developer Sandbox Mode (SMTP Testing Service)

_The goal of this phase is to create a specialized "trap" service that catches all outgoing SMTP traffic, prevents real-world delivery, and provides a developer-friendly inspection interface._

### 4A: Core SMTP Engine Enhancements

- [x] **Multi-Port SMTP Listener** — Listen on ports `1025` and `2525` simultaneously.
  - **Implementation**: Instantiate two `SMTPServer` instances sharing the same `onAuth`/`onData` handlers but bound to different ports. Both funnel into the same `incoming-email` queue.
  - **Config**: Add `SMTP_PORTS` env var (comma-separated, e.g. `"1025,2525"`), falling back to existing `SMTP_PORT` for backward compatibility. Update Zod schema in `packages/env`.
  - **Docker**: Expose both ports in `docker-compose.yml` and `Dockerfile`.

- [x] **Catch-All Mode** — Accept all incoming mail regardless of recipient or auth credentials.
  - **Implementation**: When `APP_MODE=testing`, make authentication optional (`authOptional: true`) in the SMTP server config. Accept any `RCPT TO` address without validation. If auth is provided, route to that inbox; if not, route to a default "catch-all" inbox for the user.
  - **Key detail**: Skip the inbox credential lookup in testing mode so developers can point any SMTP client at the server without configuring credentials.

- [x] **Auto-Cleanup Worker** — Background scheduled job that purges emails older than 24 hours.
  - **Implementation**: Add a new BullMQ repeatable job (`cleanup-emails`) using cron `0 * * * *` (runs every hour). The processor:
    1. Queries `messages` table for rows where `createdAt < NOW() - INTERVAL '24 hours'`.
    2. Deletes associated MinIO objects (raw `.eml` via `rawKey`, attachments via `attachments[].storageKey`).
    3. Deletes the database rows (cascades to `delivery_logs`).
    4. Logs count of purged messages.
  - **Config**: Add `CLEANUP_MAX_AGE_HOURS` env var (default: `24`) to make the retention window configurable.
  - **Queue**: Add `QUEUE_NAMES.CLEANUP` to `packages/queue`. Use BullMQ's repeatable jobs API: `queue.add('cleanup', {}, { repeat: { pattern: '0 * * * *' } })`.

### 4B: Email Inspection & UI Features

- [x] **Raw MIME Source View** — New tab in the message detail page to display the full raw `.eml` source.
  - **API**: The endpoint `GET /api/messages/:id/raw` already exists and returns the `.eml` file. The frontend will fetch this and render it as preformatted monospace text.
  - **Frontend**: Add a "Raw Source" tab to `[messageId].vue` alongside existing HTML/Text/Attachments/Delivery tabs. Fetch the raw content via `useApi` and display in a `<pre><code>` block with syntax highlighting (optional: use a lightweight highlighter for MIME boundaries).
  - **UX**: Include a "Copy to Clipboard" button and a "Download .eml" button (the download button already exists in the header; ensure it's also accessible from within this tab).

- [x] **Header Analysis View** — Dedicated tab for inspecting all parsed email headers.
  - **API**: New endpoint `GET /api/messages/:id/headers` that:
    1. Fetches the raw `.eml` from MinIO.
    2. Parses it with `mailparser`'s `simpleParser()`.
    3. Returns the full `headers` Map as a structured JSON object: `{ headers: Array<{ key: string, value: string }> }`.
    4. Groups headers into categories for display:
       - **Routing**: `Received`, `Return-Path`, `X-Originating-IP`
       - **Authentication**: `DKIM-Signature`, `Authentication-Results`, `ARC-*`, `Received-SPF`
       - **Identity**: `From`, `To`, `Cc`, `Bcc`, `Reply-To`, `Sender`
       - **Identification**: `Message-ID`, `In-Reply-To`, `References`
       - **Content**: `Content-Type`, `Content-Transfer-Encoding`, `MIME-Version`
       - **Custom/X-Headers**: Any header starting with `X-`
  - **Frontend**: New "Headers" tab in `[messageId].vue`. Render headers in a table grouped by category (collapsible sections). Highlight X-Headers and authentication results with visual indicators. Include:
    - Hop-by-hop trace visualization for `Received` headers (parse timestamps to show relay timing).
    - Color-coded SPF/DKIM/DMARC pass/fail badges if `Authentication-Results` is present.
  - **Key headers to surface prominently**:
    - `Received` (full chain — shows routing path with timestamps)
    - `DKIM-Signature` (selector, domain, algorithm)
    - `Authentication-Results` (SPF/DKIM/DMARC verdicts)
    - `X-Mailer` / `User-Agent` (sending client identification)
    - `X-Spam-Status` / `X-Spam-Score` (if present)
    - `List-Unsubscribe` (compliance check for bulk senders)
    - `Content-Type` + boundary (MIME structure overview)

### 4C: Developer API & Tooling

- [x] **DELETE Messages Endpoint** — `DELETE /api/messages/:id` for integration test cleanup.
  - **Implementation**: Authenticated endpoint that:
    1. Verifies the message belongs to an inbox owned by the requesting user.
    2. Deletes MinIO objects: raw `.eml` (`rawKey`) and all attachment objects (`attachments[].storageKey`).
    3. Deletes the `messages` row (cascades to `delivery_logs`).
    4. Returns `204 No Content`.
  - **Batch variant**: `DELETE /api/inboxes/:id/messages` to purge all messages in an inbox at once. Useful for `beforeEach()` test cleanup.
    1. Fetches all message `rawKey` and `attachments` for the inbox.
    2. Bulk-deletes MinIO objects.
    3. Bulk-deletes database rows.
    4. Returns `{ deleted: <count> }`.

- [x] **Webhook on New Email Capture** — Extend existing webhook system to fire on `"received"` events.
  - **Current state**: Webhooks fire on `delivered`, `bounced`, `opened`. The `webhooks` table has boolean columns for each.
  - **Implementation**:
    1. Add `onReceived` boolean column to `webhooks` table (default: `true`) via a new Drizzle migration.
    2. In the incoming email worker (after parsing and saving), publish a `webhook:fire` Redis event with `event: "received"` and the full message metadata.
    3. The webhook dispatcher already listens for `webhook:fire` — add `"received"` to the event routing map alongside delivered/bounced/opened.
  - **Payload**: `{ event: "received", timestamp, data: { messageId, inboxId, from, to, subject, date, size } }`.

- [x] **Deliverability Score (SpamAssassin-style)** — Basic spam scoring engine for trapped emails.
  - **Design**: A lightweight, self-contained scoring module (no external SpamAssassin dependency). Runs as part of the incoming email worker after parsing.
  - **Implementation** (`packages/spam-score/` or inline in workers):
    1. **Header Checks** (weighted rules):
       | Rule | Score | Description |
       |------|-------|-------------|
       | `MISSING_DATE` | +1.0 | No `Date` header present |
       | `MISSING_MESSAGE_ID` | +0.5 | No `Message-ID` header |
       | `MISSING_FROM` | +2.0 | No `From` header |
       | `MISSING_SUBJECT` | +1.0 | No `Subject` header (or empty) |
       | `FORGED_SENDER` | +2.5 | `From` domain doesn't match SMTP envelope sender |
       | `NO_DKIM` | +1.5 | No `DKIM-Signature` header present |
       | `NO_SPF` | +1.5 | No `Received-SPF` or SPF pass in `Authentication-Results` |
       | `SUSPICIOUS_MAILER` | +1.0 | `X-Mailer` matches known spam tool patterns |
    2. **Body/Content Checks**:
       | Rule | Score | Description |
       |------|-------|-------------|
       | `HTML_ONLY` | +0.5 | HTML body present but no plain-text alternative |
       | `ALL_CAPS_SUBJECT` | +1.5 | Subject is >60% uppercase characters |
       | `SPAM_WORDS` | +0.5–2.0 | Body contains common spam trigger words (configurable list: "free!!!", "act now", "click here", "winner", "urgent", etc.) |
       | `EXCESSIVE_LINKS` | +1.0 | More than 20 `<a>` tags in HTML body |
       | `IMAGE_ONLY` | +2.0 | HTML body is predominantly `<img>` tags with minimal text |
       | `SHORT_BODY` | +0.5 | Body text is fewer than 20 characters |
       | `MISSING_UNSUBSCRIBE` | +1.0 | Bulk-like message with no `List-Unsubscribe` header |
    3. **Scoring Logic**:
       - Each rule has a weight. Sum of triggered rules = final score.
       - Thresholds: `0–2.9` = Clean, `3.0–5.9` = Suspicious, `6.0+` = Likely Spam.
       - Return: `{ score: number, verdict: "clean" | "suspicious" | "spam", rules: Array<{ name, score, description }> }`.
    4. **Storage**: Add `spamScore` (REAL) and `spamRules` (JSONB) columns to the `messages` table. Populated by the incoming worker after parsing.
    5. **API**: New endpoint `GET /api/messages/:id/spam-report` returning the full score breakdown.
    6. **Frontend**: New "Spam Analysis" tab in `[messageId].vue` showing:
       - Overall score with color-coded badge (green/yellow/red).
       - List of triggered rules with individual scores and descriptions.
       - Suggestions for improvement (e.g., "Add a plain-text alternative", "Include DKIM signature").

---

## 🔍 Phase 5: Search, Filters & API Keys

_The goal of this phase is to make the service usable at scale — finding emails quickly, authenticating programmatically, and reliable webhook delivery._

### 5A: Message Search & Filtering

- [x] **Full-Text Search** — Search messages by subject, from, to, or body content.
  - **API**: Update `GET /api/inboxes/:id/messages` to accept query params: `?q=<search>&from=<addr>&to=<addr>&status=<status>&after=<iso>&before=<iso>&page=<n>&limit=<n>`.
  - **Implementation**:
    1. Add a GIN index on `messages.subject` and `messages.from` for fast `ILIKE` queries.
    2. `q` param does `ILIKE '%term%'` across `subject`, `from`, and `to` (JSONB array cast to text).
    3. `from` / `to` params filter by exact or partial match.
    4. `status` filters by message status (e.g., `received`, `delivered`, `bounced`).
    5. `after` / `before` filter by `createdAt` date range (ISO 8601 timestamps).
    6. `page` + `limit` for cursor-based pagination (default: page 1, limit 50).
    7. Return `{ messages: [...], total: <count>, page, limit }` for pagination metadata.
  - **DB Migration**: Add GIN trigram index on `subject` and `from` columns. Requires `pg_trgm` extension.
  - **Frontend**: Add a search bar + filter panel above the message list in `inbox/[inboxId]/index.vue`:
    - Text input with debounced search (300ms).
    - Date range picker (from/to date inputs).
    - Status dropdown filter.
    - Clear all filters button.
    - Pagination controls (prev/next, page counter).

### 5B: API Key Authentication

- [x] **API Keys** — Static API keys for programmatic access (CI/CD, SDKs, scripts).
  - **Schema**: New `api_keys` table:
    ```sql
    id (UUID, PK), userId (FK → users.id, cascade delete),
    name (VARCHAR, human-readable label),
    keyHash (VARCHAR, bcrypt hash of the key),
    prefix (VARCHAR(8), first 8 chars of key for identification),
    scopes (JSONB, e.g. ["send", "read", "delete"]),
    lastUsedAt (TIMESTAMP), expiresAt (TIMESTAMP, nullable),
    createdAt, updatedAt
    ```
  - **Key Format**: `smtps_live_<32 random hex chars>` (shown once on creation, stored hashed).
  - **API Endpoints**:
    - `POST /api/keys` — Create key (name, scopes, optional expiresAt). Returns the raw key **once**.
    - `GET /api/keys` — List keys (id, name, prefix, scopes, lastUsedAt, expiresAt — never expose the full key).
    - `DELETE /api/keys/:id` — Revoke a key.
  - **Auth Middleware**: Extend `authGuard` to accept `Authorization: Bearer smtps_live_*` in addition to JWT. Hash the incoming key, compare against `api_keys.keyHash`. Update `lastUsedAt` on successful auth.
  - **Scopes**: `send` (POST /v1/messages), `read` (GET endpoints), `delete` (DELETE endpoints). Enforce scopes in each route handler.
  - **Frontend**: New "API Keys" section in the dashboard or settings page:
    - List existing keys with name, prefix (`smtps_live_a1b2c3d4...`), scopes, last used, expiry.
    - Create key modal (name, scope checkboxes, optional expiry date).
    - Copy-once display for new key with warning ("This key won't be shown again").
    - Revoke button with confirmation.

### 5C: Webhook Reliability

- [x] **Webhook Retries & Delivery Logs** — Reliable webhook delivery with retry logic and audit trail.
  - **Schema**: New `webhook_logs` table:
    ```sql
    id (UUID, PK), webhookId (FK → webhooks.id, cascade delete),
    event (VARCHAR), payload (JSONB),
    statusCode (INTEGER, nullable), responseBody (TEXT, nullable),
    error (TEXT, nullable),
    attempt (INTEGER, default 1),
    nextRetryAt (TIMESTAMP, nullable),
    status (VARCHAR: pending/success/failed/retrying),
    createdAt
    ```
  - **Retry Logic**: On HTTP failure (non-2xx or timeout), retry up to 5 times with exponential backoff: 10s, 30s, 2min, 10min, 1hr. Use a dedicated BullMQ queue (`WEBHOOK_DELIVERY`) with delayed jobs.
  - **Implementation**:
    1. Replace fire-and-forget in `webhook-dispatcher.ts` with a new `WEBHOOK_DELIVERY` queue.
    2. Each webhook fire creates a `webhook_logs` row (status: `pending`) and enqueues a delivery job.
    3. The delivery worker makes the HTTP POST, updates the log row with status code / response / error.
    4. On failure, schedule a retry (update `attempt`, set `nextRetryAt`, re-enqueue with delay).
    5. After 5 failures, mark as `failed` (no more retries).
  - **API Endpoints**:
    - `GET /api/inboxes/:inboxId/webhooks/:webhookId/logs` — List delivery logs for a webhook (paginated).
  - **Frontend**: Expand the Webhooks tab in inbox view to show delivery logs per webhook:
    - Expandable row per webhook showing recent deliveries.
    - Status badge (success/failed/retrying), HTTP status code, timestamp, attempt count.
    - "Retry now" button for failed deliveries.

---

## 📧 Phase 6: Advanced Email Features

_The goal of this phase is to add power-user capabilities: forwarding, scheduling, templates, batch sending, and suppression lists._

### 6A: Email Forwarding

- [x] **Forward Captured Email** — Forward a test email to a real address for visual inspection.
  - **API**: `POST /api/messages/:id/forward` with body `{ to: "user@gmail.com" }`.
  - **Implementation**:
    1. Fetch the raw `.eml` from MinIO.
    2. Wrap it as an `RFC 822` attachment in a new MIME envelope (or re-send as-is with modified headers).
    3. Set `From` to a service address (e.g., `forwarded@<service-domain>`), `To` to the requested address.
    4. Prepend `[Fwd]` to the subject.
    5. Queue via the outbound delivery pipeline (reuses existing SMTP delivery, DKIM signing, retries).
  - **Frontend**: "Forward" button in the message detail header. Modal with a "To" address input and send button.

### 6B: Scheduled Send

- [x] **Send Later** — Queue an email for delivery at a specific future time.
  - **API**: Extend `POST /v1/messages` to accept optional `sendAt` (ISO 8601 timestamp).
  - **Implementation**:
    1. Validate `sendAt` is in the future (reject past timestamps).
    2. Save message with `status: "scheduled"`.
    3. Enqueue outbound job with BullMQ `delay` option: `queue.add(job, { delay: sendAt - Date.now() })`.
    4. Add new status enum value `scheduled` to messages.
  - **API**: `DELETE /api/messages/:id/schedule` — Cancel a scheduled message (remove from queue, set status to `cancelled`).
  - **Frontend**: Add a "Schedule" button next to "Send" on the compose page. Date/time picker modal. Show scheduled messages with a clock icon in the inbox list.

### 6C: Email Templates

- [x] **Reusable Templates** — Store and reuse HTML email templates with variable substitution.
  - **Schema**: New `templates` table:
    ```sql
    id (UUID, PK), userId (FK → users.id, cascade delete),
    name (VARCHAR), subject (VARCHAR, nullable),
    html (TEXT), text (TEXT, nullable),
    variables (JSONB, array of variable names extracted from content),
    createdAt, updatedAt
    ```
  - **Variable Syntax**: `{{variableName}}` — Mustache-style placeholders in subject, HTML, and text bodies.
  - **API Endpoints**:
    - `POST /api/templates` — Create template (name, subject, html, text). Auto-extract `{{vars}}` into `variables` column.
    - `GET /api/templates` — List user's templates.
    - `GET /api/templates/:id` — Get template with preview.
    - `PUT /api/templates/:id` — Update template.
    - `DELETE /api/templates/:id` — Delete template.
  - **Send Integration**: Extend `POST /v1/messages` to accept `templateId` + `variables: { key: value }` instead of raw html/text. The worker resolves the template, substitutes variables, then proceeds with normal delivery.
  - **Frontend**: New "Templates" page in the sidebar:
    - Template list with name, variable count, last updated.
    - Create/edit template with a split-pane editor (HTML on left, live preview on right).
    - Variable extraction display (auto-detected `{{vars}}`).
    - "Use Template" button that pre-fills the compose page.

### 6D: Batch Send API

- [x] **Bulk Send** — Send to multiple recipients with per-recipient variable substitution.
  - **API**: `POST /v1/messages/batch` with body:
    ```json
    {
      "from": "sender@example.com",
      "subject": "Hello {{name}}",
      "templateId": "...",
      "recipients": [
        { "to": "alice@example.com", "variables": { "name": "Alice" } },
        { "to": "bob@example.com", "variables": { "name": "Bob" } }
      ],
      "inboxId": "..."
    }
    ```
  - **Implementation**:
    1. Validate all recipients (max 1000 per batch).
    2. For each recipient: resolve template (if `templateId`), substitute variables, construct MIME, store raw `.eml` in MinIO, create `messages` row, enqueue outbound job.
    3. Return `{ batchId, messageIds: [...], count }`.
  - **Limits**: Max 1000 recipients per batch. Rate-limited per user.

### 6E: Suppression Lists

- [x] **Bounce Suppression** — Automatically suppress hard-bounced addresses to protect sender reputation.
  - **Schema**: New `suppressions` table:
    ```sql
    id (UUID, PK), userId (FK → users.id, cascade delete),
    email (VARCHAR), reason (VARCHAR: hard_bounce/complaint/manual),
    source (VARCHAR, e.g. messageId that caused it),
    createdAt
    ```
    Unique constraint on `(userId, email)`.
  - **Auto-Suppression**: In the outbound worker, when a permanent bounce (5xx) is received, auto-add the recipient to the user's suppression list.
  - **Send-Time Check**: Before queuing outbound delivery, check if any recipient is on the suppression list. If so, skip delivery and log as `suppressed`.
  - **API Endpoints**:
    - `GET /api/suppressions` — List suppressed addresses (paginated, searchable).
    - `POST /api/suppressions` — Manually add an address.
    - `DELETE /api/suppressions/:id` — Remove from suppression list (re-enable delivery).
  - **Frontend**: New "Suppressions" page (or section in settings):
    - Table of suppressed addresses with reason, source, date.
    - Manual add/remove.
    - Search by email.

### 6F: Custom Headers via Send API

- [x] **Custom X-Headers** — Allow setting custom headers when sending via API.
  - **API**: Extend `POST /v1/messages` to accept `headers: { "X-Custom-Tag": "value", ... }`.
  - **Implementation**: Inject custom headers into the MIME message during construction in the outbound worker. Only allow headers starting with `X-` (security: block overriding standard headers like `From`, `To`, `DKIM-Signature`).
  - **Storage**: Store custom headers in a new `customHeaders` JSONB column on `messages` table.

---

## 🎨 Phase 7: UI Polish & Analytics

_The goal of this phase is to elevate the user experience with analytics, previews, data export, collaboration, and theming._

### 7A: Dashboard Analytics

- [x] **Analytics Dashboard** — Charts and metrics for email activity.
  - **API Endpoints**:
    - `GET /api/analytics/overview` — Summary stats: total sent, delivered, bounced, opened, clicked (all-time + last 7/30 days).
    - `GET /api/analytics/timeseries?metric=<m>&period=<p>` — Time-series data for a metric (sent/delivered/bounced/opened) over a period (7d/30d/90d). Returns `{ labels: ["2026-04-01", ...], values: [12, 8, ...] }`.
    - `GET /api/analytics/top-recipients` — Top 10 recipient domains by volume.
    - `GET /api/analytics/bounce-rate` — Bounce rate over time.
  - **Implementation**: Aggregate queries on `messages` + `delivery_logs` tables grouped by day. Consider materialized views or Redis caching for performance if tables grow large.
  - **Frontend**: New "Analytics" / "Dashboard" page (replace current empty `index.vue`):
    - Summary cards (Total Sent, Delivered %, Bounced %, Open Rate, Click Rate).
    - Line chart: emails sent/delivered per day (use a lightweight chart library like `Chart.js` or `vue-chartjs`).
    - Bar chart: bounce rate over time.
    - Pie chart: top recipient domains.
    - Date range selector (7d / 30d / 90d).

### 7B: Attachment Preview

- [x] **Inline Attachment Preview** — Preview images, PDFs, and text files directly in the Attachments tab.
  - **API**: New endpoint `GET /api/messages/:messageId/attachments/:index` that streams the attachment from MinIO.
  - **Implementation**:
    1. Lookup the message, validate ownership, get `attachments[index].storageKey`.
    2. Stream the object from MinIO with the correct `Content-Type` header.
  - **Frontend**: In the Attachments tab:
    - Images (jpg, png, gif, webp, svg): Render inline with `<img>` tag.
    - PDFs: Embed with `<iframe>` or `<object>` tag.
    - Text files (txt, csv, json, xml, html): Render in a `<pre>` block.
    - Other files: Show download button only.
    - Thumbnail grid view for image attachments.

### 7C: Export & Import

- [x] **Export Messages** — Export inbox messages for external use.
  - **API Endpoints**:
    - `GET /api/inboxes/:id/export?format=mbox` — Export all messages as `.mbox` file (standard Unix mailbox format).
    - `GET /api/inboxes/:id/export?format=csv` — Export message metadata as CSV (from, to, subject, date, status, spam score).
    - `GET /api/inboxes/:id/export?format=eml` — Export as a ZIP of individual `.eml` files.
  - **Implementation**: Stream results (don't load all into memory). Use `archiver` package for ZIP, manual MBOX format construction, `csv-stringify` for CSV.
  - **Frontend**: "Export" dropdown button in the inbox view with format options.

### 7D: Inbox Sharing & Teams

- [x] **Inbox Sharing** — Share an inbox with other users for team collaboration.
  - **Schema**: New `inbox_members` table:
    ```sql
    id (UUID, PK), inboxId (FK → inboxes.id, cascade delete),
    userId (FK → users.id, cascade delete),
    role (VARCHAR: owner/editor/viewer),
    createdAt
    ```
    Unique constraint on `(inboxId, userId)`.
  - **API Endpoints**:
    - `POST /api/inboxes/:id/members` — Invite user by email (body: `{ email, role }`). If user doesn't exist, create a pending invitation.
    - `GET /api/inboxes/:id/members` — List members with roles.
    - `PUT /api/inboxes/:id/members/:memberId` — Update member role.
    - `DELETE /api/inboxes/:id/members/:memberId` — Remove member.
  - **Auth Update**: Modify inbox ownership checks to also check `inbox_members` table. Viewers can read, editors can read + delete messages, owners can manage members + delete inbox.
  - **Frontend**: "Members" tab in inbox settings. Invite modal (email + role dropdown). Member list with role badge and remove button.

### 7E: Dark Mode

- [x] **Dark Theme** — Toggle between light and dark color schemes.
  - **Implementation**: TailwindCSS `darkMode: 'class'` strategy.
    1. Add `dark:` variants to all UI components (backgrounds, text, borders, badges).
    2. Store preference in `localStorage` and apply `dark` class to `<html>`.
    3. Respect `prefers-color-scheme` media query as default.
  - **Frontend**: Theme toggle button (sun/moon icon) in the top navigation bar. Smooth transition on toggle.

### 7F: Per-User Rate Limits & Quotas

- [x] **User Quotas** — Configurable limits per user for send volume and resource usage.
  - **Schema**: New columns on `users` table or a separate `user_quotas` table:
    ```sql
    monthlySendLimit (INTEGER, default 1000),
    maxInboxes (INTEGER, default 10),
    maxMessagesPerInbox (INTEGER, default 5000),
    currentMonthlySent (INTEGER, default 0),
    quotaResetAt (TIMESTAMP)
    ```
  - **Enforcement**: Check quotas before creating inboxes and before queuing outbound messages. Return `429 Too Many Requests` with `Retry-After` header when exceeded.
  - **API**: `GET /api/account/usage` — Return current usage vs limits.
  - **Reset**: A scheduled job resets `currentMonthlySent` on the 1st of each month.
  - **Frontend**: Usage bar in the dashboard showing sent/limit, inbox count/limit.

---

## 🏗️ System Architecture Flow

1. **Ingress (`apps/smtp`):** Client connects to our pure TCP SMTP Server (ports 1025/2525) -> Authenticates via DB (`packages/db`) using inbox credentials or API key, or catch-all in testing mode -> Sends `DATA`.
2. **Storage:** `apps/smtp` pipes the raw stream directly to MinIO (`packages/storage`) -> Publishes a metadata event to Redis/BullMQ (`packages/queue`).
3. **Processing (`apps/workers`):** Incoming Worker picks up job -> Downloads `.eml` -> Parses MIME -> Runs spam scoring -> Saves summary and parts to PostgreSQL (`packages/db`) -> Fires "received" webhook -> Pushes to Outbound Queue (if in production mode).
4. **Cleanup (`apps/workers`):** Repeatable cleanup job runs hourly -> Purges messages older than configurable retention -> Deletes MinIO objects and DB rows.
5. **Egress (`apps/workers`):** Outbound Worker picks up job -> Checks suppression list -> Resolves template + variables (if batch/template send) -> Injects custom headers -> Signs with DKIM -> Resolves MX record -> Delivers via SMTP to destination MTA -> Handles exponential backoff retries -> Logs delivery status -> Fires webhooks.
6. **Webhooks (`apps/workers`):** Webhook Delivery queue fires HTTP POSTs with retries (5 attempts, exponential backoff). Logs every attempt in `webhook_logs`.
7. **Dashboard (`apps/api` & `apps/web`):** Nuxt frontend securely queries the API Server. Supports JWT + API key auth. Search & filter messages, analytics charts, template editor, attachment previews, inbox sharing, export, and dark mode. Real-time events via SSE.
