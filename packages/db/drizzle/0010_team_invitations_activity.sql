-- Phase B: Team invitations & activity log

-- 1. Create team_activity_log table
CREATE TABLE IF NOT EXISTS "team_activity_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "actor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "action" varchar(50) NOT NULL,
  "meta" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "team_activity_log_team_idx"
  ON "team_activity_log" ("team_id", "created_at" DESC);

-- 2. Create team_invitations table
CREATE TABLE IF NOT EXISTS "team_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "role" varchar(20) NOT NULL DEFAULT 'member',
  "token" varchar(64) NOT NULL UNIQUE,
  "invited_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "team_invitations_email_idx"
  ON "team_invitations" ("email");

CREATE INDEX IF NOT EXISTS "team_invitations_token_idx"
  ON "team_invitations" ("token");
