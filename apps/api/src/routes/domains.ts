import type { FastifyInstance } from "fastify";
import { generateKeyPairSync } from "node:crypto";
import { promises as dns } from "node:dns";
import { getEnv } from "@mailpocket/env";
import { getDb, domains } from "@mailpocket/db";
import { eq, and } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { isOwnerOrAdmin, isGlobalAdmin } from "../middleware/access.js";

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
      const { domain: domainName } = request.body;

      if (!domainName) {
        return reply.status(400).send({ error: "domain is required" });
      }

      // Validate domain format
      if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domainName)) {
        return reply.status(400).send({ error: "Invalid domain format" });
      }

      // Check if domain already exists for this user
      const [existing] = await db
        .select({ id: domains.id })
        .from(domains)
        .where(
          and(
            eq(domains.userId, request.user!.userId),
            eq(domains.domain, domainName.toLowerCase()),
          ),
        )
        .limit(1);

      if (existing) {
        return reply.status(409).send({ error: "Domain already added" });
      }

      // Generate DKIM RSA key pair
      const { publicKey, privateKey } = generateKeyPairSync("rsa", {
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
          domain: domainName.toLowerCase(),
          dkimSelector: "smtp1",
          dkimPrivateKey: privateKey,
          dkimPublicKey: pubKeyBase64,
        })
        .returning();

      return reply.status(201).send({
        ...domain,
        dkimPrivateKey: undefined, // Don't expose private key
        dnsRecords: {
          dkim: {
            type: "TXT",
            name: `smtp1._domainkey.${domainName.toLowerCase()}`,
            value: `v=DKIM1; k=rsa; p=${pubKeyBase64}`,
          },
          spf: {
            type: "TXT",
            name: domainName.toLowerCase(),
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
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = request.params;

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
      const dkimHost = `${domain.dkimSelector}._domainkey.${domain.domain}`;

      try {
        const records = await dns.resolveTxt(dkimHost);
        const flat = records.map((r) => r.join("")).join("");
        if (!flat.includes(domain.dkimPublicKey ?? "")) {
          errors.push(
            `DKIM TXT record at ${dkimHost} does not contain the expected public key`,
          );
        }
      } catch {
        errors.push(`No TXT record found at ${dkimHost}`);
      }

      const verified = errors.length === 0;

      if (verified) {
        await db
          .update(domains)
          .set({ verified: true, updatedAt: new Date() })
          .where(eq(domains.id, id));
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
