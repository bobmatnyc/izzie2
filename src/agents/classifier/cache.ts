/**
 * Classification Result Cache
 * Reduces API calls for duplicate or similar webhook events
 */

import crypto from 'crypto';
import type { ClassificationResult, CacheEntry, WebhookEvent } from './types';

/**
 * Default cache TTL: 5 minutes
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Classification cache for reducing duplicate API calls
 */
export class ClassificationCache {
  private cache: Map<string, CacheEntry>;
  private ttlMs: number;
  private hits: number;
  private misses: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Generate cache key from webhook event
   * Hash based on source + key fields of payload
   */
  private generateHash(event: WebhookEvent): string {
    const { source, payload } = event;

    // Extract key fields from payload based on source
    let keyFields: Record<string, unknown> = {};

    if (typeof payload === 'object' && payload !== null) {
      const obj = payload as Record<string, unknown>;

      // Source-specific key fields
      if (source === 'github') {
        keyFields = {
          action: obj.action,
          repository: obj.repository,
          issue: obj.issue,
          pull_request: obj.pull_request,
          sender: obj.sender,
        };
      } else if (source === 'linear') {
        keyFields = {
          action: obj.action,
          type: obj.type,
          data: obj.data,
        };
      } else if (source === 'google') {
        keyFields = {
          kind: obj.kind,
          summary: obj.summary,
          start: obj.start,
          end: obj.end,
        };
      } else {
        // Generic fallback - use entire payload
        keyFields = obj;
      }
    }

    // Create hash from source + key fields
    const hashInput = JSON.stringify({
      source,
      keyFields,
    });

    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Get cached classification result
   */
  get(event: WebhookEvent): ClassificationResult | null {
    const hash = this.generateHash(event);
    const entry = this.cache.get(hash);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(hash);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.result;
  }

  /**
   * Store classification result in cache
   */
  set(event: WebhookEvent, result: ClassificationResult): void {
    const hash = this.generateHash(event);
    const now = Date.now();

    const entry: CacheEntry = {
      hash,
      result,
      timestamp: now,
      expiresAt: now + this.ttlMs,
    };

    this.cache.set(hash, entry);
  }

  /**
   * Clear expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [hash, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(hash);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    ttlMs: number;
  } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      ttlMs: this.ttlMs,
    };
  }

  /**
   * Check if cache has entry for event
   */
  has(event: WebhookEvent): boolean {
    const hash = this.generateHash(event);
    const entry = this.cache.get(hash);

    if (!entry) {
      return false;
    }

    // Check if expired
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(hash);
      return false;
    }

    return true;
  }
}

/**
 * Singleton cache instance
 */
let cacheInstance: ClassificationCache | null = null;

/**
 * Get or create cache instance
 */
export function getCache(ttlMs?: number): ClassificationCache {
  if (!cacheInstance) {
    cacheInstance = new ClassificationCache(ttlMs);
  }
  return cacheInstance;
}

/**
 * Reset cache instance (useful for testing)
 */
export function resetCache(): void {
  cacheInstance = null;
}
