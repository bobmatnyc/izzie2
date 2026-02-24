/**
 * Conversation Search Module
 *
 * Provides semantic search and retrieval over chat conversation history.
 * Enables Izzie to recall past conversations and find relevant context.
 */

import { dbClient } from '@/lib/db';
import {
  chatMessages,
  chatSessions,
  type ChatMessageRecord,
} from '@/lib/db/schema';
import { embeddingService } from '@/lib/embeddings';
import { eq, and, desc, sql, gte } from 'drizzle-orm';

const LOG_PREFIX = '[ConversationSearch]';

/**
 * Search result with similarity score
 */
export interface ConversationSearchResult {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  similarity: number;
  sessionTitle?: string;
}

/**
 * Conversation history entry
 */
export interface ConversationHistoryEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Recent conversation summary
 */
export interface RecentConversation {
  sessionId: string;
  title: string | null;
  lastMessageAt: Date;
  messageCount: number;
  preview: string;
}

// Get drizzle instance lazily (for build compatibility)
function getDb() {
  return dbClient.getDb();
}

// Security: Input validation functions
function validateSearchUserId(userId: string): string {
  if (!userId || typeof userId !== 'string' || userId.length > 100 || /[<>'"\\]/.test(userId)) {
    throw new Error('Invalid user ID format for search');
  }
  return userId;
}

function validateSearchLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Search limit must be an integer between 1 and 100');
  }
  return limit;
}

function validateEmbeddingVector(embedding: number[]): number[] {
  if (!Array.isArray(embedding) || embedding.length === 0 || embedding.length > 2048) {
    throw new Error('Invalid embedding vector length');
  }
  if (embedding.some(n => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new Error('Embedding vector contains invalid numbers');
  }
  return embedding;
}

/**
 * Search conversations using semantic similarity
 *
 * @param userId - User ID to search conversations for
 * @param query - Natural language search query
 * @param limit - Maximum number of results to return (default: 10)
 * @returns Array of search results with similarity scores
 */
export async function searchConversations(
  userId: string,
  query: string,
  limit: number = 10
): Promise<ConversationSearchResult[]> {
  console.log(`${LOG_PREFIX} Searching conversations for user ${userId}: "${query.substring(0, 50)}..."`);

  try {
    // Security: Validate all inputs
    const safeUserId = validateSearchUserId(userId);
    const safeLimit = validateSearchLimit(limit);

    // Generate embedding for the search query
    const queryEmbedding = await embeddingService.generateEmbeddingWithFallback(query);
    const safeEmbedding = validateEmbeddingVector(queryEmbedding);

    // Security: Use parameterized queries to prevent SQL injection
    // Convert embedding to safe string representation
    const embeddingStr = `[${safeEmbedding.join(',')}]`;

    // Perform vector similarity search using pgvector
    // Using cosine distance (1 - cosine_similarity)
    const results = await getDb().execute<{
      id: string;
      session_id: string;
      role: string;
      content: string;
      created_at: Date;
      similarity: number;
      session_title: string | null;
    }>(sql`
      SELECT
        cm.id,
        cm.session_id,
        cm.role,
        cm.content,
        cm.created_at,
        1 - (cm.embedding <=> ${embeddingStr}::vector) as similarity,
        cs.title as session_title
      FROM chat_messages cm
      LEFT JOIN chat_sessions cs ON cm.session_id = cs.id
      WHERE cm.user_id = ${safeUserId}
        AND cm.embedding IS NOT NULL
      ORDER BY cm.embedding <=> ${embeddingStr}::vector
      LIMIT ${safeLimit}
    `);

    console.log(`${LOG_PREFIX} Found ${results.rows.length} results`);

    return results.rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      createdAt: row.created_at,
      similarity: row.similarity,
      sessionTitle: row.session_title || undefined,
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Search failed:`, error);
    throw error;
  }
}

/**
 * Get full conversation history for a session
 *
 * @param sessionId - Session ID to get history for
 * @param userId - User ID for authorization
 * @param limit - Maximum number of messages to return (default: 100)
 * @returns Array of conversation history entries
 */
export async function getConversationHistory(
  sessionId: string,
  userId: string,
  limit: number = 100
): Promise<ConversationHistoryEntry[]> {
  console.log(`${LOG_PREFIX} Getting conversation history for session ${sessionId}`);

  try {
    const messages = await getDb()
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
        metadata: chatMessages.metadata,
      })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.sessionId, sessionId),
          eq(chatMessages.userId, userId)
        )
      )
      .orderBy(chatMessages.createdAt)
      .limit(limit);

    console.log(`${LOG_PREFIX} Found ${messages.length} messages in session ${sessionId}`);

    return messages.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      createdAt: msg.createdAt,
      metadata: msg.metadata || undefined,
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get conversation history:`, error);
    throw error;
  }
}

// Security: Additional validation functions
function validateDaysBack(daysBack: number): number {
  if (!Number.isInteger(daysBack) || daysBack < 1 || daysBack > 365) {
    throw new Error('Days back must be an integer between 1 and 365');
  }
  return daysBack;
}

/**
 * Get recent conversations for a user
 *
 * @param userId - User ID to get conversations for
 * @param limit - Maximum number of conversations to return (default: 10)
 * @param daysBack - How many days back to look (default: 30)
 * @returns Array of recent conversation summaries
 */
export async function getRecentConversations(
  userId: string,
  limit: number = 10,
  daysBack: number = 30
): Promise<RecentConversation[]> {
  console.log(`${LOG_PREFIX} Getting recent conversations for user ${userId}`);

  try {
    // Security: Validate all inputs
    const safeUserId = validateSearchUserId(userId);
    const safeLimit = validateSearchLimit(limit);
    const safeDaysBack = validateDaysBack(daysBack);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - safeDaysBack);

    // Get recent sessions with message count and last message
    // Security: Use validated inputs directly since they're now safe
    const results = await getDb().execute<{
      session_id: string;
      title: string | null;
      last_message_at: Date;
      message_count: number;
      preview: string;
    }>(sql`
      SELECT
        cs.id as session_id,
        cs.title,
        MAX(cm.created_at) as last_message_at,
        COUNT(cm.id)::int as message_count,
        (
          SELECT content
          FROM chat_messages
          WHERE session_id = cs.id
          ORDER BY created_at DESC
          LIMIT 1
        ) as preview
      FROM chat_sessions cs
      LEFT JOIN chat_messages cm ON cs.id = cm.session_id
      WHERE cs.user_id = ${safeUserId}
        AND cs.updated_at >= ${cutoffDate}
      GROUP BY cs.id, cs.title
      HAVING COUNT(cm.id) > 0
      ORDER BY MAX(cm.created_at) DESC
      LIMIT ${safeLimit}
    `);

    console.log(`${LOG_PREFIX} Found ${results.rows.length} recent conversations`);

    return results.rows.map((row) => ({
      sessionId: row.session_id,
      title: row.title,
      lastMessageAt: row.last_message_at,
      messageCount: row.message_count,
      preview: row.preview?.substring(0, 200) || '',
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get recent conversations:`, error);
    throw error;
  }
}

/**
 * Store a chat message with embedding generation
 *
 * @param sessionId - Session ID the message belongs to
 * @param userId - User ID who owns the message
 * @param role - Message role ('user' or 'assistant')
 * @param content - Message content
 * @param metadata - Optional metadata (tokens, model, etc.)
 * @returns The created message record
 */
export async function storeMessage(
  sessionId: string,
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata?: Record<string, unknown>
): Promise<ChatMessageRecord> {
  console.log(`${LOG_PREFIX} Storing ${role} message for session ${sessionId}`);

  try {
    // Generate embedding for the message content
    let embedding: number[] | null = null;
    try {
      embedding = await embeddingService.generateEmbeddingWithFallback(content);
      console.log(`${LOG_PREFIX} Generated embedding (${embedding.length} dimensions)`);
    } catch (embeddingError) {
      // Log but don't fail - embeddings can be backfilled later
      console.warn(`${LOG_PREFIX} Failed to generate embedding, storing without:`, embeddingError);
    }

    // Insert the message
    const [record] = await getDb()
      .insert(chatMessages)
      .values({
        sessionId,
        userId,
        role,
        content,
        embedding,
        metadata: metadata || null,
      })
      .returning();

    console.log(`${LOG_PREFIX} Stored message ${record.id}`);

    return record;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to store message:`, error);
    throw error;
  }
}

/**
 * Backfill embeddings for messages that don't have them
 * Useful for migrating existing data
 *
 * @param userId - User ID to backfill for
 * @param batchSize - Number of messages to process per batch (default: 50)
 * @returns Number of messages updated
 */
export async function backfillEmbeddings(
  userId: string,
  batchSize: number = 50
): Promise<number> {
  console.log(`${LOG_PREFIX} Backfilling embeddings for user ${userId}`);

  try {
    // Find messages without embeddings
    const messagesWithoutEmbeddings = await getDb()
      .select({
        id: chatMessages.id,
        content: chatMessages.content,
      })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.userId, userId),
          sql`${chatMessages.embedding} IS NULL`
        )
      )
      .limit(batchSize);

    if (messagesWithoutEmbeddings.length === 0) {
      console.log(`${LOG_PREFIX} No messages need embedding backfill`);
      return 0;
    }

    console.log(`${LOG_PREFIX} Backfilling ${messagesWithoutEmbeddings.length} messages`);

    let updated = 0;
    for (const msg of messagesWithoutEmbeddings) {
      try {
        const embedding = await embeddingService.generateEmbeddingWithFallback(msg.content);

        await getDb()
          .update(chatMessages)
          .set({ embedding })
          .where(eq(chatMessages.id, msg.id));

        updated++;
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to backfill message ${msg.id}:`, error);
        // Continue with other messages
      }
    }

    console.log(`${LOG_PREFIX} Backfilled ${updated} messages`);
    return updated;
  } catch (error) {
    console.error(`${LOG_PREFIX} Backfill failed:`, error);
    throw error;
  }
}
