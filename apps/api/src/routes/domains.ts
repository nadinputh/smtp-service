import type { FastifyInstance } from "fastify";
import { generateKeyPair } from "node:crypto";
import { promisify } from "node:util";
import { promises as dns } from "node:dns";
import { getEnv } from "@mailpocket/env";
import { getDb, domains } from "@mailpocket/db";
import { eq, and, or } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { isOwnerOrAdmin, isGlobalAdmin, isUuid } from "../middleware/access.js";
import { normalizeDomain } from "../lib/address.js";

const generateKeyPairAsync = promisify(generateKeyPair);

/** True if any TXT record's `p=` tag equals the expected public key. */
function dkimKeyMatches(records: string[][], expectedKey: string): boolean {
  return records.some((parts) => {
    const tag = /(?:^|;)\s*p=([^;]*)/.exec(parts.join(""));
    return tag !== null && tag[1].replace(/\s+/g, "") === expectedKey;
  });
}

/** Postgres unique_violation, whether raw or wrapped by drizzle. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e?.code ?? e?.cause?.code) === "23505";
}

export function registerDomainRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // List domains (admins see all, users see their own)
  app.get("/api/domains", { preHandler: authGuard }, async (request) => {
    const userId = request.user!.userId;
    const admin = await isGlobalAdmin(userId);

    const query = db
      .select({
        id: domains.id,
        domain: domains.domain,
        dkimSelector: domains.dkimSelector,
        dkimPublicKey: domains.dkimPublicKey,
        verified: domains.verified,
        createdAt: domains.createdAt,
      })
      .from(domains);

    if (!admin) {
      return query.where(eq(domains.userId, userId));
    }
    return query;
  });

  // Add a domain with auto-generated DKIM keys
  app.post<{ Body: { domain: string } }>(
    "/api/domains",
    { preHandler: authGuard },
    async (request, reply) => {
      const domainName = normalizeDomain(request.body?.domain);

      if (!domainName) {
        return reply.status(400).send({ error: "A valid domain is required" });
      }

      // Reject a repeat by this account, or a domain another account has
      // already proven it controls. Unverified claims by others don't block.
      const [existing] = await db
        .select({ userId: domains.userId })
        .from(domains)
        .where(
          and(
            eq(domains.domain, domainName),
            or(
              eq(domains.userId, request.user!.userId),
              eq(domains.verified, true),
            ),
          ),
        )
        .limit(1);

      if (existing) {
        return reply.status(409).send({
          error:
            existing.userId === request.user!.userId
              ? "Domain already added"
              : "Domain is already verified by another account",
        });
      }

      // Generate DKIM RSA key pair
      // Async so the CPU-bound RSA keygen runs off the event loop.
      const { publicKey, privateKey } = await generateKeyPairAsync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });

      // Extract base64 body of public key for DNS TXT record
      const pubKeyBase64 = publicKey
        .replace("-----BEGIN PUBLIC KEY-----", "")
        .replace("-----END PUBLIC KEY-----", "")
        .replace(/\n/g, "");

      const [domain] = await db
        .insert(domains)
        .values({
          userId: request.user!.userId,
          domain: domainName,
          dkimSelector: "smtp1",
          dkimPrivateKey: privateKey,
          dkimPublicKey: pubKeyBase64,
        })
        .onConflictDoNothing()
        .returning();

      // Lost a race with a concurrent request for the same domain.
      if (!domain) {
        return reply.status(409).send({ error: "Domain already added" });
      }

      return reply.status(201).send({
        ...domain,
        dkimPrivateKey: undefined, // Don't expose private key
        dnsRecords: {
          dkim: {
            type: "TXT",
            name: `smtp1._domainkey.${domainName}`,
            value: `v=DKIM1; k=rsa; p=${pubKeyBase64}`,
          },
          spf: {
            type: "TXT",
            name: domainName,
            value: `v=spf1 ip4:<YOUR_SERVER_IP> -all`,
            note: "Replace <YOUR_SERVER_IP> with your server's public IP address",
          },
        },
      });
    },
  );

  // Verify domain DNS records (DKIM TXT lookup)
  app.post<{ Params: { id: string } }>(
    "/api/domains/:id/verify",
    {
      preHandler: authGuard,
      config: { rateLimit: { max: 20, timeWindow: 60000 } },
    },
    async (request, reply) => {
      const { id } = request.params;

      if (!isUuid(id)) {
        return reply.status(404).send({ error: "Domain not found" });
      }

      const [domain] = await db
        .select()
        .from(domains)
        .where(eq(domains.id, id))
        .limit(1);

      if (!domain) {
        return reply.status(404).send({ error: "Domain not found" });
      }

      if (!(await isOwnerOrAdmin(request.user!.userId, domain.userId))) {
        return reply.status(404).send({ error: "Domain not found" });
      }

      const errors: string[] = [];
      let transientFailure = false;
      const dkimHost = `${domain.dkimSelector}._domainkey.${domain.domain}`;

      if (!domain.dkimPublicKey) {
        errors.push("Domain has no DKIM public key on record");
      } else {
        try {
          const records = await dns.resolveTxt(dkimHost);
          if (!dkimKeyMatches(records, domain.dkimPublicKey)) {
            errors.push(
              `DKIM TXT record at ${dkimHost} does not contain the expected public key`,
            );
          }
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOTFOUND" || code === "ENODATA") {
            errors.push(`No TXT record found at ${dkimHost}`);
          } else {
            transientFailure = true;
            errors.push(
              `DNS lookup for ${dkimHost} failed (${code ?? "unknown error"}); try again`,
            );
          }
        }
      }

      const verified = errors.length === 0;

      // Verification tracks the current DNS state, but a transient resolver
      // failure must not revoke an already-verified domain.
      if (!transientFailure && verified !== domain.verified) {
        try {
          await db
            .update(domains)
            .set({ verified, updatedAt: new Date() })
            .where(eq(domains.id, id));
        } catch (err) {
          // Another account verified this domain first.
          if (isUniqueViolation(err)) {
            return reply.status(409).send({
              error: "Domain is already verified by another account",
            });
          }
          throw err;
        }
      }

      return { verified, errors };
    },
  );

  // Delete a domain
  app.delete<{ Params: { id: string } }>(
    "/api/domains/:id",
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = request.params;

      if (!isUuid(id)) {
        return reply.status(404).send({ error: "Domain not found" });
      }

      const [domain] = await db
        .select({ id: domains.id, userId: domains.userId })
        .from(domains)
        .where(eq(domains.id, id))
        .limit(1);

      if (!domain) {
        return reply.status(404).send({ error: "Domain not found" });
      }

      if (!(await isOwnerOrAdmin(request.user!.userId, domain.userId))) {
        return reply.status(404).send({ error: "Domain not found" });
      }

      await db.delete(domains).where(eq(domains.id, id));

      return { success: true };
    },
  );
}
