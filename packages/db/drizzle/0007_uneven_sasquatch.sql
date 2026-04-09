CREATE TABLE "user_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"monthly_send_limit" integer DEFAULT 1000 NOT NULL,
	"max_inboxes" integer DEFAULT 10 NOT NULL,
	"max_messages_per_inbox" integer DEFAULT 5000 NOT NULL,
	"current_monthly_sent" integer DEFAULT 0 NOT NULL,
	"quota_reset_at" timestamp with time zone,
	CONSTRAINT "user_quotas_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_quotas" ADD CONSTRAINT "user_quotas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;