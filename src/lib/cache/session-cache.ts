/**
 * Session Cache Layer
 *
 * High-performance session caching with automatic invalidation
 * and fallback to database when cache misses occur.
 */

import { getCacheService } from './cache-service';
import { CacheKeys, InvalidationPatterns } from './cache-keys';
import { getSession, type AuthSession } from '@/lib/auth';
import { getSessionStorage, type ChatSession } from '@/lib/chat/session';

const LOG_PREFIX = '[SessionCache]';

// Cache TTLs in seconds
const SESSION_TTL = 5 * 60; // 5 minutes for auth sessions
const CHAT_SESSION_TTL = 30 * 60; // 30 minutes for chat sessions
const USER_SESSIONS_TTL = 10 * 60; // 10 minutes for session lists

/**
 * Cached session data
 */
export interface CachedSession {
  session: AuthSession;
  cachedAt: number;
}

/**
 * Session cache service
 */
export class SessionCacheService {
  private cacheService = getCacheService();

  /**
   * Get user session with caching
   */
  async getUserSession(request: Request): Promise<AuthSession | null> {
    try {
      // Extract session token/cookie for cache key
      const authorization = request.headers.get('authorization');
      const cookie = request.headers.get('cookie');
      const sessionKey = authorization || cookie || 'anonymous';

      const cacheKey = CacheKeys.auth.token(sessionKey);

      // Try cache first
      const cached = await this.cacheService.get<CachedSession>(cacheKey);
      if (cached && this.isSessionCacheValid(cached)) {
        console.log(`${LOG_PREFIX} Session cache hit`);
        return cached.session;
      }

      // Cache miss - get from auth service
      console.log(`${LOG_PREFIX} Session cache miss, fetching from auth`);
      const session = await getSession(request);

      if (session) {
        // Cache the session
        const cachedSession: CachedSession = {
          session,
          cachedAt: Date.now(),
        };
        await this.cacheService.set(cacheKey, cachedSession, SESSION_TTL);
        console.log(`${LOG_PREFIX} Cached session for user ${session.user.id}`);
      }

      return session;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting user session:`, error);
      // Fallback to direct auth call
      return getSession(request);
    }
  }

  /**
   * Get chat session with caching
   */
  async getChatSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const cacheKey = CacheKeys.session.sessionData(sessionId);

      // Try cache first
      const cached = await this.cacheService.get<ChatSession>(cacheKey);
      if (cached) {
        console.log(`${LOG_PREFIX} Chat session cache hit: ${sessionId}`);
        return cached;
      }

      // Cache miss - get from database
      console.log(`${LOG_PREFIX} Chat session cache miss: ${sessionId}`);
      const storage = getSessionStorage();
      const session = await storage.getSession(sessionId);

      if (session) {
        // Cache the session
        await this.cacheService.set(cacheKey, session, CHAT_SESSION_TTL);
        console.log(`${LOG_PREFIX} Cached chat session: ${sessionId}`);
      }

      return session;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting chat session ${sessionId}:`, error);
      // Fallback to direct database call
      const storage = getSessionStorage();
      return storage.getSession(sessionId);
    }
  }

  /**
   * Get user's chat sessions list with caching
   */
  async getUserChatSessions(userId: string, limit = 20): Promise<ChatSession[]> {
    try {
      const cacheKey = CacheKeys.session.userSessionsList(userId);

      // Try cache first
      const cached = await this.cacheService.get<ChatSession[]>(cacheKey);
      if (cached) {
        console.log(`${LOG_PREFIX} User sessions cache hit for user ${userId}`);
        return cached.slice(0, limit); // Apply limit
      }

      // Cache miss - get from database
      console.log(`${LOG_PREFIX} User sessions cache miss for user ${userId}`);
      const storage = getSessionStorage();
      const sessions = await storage.getUserSessions(userId, limit);

      if (sessions.length > 0) {
        // Cache the sessions
        await this.cacheService.set(cacheKey, sessions, USER_SESSIONS_TTL);
        console.log(`${LOG_PREFIX} Cached ${sessions.length} sessions for user ${userId}`);
      }

      return sessions;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting user sessions for ${userId}:`, error);
      // Fallback to direct database call
      const storage = getSessionStorage();
      return storage.getUserSessions(userId, limit);
    }
  }

  /**
   * Update chat session in cache and database
   */
  async updateChatSession(session: ChatSession): Promise<void> {
    try {
      // Update database first
      const storage = getSessionStorage();
      await storage.updateSession(session);

      // Then update cache
      const cacheKey = CacheKeys.session.sessionData(session.id);
      await this.cacheService.set(cacheKey, session, CHAT_SESSION_TTL);

      // Invalidate user's session list cache
      await this.invalidateUserSessions(session.userId);

      console.log(`${LOG_PREFIX} Updated chat session in cache: ${session.id}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error updating chat session ${session.id}:`, error);
      // Still try to update database even if cache fails
      const storage = getSessionStorage();
      await storage.updateSession(session);
    }
  }

  /**
   * Create new chat session and cache it
   */
  async createChatSession(userId: string, title?: string): Promise<ChatSession> {
    try {
      // Create in database first
      const storage = getSessionStorage();
      const session = await storage.createSession(userId, title);

      // Cache the new session
      const cacheKey = CacheKeys.session.sessionData(session.id);
      await this.cacheService.set(cacheKey, session, CHAT_SESSION_TTL);

      // Invalidate user's session list cache
      await this.invalidateUserSessions(userId);

      console.log(`${LOG_PREFIX} Created and cached new session: ${session.id}`);
      return session;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error creating chat session:`, error);
      // Fallback to direct database call
      const storage = getSessionStorage();
      return storage.createSession(userId, title);
    }
  }

  /**
   * Delete chat session from cache and database
   */
  async deleteChatSession(sessionId: string, userId: string): Promise<void> {
    try {
      // Delete from database first
      const storage = getSessionStorage();
      await storage.deleteSession(sessionId);

      // Remove from cache
      const cacheKey = CacheKeys.session.sessionData(sessionId);
      await this.cacheService.delete(cacheKey);

      // Invalidate user's session list cache
      await this.invalidateUserSessions(userId);

      console.log(`${LOG_PREFIX} Deleted session from cache: ${sessionId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error deleting chat session ${sessionId}:`, error);
      // Still try to delete from database even if cache fails
      const storage = getSessionStorage();
      await storage.deleteSession(sessionId);
    }
  }

  /**
   * Invalidate all session cache for a user
   */
  async invalidateUserSessions(userId: string): Promise<void> {
    try {
      const pattern = InvalidationPatterns.user(userId);
      await this.cacheService.invalidatePattern(pattern);
      console.log(`${LOG_PREFIX} Invalidated session cache for user ${userId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating user session cache:`, error);
    }
  }

  /**
   * Invalidate auth session cache for a token
   */
  async invalidateAuthSession(token: string): Promise<void> {
    try {
      const cacheKey = CacheKeys.auth.token(token);
      await this.cacheService.delete(cacheKey);
      console.log(`${LOG_PREFIX} Invalidated auth session cache`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating auth session cache:`, error);
    }
  }

  /**
   * Invalidate specific chat session cache
   */
  async invalidateChatSession(sessionId: string): Promise<void> {
    try {
      const cacheKey = CacheKeys.session.sessionData(sessionId);
      await this.cacheService.delete(cacheKey);
      console.log(`${LOG_PREFIX} Invalidated chat session cache: ${sessionId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating chat session cache:`, error);
    }
  }

  /**
   * Check if cached session is still valid
   */
  private isSessionCacheValid(cached: CachedSession): boolean {
    const age = Date.now() - cached.cachedAt;
    const maxAge = SESSION_TTL * 1000; // Convert to milliseconds
    return age < maxAge;
  }

  /**
   * Preload user sessions into cache
   */
  async preloadUserSessions(userId: string): Promise<void> {
    try {
      console.log(`${LOG_PREFIX} Preloading sessions for user ${userId}`);
      await this.getUserChatSessions(userId);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error preloading user sessions:`, error);
    }
  }

  /**
   * Get cache statistics for sessions
   */
  async getSessionCacheStats() {
    return this.cacheService.getStats();
  }

  /**
   * Warm up session cache for active users
   */
  async warmupCache(activeUserIds: string[]): Promise<void> {
    console.log(`${LOG_PREFIX} Warming up cache for ${activeUserIds.length} active users`);

    const promises = activeUserIds.map(async (userId) => {
      try {
        await this.preloadUserSessions(userId);
      } catch (error) {
        console.error(`${LOG_PREFIX} Error warming up cache for user ${userId}:`, error);
      }
    });

    await Promise.allSettled(promises);
    console.log(`${LOG_PREFIX} Cache warmup completed`);
  }
}

/**
 * Singleton instance
 */
let sessionCacheService: SessionCacheService | null = null;

/**
 * Get the session cache service
 */
export function getSessionCacheService(): SessionCacheService {
  if (!sessionCacheService) {
    sessionCacheService = new SessionCacheService();
  }
  return sessionCacheService;
}
