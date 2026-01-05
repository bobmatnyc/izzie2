-- Migration: Add Consent History and Rollback tables for POC-4 Phase 2
-- Created: 2026-01-05
-- Description: Adds consent_history table for tracking consent changes and
--              proxy_rollbacks table for rollback operations

-- Consent History Table
-- Tracks all changes to user authorizations (grants, modifications, revocations)
CREATE TABLE IF NOT EXISTS "consent_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "authorization_id" uuid NOT NULL REFERENCES "proxy_authorizations"("id") ON DELETE CASCADE,
  "change_type" text NOT NULL, -- 'granted', 'modified', 'revoked', 'expired'
  "previous_state" jsonb,
  "new_state" jsonb,
  "changed_by" text, -- 'user', 'system', 'admin'
  "reason" text,
  "timestamp" timestamp DEFAULT now() NOT NULL
);

-- Indexes for consent_history
CREATE INDEX IF NOT EXISTS "consent_history_user_id_idx" ON "consent_history" ("user_id");
CREATE INDEX IF NOT EXISTS "consent_history_auth_id_idx" ON "consent_history" ("authorization_id");
CREATE INDEX IF NOT EXISTS "consent_history_timestamp_idx" ON "consent_history" ("timestamp");
CREATE INDEX IF NOT EXISTS "consent_history_change_type_idx" ON "consent_history" ("change_type");

-- Proxy Rollbacks Table
-- Tracks rollback operations for proxy actions
CREATE TABLE IF NOT EXISTS "proxy_rollbacks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "audit_entry_id" uuid NOT NULL REFERENCES "proxy_audit_log"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "strategy" text NOT NULL, -- 'direct_undo', 'compensating', 'manual', 'not_supported'
  "status" text NOT NULL, -- 'pending', 'in_progress', 'completed', 'failed'
  "rollback_data" jsonb, -- Captured state for rollback
  "error_message" text,
  "completed_at" timestamp,
  "expires_at" timestamp NOT NULL, -- Rollback window TTL (default 24h)
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for proxy_rollbacks
CREATE INDEX IF NOT EXISTS "proxy_rollbacks_audit_entry_idx" ON "proxy_rollbacks" ("audit_entry_id");
CREATE INDEX IF NOT EXISTS "proxy_rollbacks_user_id_idx" ON "proxy_rollbacks" ("user_id");
CREATE INDEX IF NOT EXISTS "proxy_rollbacks_status_idx" ON "proxy_rollbacks" ("status");
CREATE INDEX IF NOT EXISTS "proxy_rollbacks_expires_at_idx" ON "proxy_rollbacks" ("expires_at");

-- Comments for documentation
COMMENT ON TABLE "consent_history" IS 'Audit trail of all consent changes (POC-4 Phase 2)';
COMMENT ON TABLE "proxy_rollbacks" IS 'Rollback operations for proxy actions (POC-4 Phase 2)';

COMMENT ON COLUMN "consent_history"."change_type" IS 'Type of change: granted, modified, revoked, expired';
COMMENT ON COLUMN "consent_history"."previous_state" IS 'Authorization state before change (JSONB)';
COMMENT ON COLUMN "consent_history"."new_state" IS 'Authorization state after change (JSONB)';

COMMENT ON COLUMN "proxy_rollbacks"."strategy" IS 'Rollback strategy: direct_undo, compensating, manual, not_supported';
COMMENT ON COLUMN "proxy_rollbacks"."status" IS 'Rollback status: pending, in_progress, completed, failed';
COMMENT ON COLUMN "proxy_rollbacks"."rollback_data" IS 'Captured state and undo actions (JSONB)';
COMMENT ON COLUMN "proxy_rollbacks"."expires_at" IS 'Rollback window expiration (default 24h from action)';
