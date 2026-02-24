-- Migration: Add discovery budget fields to user_settings table
-- Created: 2026-02-24
-- Purpose: Enable per-user discovery budget enforcement for email processing and entity extraction

-- Add discovery budget fields to user_settings table
ALTER TABLE "user_settings" ADD COLUMN "daily_discovery_budget_cents" integer DEFAULT 100;
ALTER TABLE "user_settings" ADD COLUMN "current_daily_discovery_spend_cents" integer DEFAULT 0;

-- Update comments for documentation
COMMENT ON COLUMN "user_settings"."daily_discovery_budget_cents" IS 'Discovery spending limit in cents (default $1/day)';
COMMENT ON COLUMN "user_settings"."current_daily_discovery_spend_cents" IS 'Current daily discovery spend tracked separately';

-- No indexes needed - discovery budget checks are infrequent
