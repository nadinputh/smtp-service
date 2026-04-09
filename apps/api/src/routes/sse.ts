import type { FastifyInstance } from "fastify";
import { getEnv } from "@smtp-service/env";
import Redis from "ioredis";

export function registerSSERoutes(app: FastifyInstance) {
  const env = getEnv();

  app.get("/api/events", (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sub = new Redis.default({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
    });

    sub.subscribe("email:new").catch((err: Error) => {
      request.log.error({ err }, "SSE Redis subscribe error");
    });

    sub.on("message", (_channel: string, message: string) => {
      reply.raw.write(`data: ${message}\n\n`);
    });

    request.raw.on("close", () => {
      sub.unsubscribe();
      sub.disconnect();
    });
  });
}
