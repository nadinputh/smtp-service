ALTER TABLE "messages" ADD COLUMN "spam_score" real;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "spam_rules" jsonb;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "on_received" boolean DEFAULT true NOT NULL;