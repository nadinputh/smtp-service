import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, messages, inboxes } from "@mailpocket/db";
import { createStorage, type StorageClient } from "@mailpocket/storage";
import { eq, and } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { requireInboxRole } from "../middleware/access.js";
import archiver from "archiver";
import { Readable, PassThrough } from "node:stream";

export function registerExportRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);
  const storage = createStorage(
    env.STORAGE_DRIVER === "local"
      ? {
          driver: "local",
          basePath: env.STORAGE_LOCAL_PATH,
          bucket: env.MINIO_BUCKET,
        }
      : {
          driver: "s3",
          endPoint: env.MINIO_ENDPOINT,
          port: env.MINIO_PORT,
          accessKey: env.MINIO_ACCESS_KEY!,
          secretKey: env.MINIO_SECRET_KEY!,
          useSSL: env.MINIO_USE_SSL,
          bucket: env.MINIO_BUCKET,
        },
  );

  // ─── Export Messages ────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/api/inboxes/:id/export",
    { preHandler: [authGuard, requireInboxRole("viewer")] },
    async (request, reply) => {
      const { id } = request.params;
      const format = request.query.format ?? "csv";

      // Get inbox name for the export filename
      const [inbox] = await db
        .select({ name: inboxes.name })
        .from(inboxes)
        .where(eq(inboxes.id, id))
        .limit(1);

      if (!inbox) {
        return reply.status(404).send({ error: "Inbox not found" });
      }

      // Fetch all messages for this inbox
      const inboxMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.inboxId, id));

      if (format === "csv") {
        return exportCsv(reply, inbox.name, inboxMessages);
      } else if (format === "mbox") {
        return exportMbox(reply, inbox.name, inboxMessages, storage);
      } else if (format === "eml") {
        return exportEmlZip(reply, inbox.name, inboxMessages, storage);
      } else {
        return reply
          .status(400)
          .send({ error: "Invalid format. Use csv, mbox, or eml." });
      }
    },
  );
}

function exportCsv(reply: any, inboxName: string, msgs: any[]) {
  const header = "id,from,to,subject,date,status,spam_score,size,created_at\n";
  const rows = msgs
    .map((m) => {
      const to = Array.isArray(m.to) ? m.to.join("; ") : m.to;
      const subject = (m.subject ?? "").replace(/"/g, '""');
      const date = m.date ? new Date(m.date).toISOString() : "";
      const createdAt = m.createdAt ? new Date(m.createdAt).toISOString() : "";
      return `${m.id},"${m.from}","${to}","${subject}",${date},${m.status},${m.spamScore ?? ""},${m.size ?? ""},${createdAt}`;
    })
    .join("\n");

  reply.header("Content-Type", "text/csv; charset=utf-8");
  reply.header(
    "Content-Disposition",
    `attachment; filename="${inboxName}-export.csv"`,
  );
  return reply.send(header + rows);
}

async function exportMbox(
  reply: any,
  inboxName: string,
  msgs: any[],
  storage: StorageClient,
) {
  reply.header("Content-Type", "application/mbox");
  reply.header(
    "Content-Disposition",
    `attachment; filename="${inboxName}-export.mbox"`,
  );

  const passthrough = new PassThrough();
  reply.send(passthrough);

  for (const msg of msgs) {
    try {
      const buffer = await storage.getObjectAsBuffer(msg.rawKey);
      const from = msg.from || "unknown@unknown";
      const date = msg.createdAt
        ? new Date(msg.createdAt).toUTCString()
        : new Date().toUTCString();
      // MBOX separator
      passthrough.write(`From ${from} ${date}\n`);
      // Escape lines starting with "From " in the body
      const content = buffer.toString("utf-8").replace(/^From /gm, ">From ");
      passthrough.write(content);
      passthrough.write("\n\n");
    } catch {
      // Skip messages with missing storage
    }
  }

  passthrough.end();
}

async function exportEmlZip(
  reply: any,
  inboxName: string,
  msgs: any[],
  storage: StorageClient,
) {
  reply.header("Content-Type", "application/zip");
  reply.header(
    "Content-Disposition",
    `attachment; filename="${inboxName}-export.zip"`,
  );

  const archive = archiver("zip", { zlib: { level: 6 } });

  // Pipe archive to reply
  const passthrough = new PassThrough();
  archive.pipe(passthrough);
  reply.send(passthrough);

  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    try {
      const buffer = await storage.getObjectAsBuffer(msg.rawKey);
      const filename = `${(msg.subject || "no-subject").replace(/[^a-zA-Z0-9\-_ ]/g, "").slice(0, 50)}-${i + 1}.eml`;
      archive.append(buffer, { name: filename });
    } catch {
      // Skip messages with missing storage
    }
  }

  await archive.finalize();
}
