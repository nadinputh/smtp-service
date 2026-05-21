CREATE TABLE IF NOT EXISTS "inbox_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbox_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT 'indigo',
	"conditions" jsonb NOT NULL,
	"logic" varchar(3) DEFAULT 'AND' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_rules" ADD CONSTRAINT "inbox_rules_inbox_id_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inboxes"("id") ON DELETE CASCADE ON UPDATE no action;
