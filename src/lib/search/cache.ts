/**
 * Search Result Cache
 * Caches search results and fetched content to database
 */

import { eq, and, lt } from 'drizzle-orm';
import {
  dbClient,
  researchSources,
  type ResearchSource,
  type NewResearchSource,
} from '../db';

// Get drizzle instance lazily (for build compatibility)
function getDb() {
  return dbClient.getDb();
}

// Default TTL values
const SEARCH_RESULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCHED_CONTENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get cached source by URL and task ID
 * Returns null if not found or expired
 */
export async function getCachedSource(
  url: string,
  taskId?: string
): Promise<ResearchSource | null> {
  try {
    const conditions = [eq(researchSources.url, url)];

    if (taskId) {
      conditions.push(eq(researchSources.taskId, taskId));
    }

    const [source] = await db
      .select()
      .from(researchSources)
      .where(and(...conditions))
      .orderBy(researchSources.createdAt)
      .limit(1);

    if (!source) {
      return null;
    }

    // Check if expired
    if (source.expiresAt && new Date() > source.expiresAt) {
      console.log(`[Cache] Source expired: ${url}`);
      return null;
    }

    console.log(`[Cache] Cache hit: ${url}`);
    return source;
  } catch (error) {
    console.error('[Cache] Error getting cached source:', error);
    return null;
  }
}

/**
 * Cache a source to database
 * Creates or updates existing source
 */
export async function cacheSource(
  source: Partial<NewResearchSource>
): Promise<ResearchSource> {
  try {
    // Ensure required fields are present
    if (!source.taskId || !source.url) {
      throw new Error('taskId and url are required for caching');
    }

    // Set default expiration if not provided
    const now = new Date();
    let expiresAt = source.expiresAt;

    if (!expiresAt) {
      // Use longer TTL if content is fetched, shorter for search results
      const ttl = source.content ? FETCHED_CONTENT_TTL_MS : SEARCH_RESULT_TTL_MS;
      expiresAt = new Date(now.getTime() + ttl);
    }

    // Check if source already exists
    const existing = await getCachedSource(source.url, source.taskId);

    if (existing) {
      // Update existing source
      const [updated] = await db
        .update(researchSources)
        .set({
          ...source,
          expiresAt,
        })
        .where(eq(researchSources.id, existing.id))
        .returning();

      console.log(`[Cache] Updated cached source: ${source.url}`);
      return updated;
    } else {
      // Insert new source
      const newSource: NewResearchSource = {
        taskId: source.taskId,
        url: source.url,
        title: source.title,
        content: source.content,
        contentType: source.contentType,
        relevanceScore: source.relevanceScore,
        credibilityScore: source.credibilityScore,
        fetchStatus: source.fetchStatus || 'pending',
        fetchError: source.fetchError,
        fetchedAt: source.fetchedAt,
        expiresAt,
      };

      const [created] = await getDb().insert(researchSources).values(newSource).returning();

      console.log(`[Cache] Cached new source: ${source.url}`);
      return created;
    }
  } catch (error) {
    console.error('[Cache] Error caching source:', error);
    throw error;
  }
}

/**
 * Prune expired cache entries
 * Returns number of entries deleted
 */
export async function pruneExpiredCache(): Promise<number> {
  try {
    const now = new Date();

    const deleted = await db
      .delete(researchSources)
      .where(lt(researchSources.expiresAt, now))
      .returning();

    const count = deleted.length;

    if (count > 0) {
      console.log(`[Cache] Pruned ${count} expired cache entries`);
    }

    return count;
  } catch (error) {
    console.error('[Cache] Error pruning cache:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(taskId?: string): Promise<{
  total: number;
  fetched: number;
  pending: number;
  failed: number;
  expired: number;
}> {
  try {
    const conditions = taskId ? [eq(researchSources.taskId, taskId)] : [];

    const sources = await db
      .select()
      .from(researchSources)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const now = new Date();
    const stats = {
      total: sources.length,
      fetched: 0,
      pending: 0,
      failed: 0,
      expired: 0,
    };

    for (const source of sources) {
      if (source.expiresAt && now > source.expiresAt) {
        stats.expired++;
      } else {
        switch (source.fetchStatus) {
          case 'fetched':
            stats.fetched++;
            break;
          case 'pending':
            stats.pending++;
            break;
          case 'failed':
            stats.failed++;
            break;
        }
      }
    }

    return stats;
  } catch (error) {
    console.error('[Cache] Error getting cache stats:', error);
    return {
      total: 0,
      fetched: 0,
      pending: 0,
      failed: 0,
      expired: 0,
    };
  }
}

/**
 * Clear all cache for a task
 */
export async function clearTaskCache(taskId: string): Promise<number> {
  try {
    const deleted = await db
      .delete(researchSources)
      .where(eq(researchSources.taskId, taskId))
      .returning();

    const count = deleted.length;
    console.log(`[Cache] Cleared ${count} cache entries for task ${taskId}`);
    return count;
  } catch (error) {
    console.error('[Cache] Error clearing task cache:', error);
    return 0;
  }
}
