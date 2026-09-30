# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers and small engineering teams building and running email-sending features. Two situations, both real and both in scope:

- **Testing mode:** a developer points their app at the local SMTP sinkhole (ports 2525/1025) during development and uses the web dashboard (inbox, search, filters, spam score, attachment preview) to inspect what their app actually sent, without any mail leaving the machine.
- **Production mode:** the same team switches an app or domain to the production relay to deliver real mail, which requires adding and verifying a sending domain (DKIM + SPF) first.

Teams collaborate via shared inboxes and role-based access (owner/member roles per team, plus a system-level admin role that can see across all users).

## Product Purpose

MailPocket is a self-hosted, dual-mode email service: an email sinkhole (Mailtrap-like) for catching and inspecting outbound mail during development, and a production SMTP relay (Mailgun-like) for actually delivering it, in one pnpm-monorepo product. Success is a team going from "send a test email in dev" to "send a verified, DKIM-signed email in production" without adopting a second vendor.

## Positioning

Most teams stitch together a dev-only sinkhole tool and a separate paid production ESP. MailPocket's mechanism is that both live behind the same API, dashboard, and data model — a domain, template, or API key configured once behaves the same whether traffic is hitting the sinkhole or the relay. Self-hosted (Docker Compose: Postgres, Redis, MinIO), so email content and DKIM private keys never leave infrastructure the team controls.

## Operating Context

- SMTP ingress on 2525 (testing) and 1025 (production-facing) feeds MinIO (raw `.eml`) → BullMQ worker (parse, spam score, save) → Postgres + webhooks; production sends additionally queue for DKIM signing, MX lookup, and delivery.
- Web dashboard (Nuxt 3, this app) is the primary surface: inbox, compose/send, templates, API keys, suppressions, sending domains, teams, and an admin area (users, teams, inboxes, analytics).
- REST API (`smtps_live_*` scoped keys) is the primary integration path for sending, searching, filtering, batching, and scheduling — the dashboard is for humans inspecting and configuring, not the main send path.
- A sending domain must exist and be DKIM/SPF-verified before production mode will relay mail for it; testing-mode traffic does not require a verified domain.

## Capabilities and Constraints

- Domains: users add a domain, the API auto-generates an RSA DKIM keypair (2048-bit) and returns the DKIM TXT record (`<selector>._domainkey.<domain>`) plus an SPF TXT record to publish; verification does a live DNS TXT lookup and only flips `verified` on an exact DKIM public-key match. Domains are per-user; admins can see all users' domains. No re-key/rotate or multi-selector support exists yet — one DKIM keypair and selector (`smtp1`) per domain.
- DNS propagation is a real, undecided-duration wait between "records published" and "verification succeeds" — this is a known constraint on the verification step, not a bug to hide.
- Dark mode is a confirmed, app-wide, already-shipped constraint (not a per-surface decision).
- Accessibility: recent work already did an app-wide accessibility/UX audit pass; treat WCAG AA-level expectations (contrast, focus states, semantic roles) as a standing constraint, not optional.
- Undecided: DKIM key rotation, multiple DKIM selectors per domain, and custom-selector input are not yet product decisions — do not design UI affordances that imply they exist today.

## Brand Commitments

- Name: MailPocket. No logo/wordmark asset located in this pass.
- Established visual language (from shipped pages: inbox, send, templates, settings, auth): Tailwind, light/dark themes, gray neutral scale with an indigo accent, rounded-lg cards and inputs, `UBtn`/`Modal` shared components, table-based list views with a right-aligned actions column, centered icon+text empty states. Treat this as binding incumbent identity to extend, not a starting point to redesign.

## Evidence on Hand

None gathered for this pass (no testimonials, case studies, or press). Do not fabricate any.

## Product Principles

1. One product, two modes — testing and production share the same configuration surface (domains, templates, keys), so setting something up once should carry over rather than requiring duplicate work per mode.
2. Self-hosted trust — private key material (DKIM) and message content stay on infrastructure the team controls; never suggest designs that would expose a private key to the client.
3. Inspectable by default — the dashboard's job is to make what the system is doing (delivery status, verification state, spam score) visible and legible, not just to collect input.
4. Verification is a process, not an instant toggle — DNS-dependent steps must communicate wait states and retry honestly rather than implying an immediate pass/fail.

## Accessibility & Inclusion

WCAG AA-level expectations (contrast, keyboard operability, semantic roles/labels, visible focus states) — confirmed standing constraint given the recent app-wide accessibility audit; no additional user-specific needs identified in this pass.
