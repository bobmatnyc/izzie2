/**
 * Poll State Management
 * Tracks last poll timestamps per user for incremental polling
 */

import { dbClient } from '@/lib/db';
import { sql } from 'drizzle-orm';

const LOG_PREFIX = '[PollState]';

// In-memory fallback for when DB is unavailable
const memoryState: Map<string, Date> = new Map();

/**
 * Get last poll timestamp for a user
 */
export async function getLastPollTime(
  userId: string,
  pollType: 'email' | 'calendar'
): Promise<Date | null> {
  try {
    const db = dbClient.getDb();

    // Try to get from user preferences table (if it has this column)
    // For now, use in-memory state with localStorage-style key
    const key = `${userId}:${pollType}`;

    // Check memory first
    if (memoryState.has(key)) {
      return memoryState.get(key) || null;
    }

    // Try database (using raw SQL for flexibility)
    const result = await db.execute(
      sql`SELECT value FROM poll_state WHERE user_id = ${userId} AND poll_type = ${pollType}`
    );

    if (result.rows && result.rows.length > 0) {
      const timestamp = (result.rows[0] as { value: string }).value;
      return new Date(timestamp);
    }

    return null;
  } catch (error) {
    // Table might not exist, return memory state
    const key = `${userId}:${pollType}`;
    return memoryState.get(key) || null;
  }
}

/**
 * Update last poll timestamp for a user
 */
export async function updateLastPollTime(
  userId: string,
  pollType: 'email' | 'calendar',
  timestamp: Date = new Date()
): Promise<void> {
  const key = `${userId}:${pollType}`;

  // Always update memory
  memoryState.set(key, timestamp);

  try {
    const db = dbClient.getDb();

    // Upsert into poll_state table
    await db.execute(
      sql`INSERT INTO poll_state (user_id, poll_type, value, updated_at)
          VALUES (${userId}, ${pollType}, ${timestamp.toISOString()}, NOW())
          ON CONFLICT (user_id, poll_type)
          DO UPDATE SET value = ${timestamp.toISOString()}, updated_at = NOW()`
    );

    console.log(`${LOG_PREFIX} Updated ${pollType} poll time for ${userId}`);
  } catch (error) {
    // Table might not exist, memory state is sufficient for now
    console.log(`${LOG_PREFIX} Using memory state for ${userId}:${pollType}`);
  }
}

/**
 * Initialize poll state table (run on app startup)
 */
export async function initPollStateTable(): Promise<void> {
  try {
    const db = dbClient.getDb();

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS poll_state (
        user_id TEXT NOT NULL,
        poll_type TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, poll_type)
      )
    `);

    console.log(`${LOG_PREFIX} Poll state table initialized`);
  } catch (error) {
    console.log(`${LOG_PREFIX} Could not create poll_state table (might already exist)`);
  }
}
