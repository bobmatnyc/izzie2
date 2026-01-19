/**
 * Chat Session Storage
 *
 * Database persistence for chat sessions using Drizzle ORM.
 * Handles serialization/deserialization of session data.
 */

import { dbClient } from '@/lib/db';
import { chatSessions, type ChatSessionRecord } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { ChatSession, ChatMessage, CurrentTask } from './types';

const LOG_PREFIX = '[SessionStorage]';

// Get drizzle instance lazily (for build compatibility)
function getDb() {
  return dbClient.getDb();
}

/**
 * Convert database record to ChatSession type
 */
function recordToSession(record: ChatSessionRecord): ChatSession {
  return {
    id: record.id,
    userId: record.userId,
    title: record.title || undefined,
    currentTask: record.currentTask
      ? {
          goal: record.currentTask.goal,
          context: record.currentTask.context,
          blockers: record.currentTask.blockers,
          progress: record.currentTask.progress,
          nextSteps: record.currentTask.nextSteps,
          updatedAt: new Date(record.currentTask.updatedAt),
        }
      : null,
    compressedHistory: record.compressedHistory || null,
    recentMessages: (record.recentMessages || []).map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp),
      metadata: msg.metadata,
    })),
    archivedMessages: record.archivedMessages
      ? record.archivedMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          metadata: msg.metadata,
        }))
      : undefined,
    messageCount: record.messageCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Convert ChatSession to database record format
 */
function sessionToRecord(session: ChatSession): Partial<ChatSessionRecord> {
  return {
    id: session.id,
    userId: session.userId,
    title: session.title || null,
    currentTask: session.currentTask
      ? {
          goal: session.currentTask.goal,
          context: session.currentTask.context,
          blockers: session.currentTask.blockers,
          progress: session.currentTask.progress,
          nextSteps: session.currentTask.nextSteps,
          updatedAt: session.currentTask.updatedAt.toISOString(),
        }
      : null,
    compressedHistory: session.compressedHistory || null,
    recentMessages: session.recentMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp.toISOString(),
      metadata: msg.metadata,
    })),
    archivedMessages: session.archivedMessages
      ? session.archivedMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp.toISOString(),
          metadata: msg.metadata,
        }))
      : undefined,
    messageCount: session.messageCount,
    updatedAt: new Date(),
  };
}

/**
 * Session storage class
 */
export class SessionStorage {
  /**
   * Create a new chat session
   */
  async createSession(userId: string, title?: string): Promise<ChatSession> {
    console.log(`${LOG_PREFIX} Creating new session for user ${userId}...`);

    const [record] = await getDb()
      .insert(chatSessions)
      .values({
        userId,
        title: title || null,
        currentTask: null,
        compressedHistory: null,
        recentMessages: [],
        messageCount: 0,
      })
      .returning();

    const session = recordToSession(record);
    console.log(`${LOG_PREFIX} Created session ${session.id}`);

    return session;
  }

  /**
   * Get a specific session by ID
   */
  async getSession(sessionId: string): Promise<ChatSession | null> {
    console.log(`${LOG_PREFIX} Fetching session ${sessionId}...`);

    const [record] = await getDb()
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    if (!record) {
      console.log(`${LOG_PREFIX} Session ${sessionId} not found`);
      return null;
    }

    return recordToSession(record);
  }

  /**
   * Get user's sessions (most recent first)
   */
  async getUserSessions(userId: string, limit = 20): Promise<ChatSession[]> {
    console.log(`${LOG_PREFIX} Fetching sessions for user ${userId} (limit: ${limit})...`);

    const records = await getDb()
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userId, userId))
      .orderBy(desc(chatSessions.updatedAt))
      .limit(limit);

    console.log(`${LOG_PREFIX} Found ${records.length} sessions for user ${userId}`);

    return records.map(recordToSession);
  }

  /**
   * Update an existing session
   */
  async updateSession(session: ChatSession): Promise<void> {
    console.log(`${LOG_PREFIX} Updating session ${session.id}...`);

    const updateData = sessionToRecord(session);

    await getDb()
      .update(chatSessions)
      .set(updateData)
      .where(eq(chatSessions.id, session.id));

    console.log(`${LOG_PREFIX} Updated session ${session.id}`);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    console.log(`${LOG_PREFIX} Deleting session ${sessionId}...`);

    await getDb().delete(chatSessions).where(eq(chatSessions.id, sessionId));

    console.log(`${LOG_PREFIX} Deleted session ${sessionId}`);
  }

  /**
   * Check if session belongs to user (for authorization)
   */
  async sessionBelongsToUser(sessionId: string, userId: string): Promise<boolean> {
    const [record] = await getDb()
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
      .limit(1);

    return !!record;
  }

  /**
   * Get or create session (convenience method)
   */
  async getOrCreateSession(
    userId: string,
    sessionId?: string
  ): Promise<ChatSession> {
    if (sessionId) {
      const session = await this.getSession(sessionId);
      if (session && session.userId === userId) {
        return session;
      }
      // If session not found or doesn't belong to user, create new one
      console.log(
        `${LOG_PREFIX} Session ${sessionId} not found or unauthorized, creating new one`
      );
    }

    return this.createSession(userId);
  }
}

/**
 * Singleton instance
 */
let storageInstance: SessionStorage | null = null;

export function getSessionStorage(): SessionStorage {
  if (!storageInstance) {
    storageInstance = new SessionStorage();
  }
  return storageInstance;
}
