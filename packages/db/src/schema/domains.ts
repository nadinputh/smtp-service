import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    domain: varchar("domain", { length: 255 }).notNull(),

    // DKIM
    dkimSelector: varchar("dkim_selector", { length: 63 })
      .notNull()
      .default("smtp1"),
    dkimPrivateKey: text("dkim_private_key"), // PEM-encoded RSA private key
    dkimPublicKey: text("dkim_public_key"), // for DNS TXT record display

    verified: boolean("verified").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One entry per account per domain...
    uniqueIndex("domains_user_domain_idx").on(table.userId, table.domain),
    // ...and only one account may hold a domain as verified. Unverified
    // claims can coexist, so an unproven claim can't squat on a domain.
    uniqueIndex("domains_verified_domain_idx")
      .on(table.domain)
      .where(sql`${table.verified} = true`),
  ],
);
