/**
 * Redis Cache Infrastructure
 *
 * Comprehensive caching solution for Izzie2 with multiple cache layers:
 * - Session caching for authentication and chat sessions
 * - AI response caching for LLM calls and embeddings
 * - Database query caching with automatic invalidation
 * - API response caching with intelligent TTL management
 * - Sync status management (replacing in-memory storage)
 */

import {
  isRedisConfigured as _isRedisConfigured,
  isLocalRedisConfigured as _isLocalRedisConfigured,
  isUpstashRedisConfigured as _isUpstashRedisConfigured,
  checkRedisHealth,
} from './redis-client';

import {
  getCacheService,
  get,
  set,
  del,
  invalidatePattern,
} from './cache-service';

import {
  getSessionCacheService,
} from './session-cache';

import {
  getAICacheService,
} from './ai-cache';

import {
  getDBCacheService,
  getDBCacheInvalidationHooks,
} from './db-cache';

import {
  getAPICacheInvalidator,
} from './api-cache-middleware';

// Core cache infrastructure
export {
  type RedisClient,
  isRedisConfigured,
  isLocalRedisConfigured,
  isUpstashRedisConfigured,
  getRedisClient,
  getLocalRedisClient,
  getUpstashRedisClient,
  checkRedisHealth,
  closeRedisConnections,
} from './redis-client';

export {
  type CacheResult,
  type CacheStats,
  type CacheConfig,
  CacheService,
  getCacheService,
  get,
  set,
  del,
  invalidatePattern,
} from './cache-service';

// Cache key management
export {
  type CacheKeyOptions,
  CACHE_PATTERNS,
  generateCacheKey,
  hashObject,
  CacheKeys,
  InvalidationPatterns,
} from './cache-keys';

// Session caching
export {
  type CachedSession,
  SessionCacheService,
  getSessionCacheService,
} from './session-cache';

// AI response caching
export {
  type CachedAIResponse,
  type CachedEmbedding,
  type CachedConversationContext,
  AICacheService,
  getAICacheService,
  cacheAIResponse,
  createCachedAICall,
} from './ai-cache';

// Database query caching
export {
  DBCacheService,
  getDBCacheService,
  CacheDBQuery,
  createCachedDBCall,
  DBCacheInvalidationHooks,
  getDBCacheInvalidationHooks,
} from './db-cache';

// API response caching middleware
export {
  type APICacheConfig,
  createAPICacheMiddleware,
  APICacheInvalidator,
  getAPICacheInvalidator,
  APICacheConfigs,
  withAPICache,
  CacheAPIRoute,
  SyncStatusCache,
  getSyncStatusCache,
} from './api-cache-middleware';

/**
 * Cache TTL constants (in seconds)
 */
export const CACHE_TTL = {
  // Session caching
  SESSION: 5 * 60,           // 5 minutes
  CHAT_SESSION: 30 * 60,     // 30 minutes
  USER_SESSIONS: 10 * 60,    // 10 minutes

  // AI caching
  AI_RESPONSE: 24 * 60 * 60, // 24 hours
  AI_EMBEDDING: 7 * 24 * 60 * 60, // 7 days
  AI_CONVERSATION: 60 * 60,  // 1 hour
  AI_ANALYSIS: 12 * 60 * 60, // 12 hours

  // Database caching
  DB_QUERY: 10 * 60,         // 10 minutes
  DB_SEARCH: 5 * 60,         // 5 minutes
  DB_STATS: 30 * 60,         // 30 minutes
  DB_CONFIG: 60 * 60,        // 1 hour

  // API caching
  API_SHORT: 60,             // 1 minute
  API_MEDIUM: 5 * 60,        // 5 minutes
  API_LONG: 30 * 60,         // 30 minutes
  API_ANALYTICS: 60 * 60,    // 1 hour

  // Sync status
  SYNC_STATUS: 60 * 60,      // 1 hour
} as const;

/**
 * Cache performance monitoring
 */
export class CacheMonitor {
  /**
   * Get comprehensive cache statistics
   */
  static async getCacheStats() {
    const [
      redisHealth,
      cacheStats,
      sessionStats,
      aiStats,
      dbStats,
    ] = await Promise.allSettled([
      checkRedisHealth(),
      getCacheService().getStats(),
      getSessionCacheService().getSessionCacheStats(),
      getAICacheService().getAICacheStats(),
      getDBCacheService().getDBCacheStats(),
    ]);

    return {
      redis: redisHealth.status === 'fulfilled' ? redisHealth.value : null,
      cache: cacheStats.status === 'fulfilled' ? cacheStats.value : null,
      session: sessionStats.status === 'fulfilled' ? sessionStats.value : null,
      ai: aiStats.status === 'fulfilled' ? aiStats.value : null,
      db: dbStats.status === 'fulfilled' ? dbStats.value : null,
      timestamp: Date.now(),
    };
  }

  /**
   * Reset all cache statistics
   */
  static async resetStats() {
    getCacheService().resetStats();
  }

  /**
   * Health check for all cache layers
   */
  static async healthCheck(): Promise<{
    healthy: boolean;
    redis: boolean;
    cache: boolean;
    details: any;
  }> {
    try {
      const [redisHealth, cacheAvailable] = await Promise.all([
        checkRedisHealth(),
        getCacheService().isAvailable(),
      ]);

      const healthy = redisHealth.available && cacheAvailable;

      return {
        healthy,
        redis: redisHealth.available,
        cache: cacheAvailable,
        details: {
          redis: redisHealth,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        redis: false,
        cache: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        },
      };
    }
  }
}

/**
 * Cache warmup utilities
 */
export class CacheWarmup {
  /**
   * Warm up cache for active users
   */
  static async warmupForUsers(userIds: string[]) {
    console.log(`[CacheWarmup] Warming up cache for ${userIds.length} users`);

    const sessionCache = getSessionCacheService();
    await sessionCache.warmupCache(userIds);

    console.log(`[CacheWarmup] Warmup completed for ${userIds.length} users`);
  }

  /**
   * Preload commonly accessed data
   */
  static async preloadCommonData() {
    console.log(`[CacheWarmup] Preloading common data`);

    // This would be customized based on your application's common access patterns
    // For example, preload frequently accessed configuration, popular search results, etc.

    console.log(`[CacheWarmup] Common data preload completed`);
  }
}

/**
 * Cache invalidation utilities
 */
export class CacheInvalidation {
  /**
   * Invalidate all user-related cache
   */
  static async invalidateUser(userId: string) {
    await Promise.allSettled([
      getSessionCacheService().invalidateUserSessions(userId),
      getDBCacheService().invalidateUserCache(userId),
      getAPICacheInvalidator().invalidateUserCache(userId),
    ]);

    console.log(`[CacheInvalidation] Invalidated all cache for user: ${userId}`);
  }

  /**
   * Invalidate cache when data changes
   */
  static async onDataChange(type: 'contact' | 'entity' | 'relationship', userId: string) {
    const hooks = getDBCacheInvalidationHooks();

    switch (type) {
      case 'contact':
        await hooks.onContactChange(userId);
        break;
      case 'entity':
        await hooks.onEntityChange(userId);
        break;
      case 'relationship':
        await hooks.onRelationshipChange(userId);
        break;
    }

    console.log(`[CacheInvalidation] Invalidated cache for ${type} change, user: ${userId}`);
  }

  /**
   * Invalidate all cache (use sparingly)
   */
  static async invalidateAll() {
    await Promise.allSettled([
      getCacheService().clear(),
      getAPICacheInvalidator().clearAllAPICache(),
      getAICacheService().clearAllAICache(),
    ]);

    console.log(`[CacheInvalidation] Invalidated all cache`);
  }
}

/**
 * Cache configuration utilities
 */
export class CacheConfigUtility {
  /**
   * Get optimal cache configuration based on environment
   */
  static getConfig() {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
      defaultTTL: isProduction ? CACHE_TTL.API_MEDIUM : CACHE_TTL.API_SHORT,
      enableStats: true,
      enableCompression: isProduction,
      compressionThreshold: 1024,
    };
  }

  /**
   * Get Redis configuration summary
   */
  static getRedisConfig() {
    return {
      local: _isLocalRedisConfigured(),
      upstash: _isUpstashRedisConfigured(),
      configured: _isRedisConfigured(),
    };
  }
}

/**
 * Default export with common cache operations
 */
export default {
  // Core operations
  get,
  set,
  del,
  invalidatePattern,

  // Services
  getCacheService,
  getSessionCacheService,
  getAICacheService,
  getDBCacheService,

  // Utilities
  monitor: CacheMonitor,
  warmup: CacheWarmup,
  invalidation: CacheInvalidation,
  config: CacheConfigUtility,

  // TTL constants
  TTL: CACHE_TTL,
};
