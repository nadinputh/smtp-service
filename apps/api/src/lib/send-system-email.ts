import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { getDb, messages } from "@mailpocket/db";
import type { StorageClient } from "@mailpocket/storage";
import { type OutboundEmailPayload, type Queue } from "@mailpocket/queue";

/**
 * Sends a one-off transactional email (password reset, etc.) through the
 * same outbound pipeline as user-sent mail — same delivery, retry, and
 * logging behavior, attributed to the system inbox rather than a user's.
 */
export async function sendSystemEmail(opts: {
  db: ReturnType<typeof getDb>;
  storage: StorageClient;
  outboundQueue: Queue<OutboundEmailPayload>;
  systemInboxId: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const {
    db,
    storage,
    outboundQueue,
    systemInboxId,
    from,
    to,
    subject,
    text,
    html,
  } = opts;

  const mail = new MailComposer({ from, to, subject, text, html });
  const rawBuffer = await new Promise<Buffer>((resolve, reject) => {
    mail.compile().build((err: Error | null, message: Buffer) => {
      if (err) reject(err);
      else resolve(message);
    });
  });

  const messageId = randomUUID();
  const rawKey = `outbound/${messageId}.eml`;

  await storage.putObject(rawKey, Readable.from(rawBuffer), rawBuffer.length);

  await db.insert(messages).values({
    id: messageId,
    inboxId: systemInboxId,
    from,
    to: [to],
    subject,
    text,
    html,
    rawKey,
    size: rawBuffer.length,
    status: "queued",
  });

  const payload: OutboundEmailPayload = {
    messageId,
    from,
    to: [to],
    rawKey,
  };
  await outboundQueue.add("send", payload, { jobId: messageId });
}
