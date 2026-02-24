/**
 * Cache Service
 *
 * High-level caching interface with TTL management, pattern invalidation,
 * and automatic fallback when Redis is unavailable.
 */

import { getRedisClient, type RedisClient, isRedisConfigured } from './redis-client';
import { generateCacheKey, type CacheKeyOptions } from './cache-keys';

const LOG_PREFIX = '[CacheService]';

/**
 * Cache operation result
 */
export interface CacheResult<T> {
  hit: boolean;
  value: T | null;
  ttl?: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
}

/**
 * Cache service configuration
 */
export interface CacheConfig {
  defaultTTL: number; // Default TTL in seconds
  keyPrefix: string; // Prefix for all cache keys
  enableStats: boolean; // Enable hit/miss statistics
  enableCompression: boolean; // Compress large values
  compressionThreshold: number; // Compress if value > threshold bytes
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  defaultTTL: 3600, // 1 hour
  keyPrefix: 'izzie2',
  enableStats: true,
  enableCompression: false, // Disabled by default for simplicity
  compressionThreshold: 1024, // 1KB
};

/**
 * In-memory fallback for when Redis is unavailable
 */
class MemoryCache {
  private cache = new Map<string, { value: any; expiry: number }>();
  private maxSize = 1000; // Prevent memory leaks

  set(key: string, value: any, ttlSeconds: number): void {
    // Clean up expired entries if cache is getting full
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    // If still full after cleanup, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      const oldestKeys = Array.from(this.cache.keys()).slice(0, 100);
      oldestKeys.forEach(k => this.cache.delete(k));
    }

    const expiry = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { value, expiry });
  }

  get(key: string): any {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Main cache service class
 */
export class CacheService {
  private config: CacheConfig;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    hitRate: 0,
  };
  private memoryCache = new MemoryCache();
  private client: RedisClient | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key);

      // Try Redis first
      if (!this.client) {
        this.client = await getRedisClient();
      }

      if (this.client) {
        const value = await this.client.get(fullKey);
        if (value !== null && value !== undefined) {
          this.recordHit();
          return this.deserialize<T>(value);
        }
      }

      // Fallback to memory cache
      const memoryValue = this.memoryCache.get(fullKey);
      if (memoryValue !== null) {
        this.recordHit();
        return memoryValue;
      }

      this.recordMiss();
      return null;
    } catch (error) {
      this.recordError();
      console.error(`${LOG_PREFIX} Error getting cache key ${key}:`, error);
      // Return null on error - don't throw
      return null;
    }
  }

  /**
   * Set cached value with TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const fullKey = this.buildKey(key);
      const ttl = ttlSeconds || this.config.defaultTTL;
      const serializedValue = this.serialize(value);

      // Try Redis first
      if (!this.client) {
        this.client = await getRedisClient();
      }

      if (this.client) {
        if ('setex' in this.client) {
          // ioredis client
          await (this.client as any).setex(fullKey, ttl, serializedValue);
        } else {
          // Upstash client
          await this.client.setex(fullKey, ttl, serializedValue);
        }
      } else {
        // Fallback to memory cache
        this.memoryCache.set(fullKey, value, ttl);
      }

      this.recordSet();
    } catch (error) {
      this.recordError();
      console.error(`${LOG_PREFIX} Error setting cache key ${key}:`, error);
      // Fallback to memory cache on error
      try {
        const fullKey = this.buildKey(key);
        const ttl = ttlSeconds || this.config.defaultTTL;
        this.memoryCache.set(fullKey, value, ttl);
        this.recordSet();
      } catch (memError) {
        console.error(`${LOG_PREFIX} Memory cache fallback failed:`, memError);
      }
    }
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.buildKey(key);

      // Try Redis first
      if (!this.client) {
        this.client = await getRedisClient();
      }

      if (this.client) {
        await this.client.del(fullKey);
      }

      // Also delete from memory cache
      this.memoryCache.delete(fullKey);

      this.recordDelete();
    } catch (error) {
      this.recordError();
      console.error(`${LOG_PREFIX} Error deleting cache key ${key}:`, error);
    }
  }

  /**
   * Invalidate keys matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const fullPattern = this.buildKey(pattern);

      // Try Redis first
      if (!this.client) {
        this.client = await getRedisClient();
      }

      if (this.client && 'keys' in this.client) {
        // Only ioredis supports KEYS command
        const keys = await (this.client as any).keys(fullPattern);
        if (keys.length > 0) {
          await (this.client as any).del(...keys);
          console.log(`${LOG_PREFIX} Invalidated ${keys.length} keys matching pattern: ${pattern}`);
        }
      }

      // For memory cache, we'd need to iterate - for now, just clear all
      // TODO: Implement pattern matching for memory cache
      console.log(`${LOG_PREFIX} Pattern invalidation for memory cache not implemented, considering clearing all`);
    } catch (error) {
      this.recordError();
      console.error(`${LOG_PREFIX} Error invalidating pattern ${pattern}:`, error);
    }
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    try {
      // Clear Redis
      if (!this.client) {
        this.client = await getRedisClient();
      }

      if (this.client && 'flushdb' in this.client) {
        await (this.client as any).flushdb();
      }

      // Clear memory cache
      this.memoryCache.clear();

      console.log(`${LOG_PREFIX} Cache cleared`);
    } catch (error) {
      this.recordError();
      console.error(`${LOG_PREFIX} Error clearing cache:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0,
    };
  }

  /**
   * Check if caching is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!this.client) {
        this.client = await getRedisClient();
      }
      return this.client !== null || true; // Memory cache always available
    } catch {
      return true; // Memory cache fallback
    }
  }

  /**
   * Build full cache key with prefix
   */
  private buildKey(key: string): string {
    return `${this.config.keyPrefix}:${key}`;
  }

  /**
   * Serialize value for storage
   */
  private serialize(value: any): string {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  }

  /**
   * Deserialize value from storage
   */
  private deserialize<T>(value: string): T {
    try {
      return JSON.parse(value);
    } catch {
      // If not valid JSON, return as string
      return value as unknown as T;
    }
  }

  /**
   * Record statistics
   */
  private recordHit(): void {
    if (this.config.enableStats) {
      this.stats.hits++;
    }
  }

  private recordMiss(): void {
    if (this.config.enableStats) {
      this.stats.misses++;
    }
  }

  private recordSet(): void {
    if (this.config.enableStats) {
      this.stats.sets++;
    }
  }

  private recordDelete(): void {
    if (this.config.enableStats) {
      this.stats.deletes++;
    }
  }

  private recordError(): void {
    if (this.config.enableStats) {
      this.stats.errors++;
    }
  }
}

/**
 * Singleton cache service instance
 */
let cacheService: CacheService | null = null;

/**
 * Get the global cache service instance
 */
export function getCacheService(config?: Partial<CacheConfig>): CacheService {
  if (!cacheService) {
    cacheService = new CacheService(config);
  }
  return cacheService;
}

/**
 * Convenience function for getting cached values
 */
export async function get<T>(key: string): Promise<T | null> {
  return getCacheService().get<T>(key);
}

/**
 * Convenience function for setting cached values
 */
export async function set(key: string, value: any, ttlSeconds?: number): Promise<void> {
  return getCacheService().set(key, value, ttlSeconds);
}

/**
 * Convenience function for deleting cached values
 */
export async function del(key: string): Promise<void> {
  return getCacheService().delete(key);
}

/**
 * Convenience function for pattern invalidation
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  return getCacheService().invalidatePattern(pattern);
}
