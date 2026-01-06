-- Initial Migration: Create tables and enable pgvector extension
-- Generated for Neon Postgres with pgvector support

-- Enable pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for conversations
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations(created_at);

-- Create memory_entries table with vector column
CREATE TABLE IF NOT EXISTS memory_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    summary TEXT,
    metadata JSONB,
    embedding vector(1536), -- 1536 dimensions for text-embedding-3-small
    importance INTEGER DEFAULT 5,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create standard indexes for memory_entries
CREATE INDEX IF NOT EXISTS memory_entries_user_id_idx ON memory_entries(user_id);
CREATE INDEX IF NOT EXISTS memory_entries_conversation_id_idx ON memory_entries(conversation_id);
CREATE INDEX IF NOT EXISTS memory_entries_created_at_idx ON memory_entries(created_at);
CREATE INDEX IF NOT EXISTS memory_entries_importance_idx ON memory_entries(importance);

-- Create vector similarity search index using IVFFlat
-- IVFFlat (Inverted File with Flat compression) is faster than exact search
-- Lists parameter should be approximately sqrt(total_rows)
-- Starting with 100 lists, can be adjusted based on data size
--
-- vector_cosine_ops: Uses cosine distance for similarity (1 - cosine_similarity)
-- This is optimal for normalized embeddings like OpenAI's
CREATE INDEX IF NOT EXISTS memory_entries_embedding_idx
ON memory_entries
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic updated_at updates
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memory_entries_updated_at BEFORE UPDATE ON memory_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE users IS 'User accounts for session context';
COMMENT ON TABLE conversations IS 'Conversation sessions';
COMMENT ON TABLE memory_entries IS 'Memory entries with vector embeddings for semantic search';
COMMENT ON COLUMN memory_entries.embedding IS 'Vector embedding (1536 dimensions, text-embedding-3-small)';
COMMENT ON COLUMN memory_entries.importance IS 'Importance score (1-10 scale)';
COMMENT ON INDEX memory_entries_embedding_idx IS 'IVFFlat index for fast vector similarity search using cosine distance';
