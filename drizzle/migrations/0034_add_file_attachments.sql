-- Migration: 0034_add_file_attachments.sql
-- Bidirectional file attachments for Google Drive <-> Telegram
--
-- Supports both inbound (Telegram -> Drive) and outbound (Drive -> Telegram) file transfers
-- Tracks file metadata, transfer status, and links to chat sessions
--
-- Related tickets: File Attachments Feature

-- Create file_attachments table
CREATE TABLE IF NOT EXISTS "file_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "direction" text NOT NULL, -- 'inbound' | 'outbound'
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" integer NOT NULL,
  "drive_file_id" text,
  "telegram_file_id" text,
  "telegram_chat_id" bigint,
  "telegram_message_id" integer,
  "chat_session_id" uuid REFERENCES "chat_sessions"("id"),
  "status" text NOT NULL, -- 'pending' | 'processing' | 'completed' | 'failed'
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "metadata" jsonb
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS "file_attachments_user_id_idx" ON "file_attachments" ("user_id");
CREATE INDEX IF NOT EXISTS "file_attachments_direction_idx" ON "file_attachments" ("direction");
CREATE INDEX IF NOT EXISTS "file_attachments_status_idx" ON "file_attachments" ("status");
CREATE INDEX IF NOT EXISTS "file_attachments_chat_session_id_idx" ON "file_attachments" ("chat_session_id");
CREATE INDEX IF NOT EXISTS "file_attachments_drive_file_id_idx" ON "file_attachments" ("drive_file_id");
CREATE INDEX IF NOT EXISTS "file_attachments_telegram_file_id_idx" ON "file_attachments" ("telegram_file_id");
CREATE INDEX IF NOT EXISTS "file_attachments_created_at_idx" ON "file_attachments" ("created_at");

-- Add column comments for documentation
COMMENT ON COLUMN "file_attachments"."direction" IS 'Transfer direction: inbound (Telegram -> Drive) or outbound (Drive -> Telegram)';
COMMENT ON COLUMN "file_attachments"."status" IS 'Transfer status: pending | processing | completed | failed';
COMMENT ON COLUMN "file_attachments"."file_size" IS 'File size in bytes (max 50MB for Telegram outbound, 100MB for Drive uploads)';
COMMENT ON COLUMN "file_attachments"."drive_file_id" IS 'Google Drive file ID (if file is in Drive)';
COMMENT ON COLUMN "file_attachments"."telegram_file_id" IS 'Telegram file_id returned by sendDocument (if file was sent to Telegram)';
COMMENT ON COLUMN "file_attachments"."telegram_chat_id" IS 'Telegram chat ID where file was sent/received';
COMMENT ON COLUMN "file_attachments"."telegram_message_id" IS 'Telegram message ID containing the file';
COMMENT ON COLUMN "file_attachments"."chat_session_id" IS 'Optional link to chat session if file was sent during chat';
COMMENT ON COLUMN "file_attachments"."metadata" IS 'Additional metadata (original filename, user notes, etc.)';

SELECT 'Migration 0034: Added file_attachments table for bidirectional file transfers' AS status;
