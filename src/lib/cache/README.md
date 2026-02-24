# Redis Cache System - Izzie2

Comprehensive Redis caching infrastructure with intelligent invalidation, multiple cache layers, and performance optimization.

## Overview

The cache system provides:
- **Session Caching**: Authentication and chat sessions (5-30 min TTL)
- **AI Response Caching**: LLM responses and embeddings (24-hour TTL)
- **Database Query Caching**: Expensive DB operations (5-10 min TTL)
- **API Response Caching**: Middleware for automatic endpoint caching
- **Sync Status Management**: Replacing in-memory sync status storage

## Quick Start

### 1. Environment Setup

Configure Redis connection (choose one):

```bash
# Local Redis
REDIS_URL=redis://localhost:6379

# Or individual Redis settings
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0

# Or Upstash Redis (production)
UPSTASH_REDIS_REST_URL=https://your-cluster.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token
```

### 2. Basic Usage

```typescript
import { getCacheService, getSessionCacheService } from '@/lib/cache';

// Basic caching
const cache = getCacheService();
await cache.set('key', { data: 'value' }, 300); // 5 minutes
const value = await cache.get('key');

// Session caching
const sessionCache = getSessionCacheService();
const session = await sessionCache.getUserSession(request);
```

### 3. API Middleware

```typescript
import { createAPICacheMiddleware, APICacheConfigs } from '@/lib/cache';

// Add caching to API routes
const withCache = createAPICacheMiddleware(APICacheConfigs.mediumTerm);

async function handler(request: NextRequest): Promise<NextResponse> {
  // Your API logic
  return NextResponse.json(data);
}

export const GET = withCache(handler);
```

## Architecture

### Cache Layers

1. **Redis Client** (`redis-client.ts`)
   - Supports both local Redis and Upstash
   - Connection pooling and error handling
   - Health monitoring and graceful fallback

2. **Core Cache Service** (`cache-service.ts`)
   - High-level caching interface
   - Memory fallback when Redis unavailable
   - Statistics tracking and TTL management

3. **Specialized Cache Services**
   - **Session Cache** - Authentication and chat sessions
   - **AI Cache** - LLM responses with cost tracking
   - **DB Cache** - Database query results with invalidation
   - **API Cache** - Automatic response caching middleware

4. **Cache Key Management** (`cache-keys.ts`)
   - Hierarchical key structure for easy invalidation
   - Consistent naming patterns across services
   - Pattern-based bulk invalidation

### Performance Targets

- **30-50% response time reduction** for cached endpoints
- **60-80% database query load reduction** for repeated queries
- **Cost savings** on AI API calls through intelligent caching
- **Graceful degradation** when Redis is unavailable

## Cache TTL Configuration

```typescript
import { CACHE_TTL } from '@/lib/cache';

// Pre-configured TTL constants
CACHE_TTL.SESSION         // 5 minutes
CACHE_TTL.CHAT_SESSION    // 30 minutes
CACHE_TTL.AI_RESPONSE     // 24 hours
CACHE_TTL.AI_EMBEDDING    // 7 days
CACHE_TTL.DB_QUERY        // 10 minutes
CACHE_TTL.API_MEDIUM      // 5 minutes
```

## Usage Examples

### Session Caching

```typescript
import { getSessionCacheService } from '@/lib/cache';

const sessionCache = getSessionCacheService();

// Cache user session
const session = await sessionCache.getUserSession(request);

// Cache chat session
const chatSession = await sessionCache.getChatSession(sessionId);

// Update session and cache
await sessionCache.updateChatSession(updatedSession);
```

### AI Response Caching

```typescript
import { getAICacheService } from '@/lib/cache';

const aiCache = getAICacheService();

// Check cache before expensive AI call
const cached = await aiCache.getResponse(prompt, model);
if (cached) {
  return cached.response;
}

// Make AI call and cache result
const response = await makeAICall(prompt);
await aiCache.cacheResponse(prompt, response, {
  model,
  tokens: { prompt: 100, completion: 200, total: 300 },
  cost: 0.005,
});
```

### Database Query Caching

```typescript
import { getDBCacheService } from '@/lib/cache';

const dbCache = getDBCacheService();

// Cache wrapper for database operations
const entities = await dbCache.withCache(
  `entities:user:${userId}`,
  () => database.getEntities(userId),
  { ttl: 600, userId, tags: ['entities'] }
);

// Manual cache management
await dbCache.cacheContacts(userId, contacts);
const cachedContacts = await dbCache.getCachedContacts(userId);
```

### API Response Middleware

```typescript
import { withAPICache, APICacheConfigs } from '@/lib/cache';

// Simple caching
export const GET = withAPICache(APICacheConfigs.mediumTerm)(handler);

// Custom caching configuration
export const GET = withAPICache({
  ttl: 300,
  userSpecific: true,
  keyGenerator: (request, userId) => `custom:${userId}:${request.url}`,
})(handler);
```

## Cache Invalidation

### Automatic Invalidation

```typescript
import { CacheInvalidation } from '@/lib/cache';

// Invalidate all user cache
await CacheInvalidation.invalidateUser(userId);

// Invalidate on data changes
await CacheInvalidation.onDataChange('contact', userId);
```

### Manual Invalidation

```typescript
import { getCacheService, InvalidationPatterns } from '@/lib/cache';

const cache = getCacheService();

// Pattern-based invalidation
await cache.invalidatePattern(InvalidationPatterns.user(userId));
await cache.invalidatePattern(`*entities*`);

// Specific key deletion
await cache.delete('specific:cache:key');
```

## Monitoring and Health

### Health Check API

```bash
# Get cache system health
GET /api/cache/health

# Response includes:
{
  "health": {
    "healthy": true,
    "redis": true,
    "cache": true,
    "details": { "latency": 15 }
  },
  "stats": {
    "hits": 1250,
    "misses": 380,
    "hitRate": 76.7,
    "errors": 0
  },
  "performance": {
    "estimatedTimeSaved": 187500,
    "estimatedCostSaved": 1.25
  }
}
```

### Testing API

```bash
# Comprehensive cache system test
POST /api/cache/test

# Tests all cache layers and returns detailed results
{
  "summary": {
    "success": true,
    "passed": 6,
    "failed": 0,
    "successRate": 100
  },
  "tests": {
    "redisHealth": { "passed": true },
    "basicCache": { "passed": true },
    "sessionCache": { "passed": true },
    "aiCache": { "passed": true },
    "dbCache": { "passed": true },
    "monitoring": { "passed": true }
  }
}
```

### Programmatic Monitoring

```typescript
import { CacheMonitor } from '@/lib/cache';

// Get comprehensive statistics
const stats = await CacheMonitor.getCacheStats();

// Check system health
const health = await CacheMonitor.healthCheck();

// Reset statistics
await CacheMonitor.resetStats();
```

## Production Deployment

### Upstash Redis Setup

1. Create Upstash Redis database
2. Set environment variables:
   ```bash
   UPSTASH_REDIS_REST_URL=https://your-cluster.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your_token
   ```

### Local Redis Setup

```bash
# Docker
docker run -d -p 6379:6379 redis:alpine

# Environment
REDIS_URL=redis://localhost:6379
```

### Performance Monitoring

Monitor these metrics in production:
- Cache hit rate (target: >70%)
- Redis latency (target: <50ms)
- Error rate (target: <1%)
- Memory usage
- Connection count

## Best Practices

### 1. Cache Key Design
- Use hierarchical keys: `service:type:user:id`
- Include version/hash for parameter-dependent data
- Keep keys short but descriptive

### 2. TTL Strategy
- **Session data**: 5-30 minutes
- **User-specific data**: 5-10 minutes
- **Static/reference data**: 1+ hours
- **AI responses**: 24+ hours
- **Embeddings**: 7+ days

### 3. Invalidation
- Use pattern-based invalidation for bulk updates
- Invalidate proactively on data changes
- Tag cache entries for complex invalidation scenarios

### 4. Error Handling
- Always provide fallback to non-cached data source
- Log cache errors but don't fail requests
- Monitor cache availability and performance

### 5. Testing
- Test cache hit/miss scenarios
- Validate invalidation logic
- Load test Redis under production conditions
- Monitor performance improvements

## Troubleshooting

### Common Issues

1. **Cache misses**: Check TTL configuration and key generation
2. **Redis connection errors**: Verify network connectivity and credentials
3. **Performance degradation**: Monitor Redis memory usage and connection pool
4. **Stale data**: Review invalidation patterns and TTL settings

### Debug Tools

```typescript
// Enable debug logging
process.env.DEBUG = 'cache:*';

// Manual cache inspection
const cache = getCacheService();
const stats = cache.getStats();
const health = await checkRedisHealth();
```

## Migration Notes

This cache system replaces:
- In-memory sync status storage → `SyncStatusCache`
- Manual caching in API routes → `createAPICacheMiddleware`
- Direct Redis usage → Centralized `getCacheService`

Existing code should migrate to use the new centralized services for consistency and improved error handling.