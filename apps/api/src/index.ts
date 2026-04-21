import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import { getEnv } from "@mailpocket/env";
import { getDb } from "@mailpocket/db";
import {
  createIncomingQueue,
  createOutboundQueue,
  createRedisConnection,
} from "@mailpocket/queue";
import { sql } from "drizzle-orm";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerInboxRoutes } from "./routes/inboxes.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerSendRoutes } from "./routes/send.js";
import { registerSSERoutes } from "./routes/sse.js";
import { registerDomainRoutes } from "./routes/domains.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerTrackingRoutes } from "./routes/tracking.js";
import { registerApiKeyRoutes } from "./routes/api-keys.js";
import { registerTemplateRoutes } from "./routes/templates.js";
import { registerSuppressionRoutes } from "./routes/suppressions.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerInboxMemberRoutes } from "./routes/inbox-members.js";
import { registerQuotaRoutes } from "./routes/quotas.js";
import { registerTeamRoutes } from "./routes/teams.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { authGuard } from "./middleware/auth.js";
import { requireAdmin } from "./middleware/access.js";

const env = getEnv();

const app = Fastify({
  logger: true,
  trustProxy: env.APP_MODE === "production",
});

// ─── Security Headers ─────────────────────────────────────
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding tracking pixel
});

// ─── CORS ─────────────────────────────────────────────────
const allowedOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : env.APP_MODE === "production"
    ? [] // No open CORS in production
    : true; // Permissive in testing mode

await app.register(cors, {
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

// ─── Global Rate Limiting ─────────────────────────────────
await app.register(rateLimit, {
  max: 100, // 100 requests per window
  timeWindow: 60000, // 1 minute
  keyGenerator: (request) => {
    // Rate limit by authenticated user or IP
    return (request as any).user?.userId ?? request.ip;
  },
});

// ─── Routes ───────────────────────────────────────────────
// Health check — verifies DB connectivity
app.get("/health", { config: { rateLimit: false } }, async () => {
  const db = getDb(env.DATABASE_URL);
  try {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", db: "connected" };
  } catch (err: any) {
    return { status: "degraded", error: err.message };
  }
});

// ─── Bull Board (queue dashboard) ─────────────────────────
const bullBoardAdapter = new FastifyAdapter();
const redisForQueues = createRedisConnection({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
});
createBullBoard({
  queues: [
    new BullMQAdapter(createIncomingQueue(redisForQueues)),
    new BullMQAdapter(createOutboundQueue(redisForQueues)),
  ],
  serverAdapter: bullBoardAdapter,
});
bullBoardAdapter.setBasePath("/admin/queues");
await app.register(async (scope) => {
  scope.addHook("preHandler", authGuard);
  scope.addHook("preHandler", requireAdmin);
  await scope.register(bullBoardAdapter.registerPlugin(), {
    prefix: "/admin/queues",
  });
});

registerAuthRoutes(app);
registerInboxRoutes(app);
registerMessageRoutes(app);
registerSendRoutes(app);
registerDomainRoutes(app);
registerWebhookRoutes(app);
registerTrackingRoutes(app);
registerApiKeyRoutes(app);
registerTemplateRoutes(app);
registerSuppressionRoutes(app);
registerAnalyticsRoutes(app);
registerExportRoutes(app);
registerInboxMemberRoutes(app);
registerQuotaRoutes(app);
registerSSERoutes(app);
registerTeamRoutes(app);
registerAdminRoutes(app);

// ─── Start ────────────────────────────────────────────────
app.listen({ port: env.API_PORT, host: env.API_HOST }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`🚀 API server listening on ${address}`);
});

// ─── Graceful shutdown ────────────────────────────────────
function shutdown() {
  console.log("\n🛑 Shutting down API server…");
  app
    .close()
    .then(() => {
      console.log("✅ API shutdown complete");
      process.exit(0);
    })
    .catch(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
