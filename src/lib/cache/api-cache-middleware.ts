/**
 * API Route Caching Middleware
 *
 * Middleware for Next.js API routes to automatically cache responses
 * with intelligent cache invalidation and user-specific caching.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCacheService } from './cache-service';
import { CacheKeys, hashObject } from './cache-keys';
import { getSession } from '@/lib/auth';

const LOG_PREFIX = '[APICacheMiddleware]';

/**
 * Cache configuration for API routes
 */
export interface APICacheConfig {
  ttl?: number; // Cache TTL in seconds
  userSpecific?: boolean; // Whether cache is user-specific
  varyBy?: string[]; // Headers/query params to vary cache by
  skipCache?: boolean; // Skip caching for this route
  skipCacheCondition?: (request: NextRequest) => boolean; // Dynamic skip condition
  keyGenerator?: (request: NextRequest, userId?: string) => string; // Custom cache key
  invalidateOn?: string[]; // Patterns to invalidate cache on
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: APICacheConfig = {
  ttl: 5 * 60, // 5 minutes default
  userSpecific: false,
  varyBy: [],
  skipCache: false,
};

/**
 * Cached API response
 */
interface CachedAPIResponse {
  body: any;
  headers: Record<string, string>;
  status: number;
  timestamp: number;
  userId?: string;
}

/**
 * Create API cache middleware
 */
export function createAPICacheMiddleware(config: APICacheConfig = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return function apiCacheMiddleware<T extends any[], R>(
    handler: (request: NextRequest, ...args: T) => Promise<NextResponse> | NextResponse
  ) {
    return async function cachedHandler(request: NextRequest, ...args: T): Promise<NextResponse> {
      const cacheService = getCacheService();

      try {
        // Skip caching if configured or condition met
        if (finalConfig.skipCache || finalConfig.skipCacheCondition?.(request)) {
          return await handler(request, ...args);
        }

        // Only cache GET requests by default
        if (request.method !== 'GET') {
          return await handler(request, ...args);
        }

        // Get user ID if user-specific caching
        let userId: string | undefined;
        if (finalConfig.userSpecific) {
          const session = await getSession(request);
          userId = session?.user?.id;

          if (!userId) {
            // Skip caching for unauthenticated requests if user-specific
            return await handler(request, ...args);
          }
        }

        // Generate cache key
        const cacheKey = finalConfig.keyGenerator
          ? finalConfig.keyGenerator(request, userId)
          : generateDefaultCacheKey(request, userId, finalConfig.varyBy);

        // Try to get from cache
        const cached = await cacheService.get<CachedAPIResponse>(cacheKey);
        if (cached) {
          console.log(`${LOG_PREFIX} API cache hit: ${request.url}`);

          // Return cached response
          return new NextResponse(
            JSON.stringify(cached.body),
            {
              status: cached.status,
              headers: {
                ...cached.headers,
                'X-Cache': 'HIT',
                'X-Cache-Time': new Date(cached.timestamp).toISOString(),
              },
            }
          );
        }

        console.log(`${LOG_PREFIX} API cache miss: ${request.url}`);

        // Call the original handler
        const response = await handler(request, ...args);

        // Only cache successful responses
        if (response.status >= 200 && response.status < 300) {
          try {
            // Clone response to read body
            const clonedResponse = response.clone();
            const body = await clonedResponse.json().catch(() => null);

            if (body !== null) {
              // Extract headers to cache
              const headers: Record<string, string> = {};
              response.headers.forEach((value, key) => {
                // Only cache certain headers
                if (shouldCacheHeader(key)) {
                  headers[key] = value;
                }
              });

              const cachedResponse: CachedAPIResponse = {
                body,
                headers,
                status: response.status,
                timestamp: Date.now(),
                userId,
              };

              // Cache the response
              await cacheService.set(cacheKey, cachedResponse, finalConfig.ttl);
              console.log(`${LOG_PREFIX} Cached API response: ${request.url}`);
            }
          } catch (error) {
            console.error(`${LOG_PREFIX} Error caching response:`, error);
          }
        }

        // Add cache miss header
        response.headers.set('X-Cache', 'MISS');
        return response;

      } catch (error) {
        console.error(`${LOG_PREFIX} Error in cache middleware:`, error);
        // Fallback to original handler on error
        return await handler(request, ...args);
      }
    };
  };
}

/**
 * Generate default cache key for API routes
 */
function generateDefaultCacheKey(
  request: NextRequest,
  userId?: string,
  varyBy: string[] = []
): string {
  const url = new URL(request.url);
  const endpoint = url.pathname;

  // Build parameters object for hashing
  const params: Record<string, any> = {
    method: request.method,
    pathname: endpoint,
  };

  // Add query parameters
  url.searchParams.forEach((value, key) => {
    params[`query_${key}`] = value;
  });

  // Add vary-by headers
  varyBy.forEach(headerName => {
    const value = request.headers.get(headerName);
    if (value) {
      params[`header_${headerName}`] = value;
    }
  });

  if (userId) {
    return CacheKeys.api.userData(userId, endpoint, params);
  } else {
    return CacheKeys.api.response(endpoint, params);
  }
}

/**
 * Determine if header should be cached
 */
function shouldCacheHeader(headerName: string): boolean {
  const cacheableHeaders = [
    'content-type',
    'cache-control',
    'etag',
    'last-modified',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
  ];

  return cacheableHeaders.includes(headerName.toLowerCase());
}

/**
 * Cache invalidation utilities
 */
export class APICacheInvalidator {
  private cacheService = getCacheService();

  /**
   * Invalidate cache for specific API endpoint
   */
  async invalidateEndpoint(endpoint: string): Promise<void> {
    try {
      await this.cacheService.invalidatePattern(`*api:${endpoint}*`);
      console.log(`${LOG_PREFIX} Invalidated cache for endpoint: ${endpoint}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating endpoint cache:`, error);
    }
  }

  /**
   * Invalidate all API cache for a user
   */
  async invalidateUserCache(userId: string): Promise<void> {
    try {
      await this.cacheService.invalidatePattern(`*api:user:${userId}*`);
      console.log(`${LOG_PREFIX} Invalidated API cache for user: ${userId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error invalidating user API cache:`, error);
    }
  }

  /**
   * Invalidate cache for multiple endpoints
   */
  async invalidateEndpoints(endpoints: string[]): Promise<void> {
    const promises = endpoints.map(endpoint => this.invalidateEndpoint(endpoint));
    await Promise.allSettled(promises);
  }

  /**
   * Clear all API cache
   */
  async clearAllAPICache(): Promise<void> {
    try {
      await this.cacheService.invalidatePattern('*api:*');
      console.log(`${LOG_PREFIX} Cleared all API cache`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error clearing API cache:`, error);
    }
  }
}

/**
 * Singleton invalidator instance
 */
let invalidator: APICacheInvalidator | null = null;

export function getAPICacheInvalidator(): APICacheInvalidator {
  if (!invalidator) {
    invalidator = new APICacheInvalidator();
  }
  return invalidator;
}

/**
 * Predefined cache configurations for common patterns
 */
export const APICacheConfigs = {
  // Short-term cache for frequently changing data
  shortTerm: {
    ttl: 60, // 1 minute
    userSpecific: true,
  },

  // Medium-term cache for moderate changing data
  mediumTerm: {
    ttl: 5 * 60, // 5 minutes
    userSpecific: true,
  },

  // Long-term cache for stable data
  longTerm: {
    ttl: 30 * 60, // 30 minutes
    userSpecific: false,
  },

  // User-specific data cache
  userSpecific: {
    ttl: 10 * 60, // 10 minutes
    userSpecific: true,
  },

  // Global data cache
  global: {
    ttl: 15 * 60, // 15 minutes
    userSpecific: false,
  },

  // Search results cache
  search: {
    ttl: 5 * 60, // 5 minutes
    userSpecific: true,
    varyBy: ['authorization'],
  },

  // Analytics/stats cache
  analytics: {
    ttl: 60 * 60, // 1 hour
    userSpecific: false,
  },

  // No cache for real-time data
  realTime: {
    skipCache: true,
  },
};

/**
 * Helper for creating route-specific cache middleware
 */
export function withAPICache(config: APICacheConfig = {}) {
  return createAPICacheMiddleware(config);
}

/**
 * Decorator for caching API route methods
 */
export function CacheAPIRoute(config: APICacheConfig = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cachedMethod = createAPICacheMiddleware(config)(originalMethod);
    descriptor.value = cachedMethod;
    return descriptor;
  };
}

/**
 * Sync status caching utilities (replacing in-memory sync status)
 */
export class SyncStatusCache {
  private cacheService = getCacheService();
  private readonly SYNC_STATUS_TTL = 60 * 60; // 1 hour

  /**
   * Set sync status
   */
  async setSyncStatus(
    service: string,
    userId: string,
    status: {
      isRunning: boolean;
      startedAt?: Date;
      progress?: number;
      message?: string;
      error?: string;
    }
  ): Promise<void> {
    try {
      const cacheKey = CacheKeys.sync.status(service, userId);
      await this.cacheService.set(cacheKey, status, this.SYNC_STATUS_TTL);
      console.log(`${LOG_PREFIX} Updated sync status for ${service}:${userId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error setting sync status:`, error);
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(
    service: string,
    userId: string
  ): Promise<{
    isRunning: boolean;
    startedAt?: Date;
    progress?: number;
    message?: string;
    error?: string;
  } | null> {
    try {
      const cacheKey = CacheKeys.sync.status(service, userId);
      const status = await this.cacheService.get(cacheKey);

      if (status && (status as any).startedAt) {
        (status as any).startedAt = new Date((status as any).startedAt);
      }

      return status as any;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting sync status:`, error);
      return null;
    }
  }

  /**
   * Clear sync status
   */
  async clearSyncStatus(service: string, userId: string): Promise<void> {
    try {
      const cacheKey = CacheKeys.sync.status(service, userId);
      await this.cacheService.delete(cacheKey);
      console.log(`${LOG_PREFIX} Cleared sync status for ${service}:${userId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error clearing sync status:`, error);
    }
  }

  /**
   * Set sync progress
   */
  async setSyncProgress(
    service: string,
    userId: string,
    progress: {
      current: number;
      total: number;
      message?: string;
    }
  ): Promise<void> {
    try {
      const cacheKey = CacheKeys.sync.progress(service, userId);
      await this.cacheService.set(cacheKey, progress, this.SYNC_STATUS_TTL);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error setting sync progress:`, error);
    }
  }

  /**
   * Get sync progress
   */
  async getSyncProgress(
    service: string,
    userId: string
  ): Promise<{
    current: number;
    total: number;
    message?: string;
  } | null> {
    try {
      const cacheKey = CacheKeys.sync.progress(service, userId);
      return await this.cacheService.get(cacheKey);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting sync progress:`, error);
      return null;
    }
  }
}

/**
 * Singleton sync status cache instance
 */
let syncStatusCache: SyncStatusCache | null = null;

export function getSyncStatusCache(): SyncStatusCache {
  if (!syncStatusCache) {
    syncStatusCache = new SyncStatusCache();
  }
  return syncStatusCache;
}
