# Redis Caching Infrastructure

This document describes the comprehensive Redis caching infrastructure implemented for Izzie2 to improve performance and reduce database load.

## 🎯 Overview

The caching infrastructure provides multiple layers:

1. **Session Caching** - Authentication and chat session management
2. **AI Response Caching** - LLM responses, embeddings, and analysis results
3. **Database Query Caching** - Expensive database operations
4. **API Response Caching** - Middleware for automatic API response caching
5. **Sync Status Management** - Replaces in-memory storage with persistent Redis

## 🚀 Quick Start

### 1. Start Redis Locally

```bash
# Option 1: Start Redis with Docker Compose (recommended)
npm run redis:start

# Option 2: Start Redis and begin development
npm run dev:with-redis

# Option 3: Manual Docker Compose
docker-compose up -d redis
```

### 2. Configure Environment Variables

Add to your `.env.local`:

```bash
# Local Redis (preferred for development)
REDIS_URL=redis://localhost:6379

# OR use individual Redis settings:
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=
# REDIS_DB=0

# Keep Upstash Redis for production/staging
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxx
```

### 3. Verify Setup

```bash
# Check Redis connection and cache health
npm run cache:health

# View detailed cache statistics
npm run cache:stats

# View Redis logs
npm run redis:logs
```

## 📊 Performance Impact

**Expected improvements:**
- **30-50% reduction** in API response times
- **60-80% reduction** in database query load
- **Improved user experience** with faster page loads
- **Better scalability** for concurrent users
- **Cost savings** from reduced AI API calls

## 🏗️ Architecture

### Cache Hierarchy

```
┌─────────────────┐    ┌─────────────────┐
│   Application   │    │   Redis Cache   │
└─────────────────┘    └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│  Memory Cache   │    │   Upstash Redis │
│   (Fallback)    │    │  (Production)   │
└─────────────────┘    └─────────────────┘
```

### Cache Layers

1. **Redis Client Layer** (`redis-client.ts`)
   - Manages Redis connections (local + Upstash)
   - Connection pooling and error handling
   - Health checks and monitoring

2. **Cache Service Layer** (`cache-service.ts`)
   - High-level cache operations
   - Memory fallback when Redis unavailable
   - TTL management and statistics

3. **Specialized Cache Services**
   - Session cache (`session-cache.ts`)
   - AI response cache (`ai-cache.ts`)
   - Database query cache (`db-cache.ts`)
   - API response middleware (`api-cache-middleware.ts`)

## 💾 Cache Types and TTLs

| Cache Type | TTL | Use Case |
|------------|-----|----------|
| **Session Cache** | 5 min | Authentication sessions |
| **Chat Session Cache** | 30 min | Chat conversation data |
| **AI Response Cache** | 24 hours | LLM completions |
| **AI Embedding Cache** | 7 days | Vector embeddings |
| **Database Query Cache** | 10 min | Expensive DB operations |
| **Search Results Cache** | 5 min | Search and filtering |
| **API Response Cache** | 5-30 min | API endpoint responses |
| **Sync Status Cache** | 1 hour | Background job status |

## 🔧 Usage Examples

### Basic Cache Operations

```typescript
import { get, set, del } from '@/lib/cache';

// Basic cache operations
await set('user:123:profile', userData, 600); // 10 minutes
const userData = await get<UserProfile>('user:123:profile');
await del('user:123:profile');
```

### Session Caching

```typescript
import { getSessionCacheService } from '@/lib/cache';

const sessionCache = getSessionCacheService();

// Cache user session
const session = await sessionCache.getUserSession(request);

// Cache chat session
const chatSession = await sessionCache.getChatSession(sessionId);
```

### AI Response Caching

```typescript
import { getAICacheService } from '@/lib/cache';

const aiCache = getAICacheService();

// Check cache before expensive AI call
const cached = await aiCache.getResponse(prompt, 'gpt-4');
if (!cached) {
  const response = await callOpenAI(prompt);
  await aiCache.cacheResponse(prompt, response, {
    model: 'gpt-4',
    cost: 0.002,
    tokens: { prompt: 100, completion: 50, total: 150 }
  });
}
```

### Database Query Caching

```typescript
import { getDBCacheService } from '@/lib/cache';

const dbCache = getDBCacheService();

// Cache expensive database query
const contacts = await dbCache.withCache(
  'contacts:user:123',
  () => fetchContactsFromDB(userId),
  { ttl: 600, userId: '123' }
);
```

### API Route Caching

```typescript
import { withAPICache, APICacheConfigs } from '@/lib/cache';

// Apply caching to API route
const cachedHandler = withAPICache(APICacheConfigs.userSpecific);

export const GET = cachedHandler(async (request) => {
  // Your API logic here
  return NextResponse.json(data);
});
```

### Sync Status Management

```typescript
import { getSyncStatusCache } from '@/lib/cache';

const syncCache = getSyncStatusCache();

// Replace in-memory sync status with Redis
await syncCache.setSyncStatus('contacts', userId, {
  isRunning: true,
  startedAt: new Date(),
  progress: 50,
  message: 'Processing contacts...'
});

const status = await syncCache.getSyncStatus('contacts', userId);
```

## 🔑 Cache Key Strategy

Hierarchical cache keys for easy invalidation:

```typescript
// User-specific data
'izzie2:user:123:contacts'
'izzie2:user:123:sessions'

// AI responses
'izzie2:ai:response:hash123'
'izzie2:ai:embedding:hash456'

// Search results
'izzie2:search:contacts:user:123:hash789'

// API responses
'izzie2:api:user:123:endpoint:hash'
```

## 🗑️ Cache Invalidation

### Automatic Invalidation

Cache is automatically invalidated when related data changes:

```typescript
import { CacheInvalidation } from '@/lib/cache';

// Invalidate all user cache on data change
await CacheInvalidation.onDataChange('contact', userId);

// Invalidate specific cache patterns
await invalidatePattern(`*user:${userId}*`);
```

### Manual Invalidation

```typescript
import { getDBCacheInvalidationHooks } from '@/lib/cache';

const hooks = getDBCacheInvalidationHooks();

// After contact update
await hooks.onContactChange(userId);

// After entity update
await hooks.onEntityChange(userId);

// After relationship update
await hooks.onRelationshipChange(userId);
```

## 📈 Monitoring and Statistics

### Health Check Endpoint

```bash
# Get comprehensive cache health and stats
GET /api/cache/health

# Response includes:
{
  "health": {
    "healthy": true,
    "redis": true,
    "cache": true
  },
  "stats": {
    "hits": 1250,
    "misses": 180,
    "hitRate": 87.4
  },
  "performance": {
    "estimatedTimeSaved": 187500,
    "estimatedCostSaved": 1.25
  }
}
```

### AI Cache Statistics

```bash
# Get AI-specific cache statistics
GET /api/ai/analyze/stats

# Response includes cost savings from cached AI calls
{
  "stats": {
    "estimatedSavings": {
      "responseCalls": 750,
      "embeddingCalls": 500,
      "totalCostSaved": 12.50
    }
  }
}
```

### Monitor Cache Performance

```typescript
import { CacheMonitor } from '@/lib/cache';

// Get comprehensive statistics
const stats = await CacheMonitor.getCacheStats();

// Health check
const health = await CacheMonitor.healthCheck();

// Reset statistics
await CacheMonitor.resetStats();
```

## 🚨 Error Handling

The cache infrastructure implements graceful fallbacks:

1. **Redis Unavailable**: Falls back to memory cache
2. **Memory Cache Full**: LRU eviction with size limits
3. **Cache Errors**: Operations continue without caching
4. **Network Issues**: Automatic retry with backoff

```typescript
// Cache operations never throw - they degrade gracefully
const data = await get('key'); // Returns null if Redis unavailable
await set('key', value); // Fails silently, logs error
```

## 🧪 Testing Cache Integration

### Test API Routes with Caching

```bash
# Test contacts sync with Redis status (previously in-memory)
POST /api/contacts/sync
GET /api/contacts/sync  # Check cached sync status

# Test AI analysis with caching
POST /api/ai/analyze
# { "text": "Test analysis", "useCache": true }

# Test cache health
GET /api/cache/health
```

### Load Testing

```bash
# Start Redis and app
npm run dev:with-redis

# Run concurrent requests to test cache performance
# Cache should show significant hit ratio improvement
```

## 🔧 Troubleshooting

### Common Issues

1. **Redis Connection Issues**
   ```bash
   npm run redis:logs
   docker-compose ps
   ```

2. **Cache Not Working**
   ```bash
   # Check Redis is running
   npm run cache:health

   # Verify environment variables
   echo $REDIS_URL
   ```

3. **Performance Issues**
   ```bash
   # Monitor cache hit rates
   npm run cache:stats

   # Check Redis memory usage
   docker-compose exec redis redis-cli info memory
   ```

### Cache Configuration

Adjust cache settings in `/Users/masa/Projects/izzie2/docker/redis.conf`:

```bash
# Memory limit
maxmemory 512mb

# Eviction policy
maxmemory-policy allkeys-lru

# Persistence (disable for pure cache)
save ""
appendonly no
```

## 🔄 Migration from In-Memory Storage

Several API routes have been updated to use Redis instead of in-memory storage:

- `/api/contacts/sync` - Sync status now persistent across requests
- `/api/gmail/sync` - Similar pattern can be applied
- `/api/calendar/sync` - Similar pattern can be applied
- `/api/drive/sync` - Similar pattern can be applied

## 🚀 Deployment

### Local Development
- Uses Docker Compose Redis
- Memory fallback when Redis unavailable
- Full caching features enabled

### Production
- Uses Upstash Redis (configured via env vars)
- Local Redis preferred if both configured
- Monitoring and alerting recommended

### Environment Variables

```bash
# Development
REDIS_URL=redis://localhost:6379

# Production
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

## 📚 API Reference

See the individual cache service files for detailed API documentation:

- **Core**: `/src/lib/cache/cache-service.ts`
- **Sessions**: `/src/lib/cache/session-cache.ts`
- **AI Responses**: `/src/lib/cache/ai-cache.ts`
- **Database**: `/src/lib/cache/db-cache.ts`
- **API Middleware**: `/src/lib/cache/api-cache-middleware.ts`

## 🎉 Benefits Realized

With this caching infrastructure, Izzie2 now provides:

✅ **Session Management**: Fast authentication and chat session retrieval
✅ **AI Cost Savings**: Cached LLM responses reduce API costs
✅ **Database Performance**: Reduced load on expensive queries
✅ **API Speed**: Automatic response caching for frequent endpoints
✅ **Sync Reliability**: Persistent sync status across server restarts
✅ **Development Experience**: Easy local Redis setup with Docker
✅ **Production Ready**: Upstash integration for cloud deployment
✅ **Monitoring**: Comprehensive health checks and performance metrics