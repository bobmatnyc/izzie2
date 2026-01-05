-- Add proxy authorization tables for POC-4
-- Allows AI to act on behalf of users with explicit consent

-- Proxy authorizations table
CREATE TABLE IF NOT EXISTS "proxy_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action_class" text NOT NULL,
	"action_type" text NOT NULL,
	"scope" text NOT NULL CHECK (scope IN ('single', 'session', 'standing', 'conditional')),
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"conditions" jsonb,
	"grant_method" text NOT NULL CHECK (grant_method IN ('explicit_consent', 'implicit_learning', 'bulk_grant')),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Proxy audit log table
CREATE TABLE IF NOT EXISTS "proxy_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"authorization_id" uuid,
	"action" text NOT NULL,
	"action_class" text NOT NULL,
	"mode" text NOT NULL CHECK (mode IN ('assistant', 'proxy')),
	"persona" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"model_used" text,
	"confidence" integer CHECK (confidence >= 0 AND confidence <= 100),
	"tokens_used" integer,
	"latency_ms" integer,
	"success" boolean NOT NULL,
	"error" text,
	"user_confirmed" boolean DEFAULT false,
	"confirmed_at" timestamp,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Authorization templates table
CREATE TABLE IF NOT EXISTS "authorization_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL UNIQUE,
	"description" text,
	"authorizations" jsonb,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- User authorization preferences table
CREATE TABLE IF NOT EXISTS "user_authorization_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true,
	"activated_at" timestamp DEFAULT now() NOT NULL,
	"deactivated_at" timestamp
);
--> statement-breakpoint
-- Add foreign key constraints
ALTER TABLE "proxy_authorizations" ADD CONSTRAINT "proxy_authorizations_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_audit_log" ADD CONSTRAINT "proxy_audit_log_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_audit_log" ADD CONSTRAINT "proxy_audit_log_authorization_id_proxy_authorizations_id_fk"
  FOREIGN KEY ("authorization_id") REFERENCES "public"."proxy_authorizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_authorization_preferences" ADD CONSTRAINT "user_auth_prefs_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_authorization_preferences" ADD CONSTRAINT "user_auth_prefs_template_id_templates_id_fk"
  FOREIGN KEY ("template_id") REFERENCES "public"."authorization_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "proxy_authorizations_user_id_idx" ON "proxy_authorizations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proxy_authorizations_action_class_idx" ON "proxy_authorizations" USING btree ("action_class");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proxy_authorizations_scope_idx" ON "proxy_authorizations" USING btree ("scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proxy_authorizations_active_idx" ON "proxy_authorizations" USING btree ("user_id", "action_class", "revoked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proxy_audit_log_user_id_idx" ON "proxy_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proxy_audit_log_action_idx" ON "proxy_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proxy_audit_log_timestamp_idx" ON "proxy_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proxy_audit_log_success_idx" ON "proxy_audit_log" USING btree ("success");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_auth_prefs_user_id_idx" ON "user_authorization_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_auth_prefs_template_id_idx" ON "user_authorization_preferences" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_auth_prefs_unique" ON "user_authorization_preferences" USING btree ("user_id", "template_id");--> statement-breakpoint
-- Create triggers for automatic updated_at updates
CREATE TRIGGER update_proxy_authorizations_updated_at BEFORE UPDATE ON proxy_authorizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();--> statement-breakpoint
CREATE TRIGGER update_authorization_templates_updated_at BEFORE UPDATE ON authorization_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();--> statement-breakpoint
-- Insert default authorization templates
INSERT INTO authorization_templates (name, description, authorizations, is_default) VALUES
('work_assistant', 'Standard work assistant permissions', '[
  {"actionClass": "send_email", "scope": "standing", "conditions": {"maxActionsPerDay": 10, "allowedHours": {"start": 9, "end": 17}}},
  {"actionClass": "create_calendar_event", "scope": "standing", "conditions": {"maxActionsPerDay": 5}},
  {"actionClass": "create_github_issue", "scope": "conditional", "conditions": {"requireConfidenceThreshold": 0.9}}
]'::jsonb, true),
('personal_basic', 'Basic personal assistant permissions', '[
  {"actionClass": "send_email", "scope": "conditional", "conditions": {"maxActionsPerDay": 5, "requireConfidenceThreshold": 0.95}},
  {"actionClass": "create_calendar_event", "scope": "standing", "conditions": {"allowedCalendars": ["primary"]}}
]'::jsonb, false),
('full_access', 'Full proxy access (use with caution)', '[
  {"actionClass": "send_email", "scope": "standing"},
  {"actionClass": "create_calendar_event", "scope": "standing"},
  {"actionClass": "create_github_issue", "scope": "standing"},
  {"actionClass": "post_slack_message", "scope": "standing"}
]'::jsonb, false);
