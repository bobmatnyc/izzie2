CREATE TABLE "authorization_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"authorizations" jsonb,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "authorization_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "consent_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"authorization_id" uuid NOT NULL,
	"change_type" text NOT NULL,
	"previous_state" jsonb,
	"new_state" jsonb,
	"changed_by" text,
	"reason" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proxy_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"authorization_id" uuid,
	"action" text NOT NULL,
	"action_class" text NOT NULL,
	"mode" text NOT NULL,
	"persona" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"model_used" text,
	"confidence" integer,
	"tokens_used" integer,
	"latency_ms" integer,
	"success" boolean NOT NULL,
	"error" text,
	"user_confirmed" boolean DEFAULT false,
	"confirmed_at" timestamp,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proxy_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action_class" text NOT NULL,
	"action_type" text NOT NULL,
	"scope" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"conditions" jsonb,
	"grant_method" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proxy_rollbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"strategy" text NOT NULL,
	"status" text NOT NULL,
	"rollback_data" jsonb,
	"error_message" text,
	"completed_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_authorization_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true,
	"activated_at" timestamp DEFAULT now() NOT NULL,
	"deactivated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_history" ADD CONSTRAINT "consent_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_history" ADD CONSTRAINT "consent_history_authorization_id_proxy_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."proxy_authorizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_audit_log" ADD CONSTRAINT "proxy_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_audit_log" ADD CONSTRAINT "proxy_audit_log_authorization_id_proxy_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."proxy_authorizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_authorizations" ADD CONSTRAINT "proxy_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_rollbacks" ADD CONSTRAINT "proxy_rollbacks_audit_entry_id_proxy_audit_log_id_fk" FOREIGN KEY ("audit_entry_id") REFERENCES "public"."proxy_audit_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_rollbacks" ADD CONSTRAINT "proxy_rollbacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_authorization_preferences" ADD CONSTRAINT "user_authorization_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_authorization_preferences" ADD CONSTRAINT "user_authorization_preferences_template_id_authorization_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."authorization_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_history_user_id_idx" ON "consent_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consent_history_auth_id_idx" ON "consent_history" USING btree ("authorization_id");--> statement-breakpoint
CREATE INDEX "consent_history_timestamp_idx" ON "consent_history" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "consent_history_change_type_idx" ON "consent_history" USING btree ("change_type");--> statement-breakpoint
CREATE INDEX "proxy_audit_log_user_id_idx" ON "proxy_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "proxy_audit_log_action_idx" ON "proxy_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "proxy_audit_log_timestamp_idx" ON "proxy_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "proxy_audit_log_success_idx" ON "proxy_audit_log" USING btree ("success");--> statement-breakpoint
CREATE INDEX "proxy_authorizations_user_id_idx" ON "proxy_authorizations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "proxy_authorizations_action_class_idx" ON "proxy_authorizations" USING btree ("action_class");--> statement-breakpoint
CREATE INDEX "proxy_authorizations_scope_idx" ON "proxy_authorizations" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "proxy_authorizations_active_idx" ON "proxy_authorizations" USING btree ("user_id","action_class","revoked_at");--> statement-breakpoint
CREATE INDEX "proxy_rollbacks_audit_entry_idx" ON "proxy_rollbacks" USING btree ("audit_entry_id");--> statement-breakpoint
CREATE INDEX "proxy_rollbacks_user_id_idx" ON "proxy_rollbacks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "proxy_rollbacks_status_idx" ON "proxy_rollbacks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "proxy_rollbacks_expires_at_idx" ON "proxy_rollbacks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_auth_prefs_user_id_idx" ON "user_authorization_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_auth_prefs_template_id_idx" ON "user_authorization_preferences" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "user_auth_prefs_unique" ON "user_authorization_preferences" USING btree ("user_id","template_id");
