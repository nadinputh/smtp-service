CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
-- Add column as nullable first
ALTER TABLE "inboxes" ADD COLUMN "user_id" uuid;--> statement-breakpoint
-- Create a system user for orphan inboxes
INSERT INTO "users" ("id", "email", "password_hash", "name")
VALUES ('00000000-0000-0000-0000-000000000000', 'system@localhost', '$2a$12$placeholder', 'System')
ON CONFLICT ("email") DO NOTHING;--> statement-breakpoint
-- Backfill existing inboxes
UPDATE "inboxes" SET "user_id" = '00000000-0000-0000-0000-000000000000' WHERE "user_id" IS NULL;--> statement-breakpoint
-- Now make it NOT NULL
ALTER TABLE "inboxes" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inboxes" ADD CONSTRAINT "inboxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;