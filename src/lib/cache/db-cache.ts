/**
 * Database Query Cache Layer
 *
 * Caches expensive database queries with automatic invalidation
 * when related data changes. Implements cache-aside pattern.
 */

import { getCacheService } from './cache-service';
import { CacheKeys, InvalidationPatterns, hashObject } from './cache-keys';

const LOG_PREFIX = '[DBCache]';

// Cache TTLs in seconds
const DB_QUERY_TTL = 10 * 60; // 10 minutes for most queries
const DB_SEARCH_TTL = 5 * 60; // 5 minutes for search results
const DB_STATS_TTL = 30 * 60; // 30 minutes for statistics
const DB_CONFIG_TTL = 60 * 60; // 1 hour for configuration data

/**
 * Database cache service
 */
export class DBCacheService {
  private cacheService = getCacheService();

  /**
   * Cache database query result
   */
  async cacheQuery<T>(
    queryKey: string,
    result: T,
    options: {
      ttl?: number;
      userId?: string;
      tags?: string[]; // Tags for bulk invalidation
    } = {}
  ): Promise<void> {
    try {
      const ttl = options.ttl || DB_QUERY_TTL;

      const cachedResult = {
        data: result,
        userId: options.userId,
        tags: options.tags || [],
        timestamp: Date.now(),
      };

      await this.cacheService.set(queryKey, cachedResult, ttl);

      console.log(`${LOG_PREFIX} Cached DB query: ${queryKey}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error caching query:`, error);
    }
  }

  /**
   * Get cached query result
   */
  async getCachedQuery<T>(queryKey: string): Promise<T | null> {
    try {
      const cached = await this.cacheService.get<{
        data: T;
        userId?: string;
        tags?: string[];
        timestamp: number;
      }>(queryKey);

      if (cached) {
        console.log(`${LOG_PREFIX} DB cache hit: ${queryKey}`);
        return cached.data;
      }

      return null;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting cached query:`, error);
      return null;
    }
  }

  /**
   * Cache wrapper for database operations
   */
  async withCache<T>(
    cacheKey: string,
    dbOperation: () => Promise<T>,
    options: {
      ttl?: number;
      userId?: string;
      tags?: string[];
    } = {}
  ): Promise<T> {
    // Try cache first
    const cached = await this.getCachedQuery<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Execute database operation
    console.log(`${LOG_PREFIX} DB cache miss, executing query: ${cacheKey}`);
    const result = await dbOperation();

    // Cache the result
    await this.cacheQuery(cacheKey, result, options);

    return result;
  }

  /**
   * Cache user data queries
   */
  async cacheUserData<T>(
    userId: string,
    dataType: string,
    data: T,
    ttl?: number
  ): Promise<void> {
    const cacheKey = CacheKeys.db.user(userId) + `:${dataType}`;
    await this.cacheQuery(cacheKey, data, { ttl, userId, tags: [`user:${userId}`, dataType] });
  }

  /**
   * Get cached user data
   */
  async getCachedUserData<T>(
    userId: string,
    dataType: string
  ): Promise<T | null> {
    const cacheKey = CacheKeys.db.user(userId) + `:${dataType}`;
    return this.getCachedQuery<T>(cacheKey);
  }

  /**
   * Cache contact queries
   */
  async cacheContacts(
    userId: string,
    contacts: any[],
    queryParams?: any
  ): Promise<void> {
    const cacheKey = queryParams
      ? CacheKeys.db.contacts(userId) + `:${hashObject(queryParams)}`
      : CacheKeys.db.contacts(userId);

    await this.cacheQuery(cacheKey, contacts, {
      userId,
      tags: [`user:${userId}`, 'contacts'],
    });
  }

  /**
   * Get cached contacts
   */
  async getCachedContacts(
    userId: string,
    queryParams?: any
  ): Promise<any[] | null> {
    const cacheKey = queryParams
      ? CacheKeys.db.contacts(userId) + `:${hashObject(queryParams)}`
      : CacheKeys.db.contacts(userId);

    return this.getCachedQuery<any[]>(cacheKey);
  }

  /**
   * Cache entity queries
   */
  async cacheEntities(
    userId: string,
    entities: any[],
    queryParams?: any
  ): Promise<void> {
    const cacheKey = queryParams
      ? CacheKeys.db.entities(userId) + `:${hashObject(queryParams)}`
      : CacheKeys.db.entities(userId);

    await this.cacheQuery(cacheKey, entities, {
      userId,
      tags: [`user:${userId}`, 'entities'],
    });
  }

  /**
   * Get cached entities
   */
  async getCachedEntities(
    userId: string,
    queryParams?: any
  ): Promise<any[] | null> {
    const cacheKey = queryParams
      ? CacheKeys.db.entities(userId) + `:${hashObject(queryParams)}`
      : CacheKeys.db.entities(userId);

    return this.getCachedQuery<any[]>(cacheKey);
  }

  /**
   * Cache relationship queries
   */
  async cacheRelationships(
    userId: string,
    relationships: any[],
    queryParams?: any
  ): Promise<void> {
    const cacheKey = queryParams
      ? CacheKeys.db.relationships(userId) + `:${hashObject(queryParams)}`
      : CacheKeys.db.relationships(userId);

    await this.cacheQuery(cacheKey, relationships, {
      userId,
      tags: [`user:${userId}`, 'relationships'],
    });
  }

  /**
   * Get cached relationships
   */
  async getCachedRelationships(
    userId: string,
    queryParams?: any
  ): Promise<any[] | null> {
    const cacheKey = queryParams
      ? CacheKeys.db.relationships(userId) + `:${hashObject(queryParams)}`
      : CacheKeys.db.relationships(userId);

    return this.getCachedQuery<any[]>(cacheKey);
  }

  /**
   * Cache search results
   */
  async cacheSearchResults(
    query: string,
    results: any[],
    filters?: any,
    userId?: string
  ): Promise<void> {
    const cacheKey = CacheKeys.db.search(query, filters);

    await this.cacheQuery(cacheKey, results, {
      ttl: DB_SEARCH_TTL,
      userId,
      tags: ['search', userId ? `user:${userId}` : 'global'].filter(Boolean),
    });
  }

  /**
   * Get cached search results
   */
  async getCachedSearchResults(
    query: string,
    filters?: any
  ): Promise<any[] | null> {
    const cacheKey = CacheKeys.db.search(query, filters);
    return this.getCachedQuery<any[]>(cacheKey);
  }

  /**
   * Invalidate user-specific cache
   */
  async invalidateUserCache(userId: string): Promise<void> {
    try {
      const pattern = InvalidationPatterns.userDatabase(userId);
      await this.cacheService.invalidatePattern(pattern);
      console.log(`${LOG_PREFIX} Invalidated DB cache for user: ${userId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating user cache:`, error);
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTag(tag: string): Promise<void> {
    try {
      // This would require a more sophisticated implementation
      // For now, we'll use pattern matching
      await this.cacheService.invalidatePattern(`*${tag}*`);
      console.log(`${LOG_PREFIX} Invalidated cache for tag: ${tag}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating cache by tag:`, error);
    }
  }

  /**
   * Invalidate contacts cache
   */
  async invalidateContactsCache(userId: string): Promise<void> {
    try {
      const pattern = `*${CacheKeys.db.contacts(userId)}*`;
      await this.cacheService.invalidatePattern(pattern);
      console.log(`${LOG_PREFIX} Invalidated contacts cache for user: ${userId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating contacts cache:`, error);
    }
  }

  /**
   * Invalidate entities cache
   */
  async invalidateEntitiesCache(userId: string): Promise<void> {
    try {
      const pattern = `*${CacheKeys.db.entities(userId)}*`;
      await this.cacheService.invalidatePattern(pattern);
      console.log(`${LOG_PREFIX} Invalidated entities cache for user: ${userId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating entities cache:`, error);
    }
  }

  /**
   * Invalidate relationships cache
   */
  async invalidateRelationshipsCache(userId: string): Promise<void> {
    try {
      const pattern = `*${CacheKeys.db.relationships(userId)}*`;
      await this.cacheService.invalidatePattern(pattern);
      console.log(`${LOG_PREFIX} Invalidated relationships cache for user: ${userId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating relationships cache:`, error);
    }
  }

  /**
   * Invalidate search cache
   */
  async invalidateSearchCache(): Promise<void> {
    try {
      await this.cacheService.invalidatePattern('*search*');
      console.log(`${LOG_PREFIX} Invalidated search cache`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating search cache:`, error);
    }
  }

  /**
   * Get database cache statistics
   */
  async getDBCacheStats() {
    return this.cacheService.getStats();
  }

  /**
   * Preload commonly used data into cache
   */
  async preloadUserData(
    userId: string,
    dataLoaders: {
      contacts?: () => Promise<any[]>;
      entities?: () => Promise<any[]>;
      relationships?: () => Promise<any[]>;
    }
  ): Promise<void> {
    console.log(`${LOG_PREFIX} Preloading data for user ${userId}`);

    const promises: Promise<any>[] = [];

    if (dataLoaders.contacts) {
      promises.push(
        this.withCache(CacheKeys.db.contacts(userId), dataLoaders.contacts, { userId })
      );
    }

    if (dataLoaders.entities) {
      promises.push(
        this.withCache(CacheKeys.db.entities(userId), dataLoaders.entities, { userId })
      );
    }

    if (dataLoaders.relationships) {
      promises.push(
        this.withCache(CacheKeys.db.relationships(userId), dataLoaders.relationships, { userId })
      );
    }

    await Promise.allSettled(promises);
    console.log(`${LOG_PREFIX} Preloading completed for user ${userId}`);
  }
}

/**
 * Singleton instance
 */
let dbCacheService: DBCacheService | null = null;

/**
 * Get the database cache service
 */
export function getDBCacheService(): DBCacheService {
  if (!dbCacheService) {
    dbCacheService = new DBCacheService();
  }
  return dbCacheService;
}

/**
 * Decorator for caching database method calls
 */
export function CacheDBQuery(
  keyGenerator: (...args: any[]) => string,
  options: {
    ttl?: number;
    userIdIndex?: number; // Index of userId in method arguments
  } = {}
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const dbCache = getDBCacheService();
      const cacheKey = keyGenerator(...args);

      // Extract userId if specified
      const userId = options.userIdIndex !== undefined ? args[options.userIdIndex] : undefined;

      return dbCache.withCache(
        cacheKey,
        () => originalMethod.apply(this, args),
        {
          ttl: options.ttl,
          userId,
        }
      );
    };

    return descriptor;
  };
}

/**
 * Helper function to create cached database call wrapper
 */
export function createCachedDBCall<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  keyGenerator: (...args: T) => string,
  options: {
    ttl?: number;
    userIdExtractor?: (...args: T) => string | undefined;
  } = {}
): (...args: T) => Promise<R> {
  const dbCache = getDBCacheService();

  return async (...args: T): Promise<R> => {
    const cacheKey = keyGenerator(...args);
    const userId = options.userIdExtractor?.(...args);

    return dbCache.withCache(
      cacheKey,
      () => fn(...args),
      {
        ttl: options.ttl,
        userId,
      }
    );
  };
}

/**
 * Cache invalidation hooks for common database operations
 */
export class DBCacheInvalidationHooks {
  private dbCache = getDBCacheService();

  /**
   * Hook for after contact creation/update/deletion
   */
  async onContactChange(userId: string, contactId?: string): Promise<void> {
    await Promise.allSettled([
      this.dbCache.invalidateContactsCache(userId),
      this.dbCache.invalidateUserCache(userId),
      this.dbCache.invalidateSearchCache(),
    ]);
  }

  /**
   * Hook for after entity creation/update/deletion
   */
  async onEntityChange(userId: string, entityId?: string): Promise<void> {
    await Promise.allSettled([
      this.dbCache.invalidateEntitiesCache(userId),
      this.dbCache.invalidateRelationshipsCache(userId),
      this.dbCache.invalidateUserCache(userId),
      this.dbCache.invalidateSearchCache(),
    ]);
  }

  /**
   * Hook for after relationship creation/update/deletion
   */
  async onRelationshipChange(userId: string, relationshipId?: string): Promise<void> {
    await Promise.allSettled([
      this.dbCache.invalidateRelationshipsCache(userId),
      this.dbCache.invalidateUserCache(userId),
      this.dbCache.invalidateSearchCache(),
    ]);
  }

  /**
   * Hook for after user data update
   */
  async onUserDataChange(userId: string): Promise<void> {
    await this.dbCache.invalidateUserCache(userId);
  }

  /**
   * Hook for bulk data changes
   */
  async onBulkDataChange(userId: string): Promise<void> {
    await Promise.allSettled([
      this.dbCache.invalidateUserCache(userId),
      this.dbCache.invalidateSearchCache(),
    ]);
  }
}

/**
 * Singleton invalidation hooks instance
 */
let dbCacheInvalidationHooks: DBCacheInvalidationHooks | null = null;

export function getDBCacheInvalidationHooks(): DBCacheInvalidationHooks {
  if (!dbCacheInvalidationHooks) {
    dbCacheInvalidationHooks = new DBCacheInvalidationHooks();
  }
  return dbCacheInvalidationHooks;
}
