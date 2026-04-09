import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const domains = pgTable("domains", {
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
});
