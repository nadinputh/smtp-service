import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import { SMTPServer } from "smtp-server";
import { getEnv } from "@mailpocket/env";
import { getDb, inboxes } from "@mailpocket/db";
import { createStorage } from "@mailpocket/storage";
import {
  createIncomingQueue,
  createRedisConnection,
  type IncomingEmailPayload,
} from "@mailpocket/queue";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";

const env = getEnv();
const isTesting = env.APP_MODE === "testing";

// Parse ports: SMTP_PORTS takes precedence, fallback to SMTP_PORT
const ports = env.SMTP_PORTS
  ? env.SMTP_PORTS.split(",")
      .map((p) => parseInt(p.trim(), 10))
      .filter((p) => !isNaN(p))
  : [env.SMTP_PORT];

// ─── Initialize dependencies ─────────────────────────────
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
const redisConnection = createRedisConnection({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
});
const incomingQueue = createIncomingQueue(redisConnection);

await storage.ensureBucket();

// ─── SMTP Server ──────────────────────────────────────────
const smtpOptions: ConstructorParameters<typeof SMTPServer>[0] = {
  authOptional: isTesting,
  allowInsecureAuth: true, // Only for local dev — TLS will be enforced in production
  disabledCommands: ["STARTTLS"], // Disable TLS for local testing

  // Authenticate against the inboxes table
  async onAuth(auth, _session, callback) {
    try {
      const [inbox] = await db
        .select()
        .from(inboxes)
        .where(eq(inboxes.smtpUsername, auth.username ?? ""))
        .limit(1);

      if (!inbox || inbox.smtpPassword !== auth.password) {
        return callback(new Error("Invalid username or password"));
      }

      callback(null, { user: { inboxId: inbox.id } });
    } catch (err) {
      callback(new Error("Authentication failed"));
    }
  },

  // Stream the raw email to MinIO and enqueue a job
  onData(stream, session, callback) {
    const rawKey = `raw/${randomUUID()}.eml`;
    const passthrough = new PassThrough();
    let size = 0;

    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      passthrough.write(chunk);
    });

    stream.on("end", async () => {
      passthrough.end();

      try {
        // Upload raw .eml to MinIO
        await storage.putObject(rawKey, passthrough, size, "message/rfc822");

        // Resolve inbox ID: authenticated user's inbox or catch-all
        const user = (session as any).user as { inboxId: string } | undefined;
        let inboxId: string;

        if (user?.inboxId) {
          inboxId = user.inboxId;
        } else if (isTesting) {
          // Catch-all mode: route to first available inbox
          const [firstInbox] = await db
            .select({ id: inboxes.id })
            .from(inboxes)
            .limit(1);
          if (!firstInbox) {
            callback(new Error("No inbox available for catch-all"));
            return;
          }
          inboxId = firstInbox.id;
        } else {
          callback(new Error("Authentication required"));
          return;
        }

        // Extract envelope info
        const from = session.envelope.mailFrom
          ? session.envelope.mailFrom.address
          : "unknown";
        const to = session.envelope.rcptTo.map((r) => r.address);

        // Enqueue for background processing
        const payload: IncomingEmailPayload = {
          inboxId,
          rawKey,
          from,
          to,
          size,
          receivedAt: new Date().toISOString(),
        };

        await incomingQueue.add("parse", payload);

        callback();
      } catch (err) {
        console.error("Failed to process incoming email:", err);
        callback(new Error("Failed to store email"));
      }
    });

    stream.on("error", (err) => {
      console.error("Stream error:", err);
      callback(new Error("Stream error"));
    });
  },
};

// Create a server for each configured port
const servers = ports.map((port) => {
  const server = new SMTPServer(smtpOptions);
  server.on("error", (err) => {
    console.error(`SMTP Server error (port ${port}):`, err);
  });
  server.listen(port, env.SMTP_HOST, () => {
    console.log(`📬 SMTP server listening on ${env.SMTP_HOST}:${port}`);
  });
  return server;
});

if (isTesting) {
  console.log("🧪 Catch-all mode enabled — authentication is optional");
}

// ─── Graceful shutdown ────────────────────────────────────
function shutdown() {
  console.log("\n🛑 Shutting down SMTP server(s)…");
  Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  )
    .then(() => incomingQueue.close())
    .then(() => {
      console.log("✅ SMTP shutdown complete");
      process.exit(0);
    })
    .catch(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
