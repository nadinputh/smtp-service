import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, templates } from "@mailpocket/db";
import { eq, and, desc } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { isOwnerOrAdmin, isGlobalAdmin } from "../middleware/access.js";

/** Extract {{var}} names from content */
function extractVariables(
  ...contents: (string | null | undefined)[]
): string[] {
  const vars = new Set<string>();
  for (const content of contents) {
    if (!content) continue;
    for (const match of content.matchAll(/\{\{(\w+)\}\}/g)) {
      vars.add(match[1]);
    }
  }
  return [...vars];
}

export function registerTemplateRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // List templates (admins see all, users see their own)
  app.get("/api/templates", { preHandler: authGuard }, async (request) => {
    const userId = request.user!.userId;
    const admin = await isGlobalAdmin(userId);

    const query = db
      .select()
      .from(templates)
      .orderBy(desc(templates.updatedAt));

    if (!admin) {
      return query.where(eq(templates.userId, userId));
    }
    return query;
  });

  // Get single template
  app.get<{ Params: { id: string } }>(
    "/api/templates/:id",
    { preHandler: authGuard },
    async (request, reply) => {
      const [tpl] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, request.params.id))
        .limit(1);

      if (!tpl) {
        return reply.status(404).send({ error: "Template not found" });
      }

      if (!(await isOwnerOrAdmin(request.user!.userId, tpl.userId))) {
        return reply.status(404).send({ error: "Template not found" });
      }

      return tpl;
    },
  );

  // Create template
  app.post<{
    Body: { name: string; subject?: string; html: string; text?: string };
  }>("/api/templates", { preHandler: authGuard }, async (request, reply) => {
    const { name, subject, html, text } = request.body;

    if (!name || !html) {
      return reply.status(400).send({ error: "name and html are required" });
    }

    const variables = extractVariables(subject, html, text);

    const [created] = await db
      .insert(templates)
      .values({
        userId: request.user!.userId,
        name,
        subject: subject ?? null,
        html,
        text: text ?? null,
        variables,
      })
      .returning();

    return reply.status(201).send(created);
  });

  // Update template
  app.put<{
    Params: { id: string };
    Body: { name?: string; subject?: string; html?: string; text?: string };
  }>(
    "/api/templates/:id",
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = request.params;
      const { name, subject, html, text } = request.body;

      const [existing] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Template not found" });
      }

      if (!(await isOwnerOrAdmin(request.user!.userId, existing.userId))) {
        return reply.status(404).send({ error: "Template not found" });
      }

      const newHtml = html ?? existing.html;
      const newSubject = subject !== undefined ? subject : existing.subject;
      const newText = text !== undefined ? text : existing.text;
      const variables = extractVariables(newSubject, newHtml, newText);

      const [updated] = await db
        .update(templates)
        .set({
          ...(name !== undefined ? { name } : {}),
          ...(subject !== undefined ? { subject } : {}),
          ...(html !== undefined ? { html } : {}),
          ...(text !== undefined ? { text } : {}),
          variables,
          updatedAt: new Date(),
        })
        .where(eq(templates.id, id))
        .returning();

      return updated;
    },
  );

  // Delete template
  app.delete<{ Params: { id: string } }>(
    "/api/templates/:id",
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = request.params;

      const [existing] = await db
        .select({ id: templates.id, userId: templates.userId })
        .from(templates)
        .where(eq(templates.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Template not found" });
      }

      if (!(await isOwnerOrAdmin(request.user!.userId, existing.userId))) {
        return reply.status(404).send({ error: "Template not found" });
      }

      await db.delete(templates).where(eq(templates.id, id));

      return { success: true };
    },
  );
}
