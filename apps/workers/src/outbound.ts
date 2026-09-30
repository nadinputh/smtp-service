import { type Job } from "bullmq";
import { createTransport } from "nodemailer";
import { promises as dns } from "node:dns";
import { simpleParser } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import {
  getDb,
  deliveryLogs,
  messages,
  domains,
  suppressions,
  inboxes,
} from "@mailpocket/db";
import type { StorageClient } from "@mailpocket/storage";
import { type OutboundEmailPayload } from "@mailpocket/queue";
import { eq, and, inArray } from "drizzle-orm";
import type { Env } from "@mailpocket/env";
import type Redis from "ioredis";
import { injectTracking } from "./tracking.js";

// ─── MX Resolution ────────────────────────────────────────
async function resolveMx(domain: string): Promise<string> {
  try {
    const records = await dns.resolveMx(domain);
    records.sort((a, b) => a.priority - b.priority);
    return records[0]?.exchange ?? domain;
  } catch {
    // Fallback to A record if no MX
    return domain;
  }
}

// ─── Classify SMTP errors ─────────────────────────────────
export function classifySmtpError(code: number): "temporary" | "permanent" {
  // 4xx = temporary, 5xx = permanent
  if (code >= 400 && code < 500) return "temporary";
  return "permanent";
}

// Codes nodemailer's smtp-connection assigns to `err.code` when no SMTP
// dialogue ever happened (connect/greeting/socket timeout, connection
// refused) — see its own internal `transientCodes` in _onError. These are
// not the receiving server rejecting the message, so they must not be
// classified as a permanent 5xx bounce.
const CONNECTION_LEVEL_ERROR_CODES = [
  "ETIMEDOUT",
  "ESOCKET",
  "ECONNECTION",
  "EDNS",
];

export function extractSmtpCode(err: any): number {
  if (err.responseCode) return err.responseCode;
  if (CONNECTION_LEVEL_ERROR_CODES.includes(err.code)) return 421;
  const match = err.message?.match(/(\d{3})/);
  // No SMTP response and no connection-level code we recognize: still no
  // evidence the recipient's server rejected anything, so default to the
  // standard temporary "service not available, try again later" code
  // rather than assuming a permanent bounce.
  return match ? parseInt(match[1], 10) : 421;
}

// ─── Sender / owner resolution ────────────────────────────
/** Lowercased domain of `user@host` or `Name <user@host>`, or null. */
export function extractSenderDomain(from: string): string | null {
  const addr = /<([^<>]+)>\s*$/.exec(from)?.[1] ?? from;
  const at = addr.lastIndexOf("@");
  if (at === -1) return null;
  return (
    addr
      .slice(at + 1)
      .trim()
      .toLowerCase() || null
  );
}

// Only a "the mailbox doesn't exist" style rejection is grounds for
// permanently suppressing an address; other 5xx replies (policy blocks,
// full mailboxes, sender reputation) say nothing about the recipient.
const RECIPIENT_REJECTION_RE =
  /\b5\.1\.\d{1,3}\b|user unknown|no such user|unknown user|does not exist|mailbox (?:not found|unavailable)|invalid recipient|recipient (?:address )?rejected/i;

export function isRecipientRejection(err: any): boolean {
  return RECIPIENT_REJECTION_RE.test(
    `${err?.response ?? ""} ${err?.message ?? ""}`,
  );
}

/** Account whose suppression list and domains apply to this message. */
async function resolveOwnerId(
  db: ReturnType<typeof getDb>,
  messageId: string,
  userId?: string,
): Promise<string | null> {
  if (userId) return userId;
  const [row] = await db
    .select({ userId: inboxes.userId })
    .from(messages)
    .innerJoin(inboxes, eq(inboxes.id, messages.inboxId))
    .where(eq(messages.id, messageId))
    .limit(1);
  return row?.userId ?? null;
}

// ─── DKIM Lookup ──────────────────────────────────────────
// Sign only with a verified domain owned by the sending account.
export async function getDkimConfig(
  db: ReturnType<typeof getDb>,
  ownerId: string,
  senderDomain: string,
): Promise<{
  domainName: string;
  keySelector: string;
  privateKey: string;
} | null> {
  const [domain] = await db
    .select({
      domain: domains.domain,
      selector: domains.dkimSelector,
      privateKey: domains.dkimPrivateKey,
    })
    .from(domains)
    .where(
      and(
        eq(domains.domain, senderDomain),
        eq(domains.userId, ownerId),
        eq(domains.verified, true),
      ),
    )
    .limit(1);

  if (!domain?.privateKey) return null;

  return {
    domainName: domain.domain,
    keySelector: domain.selector,
    privateKey: domain.privateKey,
  };
}

// ─── Send to single recipient ─────────────────────────────
async function deliverToRecipient(
  rawMessage: Buffer,
  from: string,
  recipient: string,
  dkim: { domainName: string; keySelector: string; privateKey: string } | null,
): Promise<{ code: number; response: string; mxHost: string }> {
  const recipientDomain = recipient.split("@")[1];
  if (!recipientDomain) throw new Error(`Invalid recipient: ${recipient}`);

  const mxHost = await resolveMx(recipientDomain);

  const transport = createTransport({
    host: mxHost,
    port: 25,
    secure: false, // use STARTTLS opportunistically
    tls: {
      rejectUnauthorized: false, // many MTAs use self-signed certs
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
    ...(dkim
      ? {
          dkim: {
            domainName: dkim.domainName,
            keySelector: dkim.keySelector,
            privateKey: dkim.privateKey,
          },
        }
      : {}),
  });

  const info = await transport.sendMail({
    envelope: { from, to: [recipient] },
    raw: rawMessage,
  });

  transport.close();

  return {
    code: 250,
    response: info.response || "OK",
    mxHost,
  };
}

// ─── Webhook firing ───────────────────────────────────────
async function fireWebhooks(
  redisPub: InstanceType<typeof Redis.default>,
  event: string,
  payload: Record<string, unknown>,
) {
  // Publish to Redis for the webhook dispatcher
  await redisPub.publish("webhook:fire", JSON.stringify({ event, ...payload }));
}

// ─── Main processor ───────────────────────────────────────
export function createOutboundProcessor(
  env: Env,
  db: ReturnType<typeof getDb>,
  storage: StorageClient,
  redisPub: InstanceType<typeof Redis.default>,
) {
  return async function processOutboundEmail(job: Job<OutboundEmailPayload>) {
    const { messageId, userId, from, to, rawKey } = job.data;

    console.log(`📤 Outbound delivery: ${messageId} → ${to.join(", ")}`);

    // 1. Download the raw .eml from MinIO
    let rawBuffer = await storage.getObjectAsBuffer(rawKey);

    // 2. Inject click/open tracking into HTML body
    try {
      const parsed = await simpleParser(rawBuffer);
      if (parsed.html) {
        const trackedHtml = injectTracking(
          parsed.html as string,
          messageId,
          env.TRACKING_BASE_URL,
          env.JWT_SECRET,
        );
        // Rebuild the MIME message with tracked HTML
        const mail = new MailComposer({
          from: parsed.from?.text,
          to: parsed.to
            ? Array.isArray(parsed.to)
              ? parsed.to.map((a) => a.text).join(", ")
              : parsed.to.text
            : undefined,
          cc: parsed.cc
            ? Array.isArray(parsed.cc)
              ? parsed.cc.map((a) => a.text).join(", ")
              : parsed.cc.text
            : undefined,
          subject: parsed.subject,
          text: parsed.text || undefined,
          html: trackedHtml,
          attachments: parsed.attachments?.map((a) => ({
            filename: a.filename || "attachment",
            content: a.content,
            contentType: a.contentType,
          })),
        });
        rawBuffer = await new Promise<Buffer>((resolve, reject) => {
          mail.compile().build((err: Error | null, message: Buffer) => {
            if (err) reject(err);
            else resolve(message);
          });
        });
      }
    } catch (err) {
      console.warn(
        `  ⚠️ Tracking injection failed, sending without tracking:`,
        err,
      );
    }

    // 3. Look up DKIM config for sender domain
    const ownerId = await resolveOwnerId(db, messageId, userId);
    const senderDomain = extractSenderDomain(from);
    const dkim =
      ownerId && senderDomain
        ? await getDkimConfig(db, ownerId, senderDomain)
        : null;

    // Re-check suppressions now: the address may have been suppressed (or
    // bounced) after this message was queued, e.g. scheduled sends.
    const suppressedNow = new Set<string>();
    if (ownerId) {
      const rows = await db
        .select({ email: suppressions.email })
        .from(suppressions)
        .where(
          and(
            eq(suppressions.userId, ownerId),
            inArray(
              suppressions.email,
              to.map((r) => r.toLowerCase()),
            ),
          ),
        );
      for (const r of rows) suppressedNow.add(r.email);
    }
    // A retry re-runs the whole recipient list; don't mail people twice.
    const alreadyDelivered = new Set(
      (
        await db
          .select({ recipient: deliveryLogs.recipient })
          .from(deliveryLogs)
          .where(
            and(
              eq(deliveryLogs.messageId, messageId),
              eq(deliveryLogs.status, "delivered"),
            ),
          )
      ).map((r) => r.recipient),
    );
    let attempted = 0;
    let deliveredCount = 0;

    if (dkim) {
      console.log(
        `  🔑 DKIM signing: ${dkim.keySelector}._domainkey.${dkim.domainName}`,
      );
    }

    // 3. Deliver to each recipient individually
    // In testing mode, skip real SMTP delivery — just log as delivered
    const isTestingMode = env.APP_MODE === "testing";

    for (const recipient of to) {
      if (suppressedNow.has(recipient.toLowerCase())) {
        await db.insert(deliveryLogs).values({
          messageId,
          recipient,
          status: "suppressed",
          attempts: (job.attemptsMade || 0) + 1,
          lastAttemptAt: new Date(),
        });
        console.log(`  🚫 ${recipient} skipped (suppressed)`);
        continue;
      }
      if (alreadyDelivered.has(recipient)) {
        attempted++;
        deliveredCount++;
        continue;
      }
      attempted++;

      // Create delivery log entry
      const [log] = await db
        .insert(deliveryLogs)
        .values({
          messageId,
          recipient,
          status: "sending",
          attempts: (job.attemptsMade || 0) + 1,
          lastAttemptAt: new Date(),
        })
        .returning({ id: deliveryLogs.id });

      const logId = log?.id;

      try {
        if (isTestingMode) {
          // Testing mode: simulate delivery without contacting real MTA
          if (logId) {
            await db
              .update(deliveryLogs)
              .set({
                status: "delivered",
                smtpCode: 250,
                smtpResponse: "OK (simulated — testing mode)",
                mxHost: "localhost",
                deliveredAt: new Date(),
              })
              .where(eq(deliveryLogs.id, logId));
          }

          console.log(
            `  ✅ ${recipient} → delivered (testing mode — no real SMTP)`,
          );

          await fireWebhooks(redisPub, "delivered", {
            messageId,
            recipient,
            mxHost: "localhost",
          });
          deliveredCount++;
          continue;
        }

        const result = await deliverToRecipient(
          rawBuffer,
          from,
          recipient,
          dkim,
        );

        // Update delivery log → delivered
        if (logId) {
          await db
            .update(deliveryLogs)
            .set({
              status: "delivered",
              smtpCode: result.code,
              smtpResponse: result.response,
              mxHost: result.mxHost,
              deliveredAt: new Date(),
            })
            .where(eq(deliveryLogs.id, logId));
        }

        console.log(`  ✅ ${recipient} → delivered via ${result.mxHost}`);
        deliveredCount++;

        // Fire webhook
        await fireWebhooks(redisPub, "delivered", {
          messageId,
          recipient,
          mxHost: result.mxHost,
        });
      } catch (err: any) {
        const smtpCode = extractSmtpCode(err);
        const errorType = classifySmtpError(smtpCode);

        // Update delivery log
        if (logId) {
          await db
            .update(deliveryLogs)
            .set({
              status: errorType === "temporary" ? "deferred" : "bounced",
              smtpCode,
              smtpResponse: err.message?.substring(0, 1000),
              lastAttemptAt: new Date(),
            })
            .where(eq(deliveryLogs.id, logId));
        }

        if (errorType === "temporary") {
          console.warn(
            `  ⏳ ${recipient} → deferred (${smtpCode}): ${err.message}`,
          );
          // BullMQ will retry automatically via job config
          throw err;
        } else {
          // Permanent failure — log but don't retry
          console.error(
            `  ❌ ${recipient} → bounced (${smtpCode}): ${err.message}`,
          );

          await fireWebhooks(redisPub, "bounced", {
            messageId,
            recipient,
            smtpCode,
            error: err.message?.substring(0, 500),
          });

          // Auto-suppress recipients the remote server says don't exist
          if (ownerId && isRecipientRejection(err)) {
            try {
              await db
                .insert(suppressions)
                .values({
                  userId: ownerId,
                  email: recipient.toLowerCase(),
                  reason: "hard_bounce",
                  source: messageId,
                })
                .onConflictDoNothing();
              console.log(`  🚫 Auto-suppressed ${recipient} (hard bounce)`);
            } catch (suppErr) {
              console.warn(
                `  ⚠️ Failed to auto-suppress ${recipient}:`,
                suppErr,
              );
            }
          }
        }
      }
    }

    // 4. Update message status
    await db
      .update(messages)
      .set({
        // A message only counts as delivered if at least one recipient was;
        // permanent per-recipient failures no longer leave it "delivered".
        status:
          attempted === 0
            ? "suppressed"
            : deliveredCount > 0
              ? "delivered"
              : "bounced",
      })
      .where(eq(messages.id, messageId));

    // 5. Publish real-time event so the UI refreshes
    const [msg] = await db
      .select({ inboxId: messages.inboxId, subject: messages.subject })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (msg) {
      await redisPub.publish(
        "email:new",
        JSON.stringify({
          inboxId: msg.inboxId,
          subject: msg.subject,
          from,
        }),
      );
    }

    console.log(`📤 Outbound complete: ${messageId}`);
  };
}
