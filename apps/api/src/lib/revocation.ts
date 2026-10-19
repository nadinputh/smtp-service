import Redis from "ioredis";
import { getEnv } from "@mailpocket/env";

let client: InstanceType<typeof Redis.default> | undefined;

function redis() {
  if (!client) {
    const env = getEnv();
    client = new Redis.default({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
    });
  }
  return client;
}

const key = (jti: string) => `revoked-token:${jti}`;

/** Deny a session token until it would have expired anyway. */
export async function revokeToken(jti: string, exp: number): Promise<void> {
  const ttl = exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) await redis().set(key(jti), "1", "EX", ttl);
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  return (await redis().exists(key(jti))) === 1;
}
