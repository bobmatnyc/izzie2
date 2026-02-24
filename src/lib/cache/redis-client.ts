/**
 * Redis Client Configuration
 *
 * Centralized Redis client setup with connection pooling, error handling,
 * and graceful fallback when Redis is unavailable.
 */

import Redis, { type RedisOptions } from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

const LOG_PREFIX = '[Redis]';

/**
 * Redis client type - either ioredis or Upstash Redis
 */
export type RedisClient = Redis | UpstashRedis;

// Singleton instances
let redisClient: Redis | null = null;
let upstashClient: UpstashRedis | null = null;

/**
 * Check if Redis is configured
 */
export function isRedisConfigured(): boolean {
  return !!(
    (process.env.REDIS_URL || process.env.REDIS_HOST) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

/**
 * Check if local Redis (ioredis) is configured
 */
export function isLocalRedisConfigured(): boolean {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/**
 * Check if Upstash Redis is configured
 */
export function isUpstashRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Get Redis configuration from environment variables
 */
function getRedisConfig(): RedisOptions | null {
  if (process.env.REDIS_URL) {
    return {
      // Parse Redis URL (redis://user:pass@host:port/db) # pragma: allowlist secret
      host: process.env.REDIS_URL,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      // Connection pool settings
      family: 4, // IPv4
      // Error handling
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      // Graceful reconnection
      enableAutoPipelining: true,
      enableOfflineQueue: false, // Don't queue commands when disconnected
    };
  }

  if (process.env.REDIS_HOST) {
    return {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableAutoPipelining: true,
      enableOfflineQueue: false,
    };
  }

  return null;
}

/**
 * Initialize local Redis client (ioredis)
 */
async function initializeLocalRedis(): Promise<Redis | null> {
  if (!isLocalRedisConfigured()) {
    return null;
  }

  const config = getRedisConfig();
  if (!config) {
    return null;
  }

  try {
    console.log(`${LOG_PREFIX} Initializing local Redis client...`);

    const client = new Redis(config);

    // Set up event handlers
    client.on('connect', () => {
      console.log(`${LOG_PREFIX} Connected to Redis server`);
    });

    client.on('error', (error) => {
      console.error(`${LOG_PREFIX} Redis connection error:`, error.message);
    });

    client.on('reconnecting', () => {
      console.log(`${LOG_PREFIX} Reconnecting to Redis...`);
    });

    client.on('close', () => {
      console.log(`${LOG_PREFIX} Redis connection closed`);
    });

    // Test connection
    await client.ping();
    console.log(`${LOG_PREFIX} Local Redis client initialized successfully`);

    return client;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to initialize local Redis:`, error);
    return null;
  }
}

/**
 * Initialize Upstash Redis client
 */
function initializeUpstashRedis(): UpstashRedis | null {
  if (!isUpstashRedisConfigured()) {
    return null;
  }

  try {
    console.log(`${LOG_PREFIX} Initializing Upstash Redis client...`);

    const client = new UpstashRedis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    console.log(`${LOG_PREFIX} Upstash Redis client initialized successfully`);
    return client;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to initialize Upstash Redis:`, error);
    return null;
  }
}

/**
 * Get the primary Redis client (prefers local Redis, falls back to Upstash)
 */
export async function getRedisClient(): Promise<RedisClient | null> {
  // Try local Redis first
  if (!redisClient && isLocalRedisConfigured()) {
    redisClient = await initializeLocalRedis();
  }

  if (redisClient) {
    return redisClient;
  }

  // Fall back to Upstash Redis
  if (!upstashClient && isUpstashRedisConfigured()) {
    upstashClient = initializeUpstashRedis();
  }

  return upstashClient;
}

/**
 * Get local Redis client specifically (ioredis)
 * Used for operations that require advanced Redis features
 */
export async function getLocalRedisClient(): Promise<Redis | null> {
  if (!redisClient && isLocalRedisConfigured()) {
    redisClient = await initializeLocalRedis();
  }
  return redisClient;
}

/**
 * Get Upstash Redis client specifically
 * Used for rate limiting and simple operations
 */
export function getUpstashRedisClient(): UpstashRedis | null {
  if (!upstashClient && isUpstashRedisConfigured()) {
    upstashClient = initializeUpstashRedis();
  }
  return upstashClient;
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(): Promise<{
  available: boolean;
  client: 'local' | 'upstash' | 'none';
  latency?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Try local Redis first
    if (isLocalRedisConfigured()) {
      const client = await getLocalRedisClient();
      if (client) {
        await client.ping();
        const latency = Date.now() - startTime;
        return {
          available: true,
          client: 'local',
          latency,
        };
      }
    }

    // Try Upstash Redis
    if (isUpstashRedisConfigured()) {
      const client = getUpstashRedisClient();
      if (client) {
        await client.ping();
        const latency = Date.now() - startTime;
        return {
          available: true,
          client: 'upstash',
          latency,
        };
      }
    }

    return {
      available: false,
      client: 'none',
      error: 'No Redis configuration found',
    };
  } catch (error) {
    return {
      available: false,
      client: 'none',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gracefully close Redis connections
 */
export async function closeRedisConnections(): Promise<void> {
  console.log(`${LOG_PREFIX} Closing Redis connections...`);

  if (redisClient) {
    try {
      await redisClient.quit();
      redisClient = null;
      console.log(`${LOG_PREFIX} Local Redis connection closed`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error closing local Redis:`, error);
    }
  }

  // Upstash client doesn't need explicit closing
  upstashClient = null;
}

/**
 * Process exit handler to close connections
 */
process.on('SIGINT', async () => {
  await closeRedisConnections();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeRedisConnections();
  process.exit(0);
});
