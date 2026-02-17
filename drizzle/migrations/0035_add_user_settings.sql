-- Migration: 0035_add_user_settings.sql
-- BYOK (Bring Your Own Key) user settings table
--
-- Stores per-user encrypted API keys and budget configurations
-- Part of the BYOK feature allowing users to use their own OpenRouter API keys
--
-- Related tickets: #118 - Implement BYOK Support

-- Create user_settings table
CREATE TABLE IF NOT EXISTS "user_settings" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,

  -- Encrypted API key (AES-256-GCM)
  "encrypted_api_key" text,
  "api_key_iv" text,
  "api_key_tag" text,
  "api_key_salt" text,
  "api_key_last_four" text,

  -- Budget settings
  "daily_budget_cents" integer,
  "budget_reset_hour" integer DEFAULT 0,
  "timezone" text DEFAULT 'UTC',

  -- Timestamps
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "user_settings_user_id_idx" ON "user_settings" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_settings_user_id_unique" ON "user_settings" ("user_id");

-- Add column comments for documentation
COMMENT ON TABLE "user_settings" IS 'Per-user settings including encrypted API keys for BYOK feature';
COMMENT ON COLUMN "user_settings"."encrypted_api_key" IS 'AES-256-GCM encrypted OpenRouter API key (base64)';
COMMENT ON COLUMN "user_settings"."api_key_iv" IS 'Initialization vector for AES-GCM encryption (base64)';
COMMENT ON COLUMN "user_settings"."api_key_tag" IS 'Authentication tag for AES-GCM encryption (base64)';
COMMENT ON COLUMN "user_settings"."api_key_salt" IS 'Salt used for key derivation with Argon2id (base64)';
COMMENT ON COLUMN "user_settings"."api_key_last_four" IS 'Last 4 characters of API key for display (e.g., "...1234")';
COMMENT ON COLUMN "user_settings"."daily_budget_cents" IS 'Daily spending limit in cents (null = unlimited)';
COMMENT ON COLUMN "user_settings"."budget_reset_hour" IS 'Hour of day (0-23) when budget resets, in user timezone';
COMMENT ON COLUMN "user_settings"."timezone" IS 'User timezone for budget reset (IANA format, e.g., "America/New_York")';

SELECT 'Migration 0035: Added user_settings table for BYOK feature' AS status;
