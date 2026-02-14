-- Migration: Add file_attachments table for bidirectional file transfers
-- Created: 2026-02-14
-- Description: Tracks file transfers between Telegram and Google Drive

CREATE TABLE IF NOT EXISTS file_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Transfer direction
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),

  -- File metadata
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,

  -- Google Drive references
  drive_file_id TEXT,
  drive_folder_id TEXT,
  drive_web_view_link TEXT,

  -- Telegram references
  telegram_file_id TEXT,
  telegram_chat_id BIGINT,
  telegram_message_id INTEGER,

  -- Session linking (optional)
  chat_session_id UUID REFERENCES chat_sessions(id),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,

  -- Additional metadata
  metadata JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS file_attachments_user_id_idx ON file_attachments(user_id);
CREATE INDEX IF NOT EXISTS file_attachments_direction_idx ON file_attachments(direction);
CREATE INDEX IF NOT EXISTS file_attachments_status_idx ON file_attachments(status);
CREATE INDEX IF NOT EXISTS file_attachments_chat_session_id_idx ON file_attachments(chat_session_id);
CREATE INDEX IF NOT EXISTS file_attachments_telegram_chat_id_idx ON file_attachments(telegram_chat_id);
CREATE INDEX IF NOT EXISTS file_attachments_telegram_file_id_idx ON file_attachments(telegram_file_id);
CREATE INDEX IF NOT EXISTS file_attachments_drive_file_id_idx ON file_attachments(drive_file_id);
CREATE INDEX IF NOT EXISTS file_attachments_created_at_idx ON file_attachments(created_at);
