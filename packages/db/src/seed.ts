import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { users } from "./schema/users.js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error(
    "❌  ADMIN_PASSWORD env var is required.\n" +
      "   Set ADMIN_EMAIL and ADMIN_PASSWORD in .env or pass them directly.",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL env var is required.");
  process.exit(1);
}

async function seed() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    // Check if admin already exists
    const [existing] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, ADMIN_EMAIL))
      .limit(1);

    if (existing) {
      if (existing.role === "admin") {
        console.log(
          `✅  Admin user "${ADMIN_EMAIL}" already exists. Skipping.`,
        );
      } else {
        // Promote existing user to admin
        await db
          .update(users)
          .set({ role: "admin" })
          .where(eq(users.id, existing.id));
        console.log(
          `✅  Promoted existing user "${ADMIN_EMAIL}" to admin role.`,
        );
      }
    } else {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD!, 12);
      await db.insert(users).values({
        email: ADMIN_EMAIL,
        passwordHash,
        name: "Admin",
        role: "admin",
      });
      console.log(`✅  Created admin user "${ADMIN_EMAIL}".`);
    }
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
