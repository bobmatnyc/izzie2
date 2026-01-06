-- Migration: Fix accounts table schema for Better Auth
-- Replace single expires_at with accessTokenExpiresAt and refreshTokenExpiresAt

-- Rename expires_at to access_token_expires_at
ALTER TABLE "accounts" RENAME COLUMN "expires_at" TO "access_token_expires_at";

-- Add refresh_token_expires_at column
ALTER TABLE "accounts" ADD COLUMN "refresh_token_expires_at" timestamp;
