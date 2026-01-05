# Memory Persistence Layer

A unified persistence service that coordinates dual-write operations between Postgres/pgvector (vector storage) and Neo4j (graph storage) for the Izzie2 memory system.

## Overview

The persistence layer ensures data consistency across two storage systems:

- **Postgres/pgvector**: Vector embeddings for semantic search
- **Neo4j**: Knowledge graph for entity relationships

### Key Features

- ✅ **Dual-write coordination**: Atomic writes to both stores
- ✅ **Transaction-like semantics**: Rollback support on partial failures (configurable)
- ✅ **Automatic entity extraction**: Integrates with entity extractor
- ✅ **Sync and recovery**: Detect and repair inconsistencies
- ✅ **Health monitoring**: Check store availability and sync status
- ✅ **Graceful degradation**: Continues if one store fails (configurable)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Memory Service                        │
│                  (Enhanced Version)                     │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Persistence Service                        │
│  - Dual-write coordination                              │
│  - Error handling & rollback                            │
│  - Inconsistency logging                                │
└──────────────┬────────────────────────┬─────────────────┘
               │                        │
       ┌───────▼────────┐       ┌──────▼──────────┐
       │  Vector Store  │       │  Graph Store    │
       │  (pgvector)    │       │  (Neo4j)        │
       │  - Embeddings  │       │  - Entities     │
       │  - Memories    │       │  - Relationships│
       └────────────────┘       └─────────────────┘
```

## Usage

### Basic Operations

#### Store a Memory

```typescript
import { enhancedMemoryService } from '@/lib/memory/enhanced';

const memory = await enhancedMemoryService.store(
  {
    userId: 'user-123',
    content: 'Meeting with John about Q4 roadmap',
    metadata: { source: 'email' },
  },
  {
    conversationId: 'conv-456',
    importance: 8,
    summary: 'Q4 planning meeting',
    extractEntities: true, // Auto-extract entities
  }
);
```

#### Retrieve Memories

```typescript
const memories = await enhancedMemoryService.retrieve(
  'user-123',
  'roadmap planning',
  {
    limit: 10,
    threshold: 0.7,
  }
);
```

#### Update a Memory

```typescript
await enhancedMemoryService.update('memory-id', {
  content: 'Updated content',
  importance: 9,
  extractEntities: true,
});
```

#### Delete a Memory

```typescript
// Soft delete (default)
await enhancedMemoryService.delete('memory-id');

// Hard delete with graph cascade
await enhancedMemoryService.delete('memory-id', {
  hard: true,
  cascadeGraph: true,
});
```

### Direct Persistence Layer Access

For advanced use cases, you can use the persistence service directly:

```typescript
import { persistenceService } from '@/lib/persistence';

const result = await persistenceService.store({
  userId: 'user-123',
  content: 'Important note',
  embedding: [0.1, 0.2, ...], // 1536-dim vector
  entities: [
    {
      type: 'person',
      value: 'John Doe',
      normalized: 'john_doe',
      confidence: 0.95,
      source: 'body',
    },
  ],
});

console.log('Vector write:', result.metadata?.vectorWriteSuccess);
console.log('Graph write:', result.metadata?.graphWriteSuccess);
```

### Sync and Recovery

#### Check Consistency

```typescript
import { syncService } from '@/lib/persistence/sync';

const inconsistencies = await syncService.checkConsistency({
  userId: 'user-123',
  limit: 100,
});

console.log(`Found ${inconsistencies.length} inconsistencies`);
```

#### Repair Inconsistencies

```typescript
const result = await syncService.repairInconsistencies(inconsistencies);

console.log(`Repaired: ${result.repaired}`);
console.log(`Failed: ${result.failed}`);
```

#### Full Sync

```typescript
// Check and repair
const syncResult = await syncService.fullSync({
  userId: 'user-123',
  limit: 100,
  dryRun: false,
});

// Dry run (check only)
const dryRunResult = await syncService.fullSync({
  limit: 100,
  dryRun: true,
});
```

#### Rebuild Graph

```typescript
// Rebuild entire graph from vector store
const rebuildResult = await syncService.rebuildGraph({
  limit: 1000,
  clearExisting: true, // WARNING: Deletes all graph data first
});
```

### Health Monitoring

```typescript
const health = await enhancedMemoryService.getHealth();

console.log('Status:', health.status); // 'healthy' | 'degraded' | 'unhealthy'
console.log('Vector store:', health.stores.vectorStore.healthy);
console.log('Graph store:', health.stores.graphStore.healthy);
console.log('Sync percentage:', health.metrics.syncPercentage);
```

## API Endpoints

### GET /api/persistence/status

Get persistence layer health status.

**Response:**
```json
{
  "status": "healthy",
  "stores": {
    "vectorStore": {
      "available": true,
      "healthy": true,
      "lastCheck": "2025-01-05T12:00:00Z"
    },
    "graphStore": {
      "available": true,
      "healthy": true,
      "lastCheck": "2025-01-05T12:00:00Z"
    }
  },
  "metrics": {
    "totalMemories": 1000,
    "vectorStoreCount": 1000,
    "graphStoreCount": 950,
    "syncPercentage": 95
  },
  "sync": {
    "vectorStoreCount": 1000,
    "graphStoreCount": 950,
    "syncPercentage": 95
  }
}
```

### POST /api/persistence/sync

Trigger sync operation.

**Request:**
```json
{
  "operation": "full",
  "userId": "user-123",
  "limit": 100,
  "dryRun": false
}
```

**Operations:**
- `check` - Check for inconsistencies only
- `repair` - Check and repair inconsistencies
- `full` - Full sync (check + repair)
- `rebuild` - Rebuild graph from vector store

**Response:**
```json
{
  "status": "success",
  "operation": "full",
  "result": {
    "totalChecked": 100,
    "inconsistencies": [],
    "repaired": 5,
    "failed": 0,
    "duration": 1234
  }
}
```

### GET /api/persistence/sync

Get sync statistics.

**Response:**
```json
{
  "status": "success",
  "stats": {
    "vectorStoreCount": 1000,
    "graphStoreCount": 950,
    "syncPercentage": 95
  }
}
```

## Configuration

### Persistence Config

```typescript
import { PersistenceService } from '@/lib/persistence';

const customPersistence = new PersistenceService({
  enableVectorStore: true,
  enableGraphStore: true,
  enableAutoSync: false,
  syncIntervalMs: undefined, // Auto-sync disabled
  rollbackOnPartialFailure: false, // Don't rollback if graph fails
  retryAttempts: 3,
  retryDelayMs: 1000,
});
```

### Default Configuration

```typescript
{
  enableVectorStore: true,
  enableGraphStore: true,
  enableAutoSync: false,
  rollbackOnPartialFailure: false, // Graph failures are non-critical
  retryAttempts: 3,
  retryDelayMs: 1000
}
```

## Error Handling

The persistence layer provides specific error types:

```typescript
import {
  PersistenceError,
  VectorStoreError,
  GraphStoreError,
  SyncError,
} from '@/lib/persistence/types';

try {
  await persistenceService.store(request);
} catch (error) {
  if (error instanceof VectorStoreError) {
    console.error('Vector write failed:', error.details);
  } else if (error instanceof GraphStoreError) {
    console.error('Graph write failed:', error.details);
  }
}
```

## Best Practices

### 1. Use Enhanced Memory Service

For most use cases, use `enhancedMemoryService` instead of direct persistence calls:

```typescript
// ✅ Recommended
import { enhancedMemoryService } from '@/lib/memory/enhanced';
await enhancedMemoryService.store(entry, options);

// ⚠️ Advanced use cases only
import { persistenceService } from '@/lib/persistence';
await persistenceService.store(request);
```

### 2. Enable Entity Extraction

Automatic entity extraction enables graph features:

```typescript
await enhancedMemoryService.store(entry, {
  extractEntities: true, // Default: true
});
```

### 3. Monitor Health

Check health regularly in production:

```typescript
const health = await enhancedMemoryService.getHealth();

if (health.status === 'unhealthy') {
  // Alert ops team
}

if (health.metrics.syncPercentage < 90) {
  // Run sync operation
  await syncService.fullSync({ limit: 1000 });
}
```

### 4. Handle Partial Failures Gracefully

The persistence layer logs inconsistencies but doesn't fail operations by default:

```typescript
const result = await persistenceService.store(request);

if (!result.metadata?.graphWriteSuccess) {
  console.warn('Graph write failed, will sync later');
  // Memory is still stored in vector store
}
```

### 5. Regular Sync Operations

Schedule periodic sync checks:

```typescript
// Daily sync job
async function dailySyncJob() {
  const result = await syncService.fullSync({
    limit: 10000,
    dryRun: false,
  });

  console.log(`Sync complete: ${result.repaired} repaired, ${result.failed} failed`);
}
```

## Migration Guide

### From Old Memory Service

```typescript
// OLD
import { memoryService } from '@/lib/memory';
await memoryService.store(entry, options);

// NEW (with persistence layer)
import { enhancedMemoryService } from '@/lib/memory/enhanced';
await enhancedMemoryService.store(entry, options);
```

The API is compatible, but the enhanced version provides:
- Better error handling
- Automatic entity extraction
- Health monitoring
- Sync capabilities

### Initial Setup

1. **Run health check**:
   ```bash
   curl http://localhost:3000/api/persistence/status
   ```

2. **Check sync status**:
   ```bash
   curl http://localhost:3000/api/persistence/sync
   ```

3. **Run initial sync** (if needed):
   ```bash
   curl -X POST http://localhost:3000/api/persistence/sync \
     -H "Content-Type: application/json" \
     -d '{"operation": "check", "limit": 100, "dryRun": true}'
   ```

## Troubleshooting

### Graph writes failing

Check Neo4j connection:
```typescript
const health = await enhancedMemoryService.getHealth();
console.log('Graph store:', health.stores.graphStore);
```

If Neo4j is unavailable, the system will:
- Continue storing to vector store
- Log graph write failures
- Allow repair later via sync

### Low sync percentage

Run a sync operation:
```typescript
const result = await syncService.fullSync({ limit: 1000 });
console.log(`Repaired ${result.repaired} inconsistencies`);
```

### Vector store errors

Check database connection and pgvector extension:
```sql
-- Verify pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Check memory entries table
SELECT COUNT(*) FROM memory_entries;
```

## Performance Considerations

### Write Performance

- Vector writes: ~50-100ms (database + embedding)
- Graph writes: ~20-50ms (Neo4j writes)
- Entity extraction: ~200-500ms (AI extraction)

**Total write latency**: ~270-650ms with entity extraction

**Optimization**:
```typescript
// Skip entity extraction for low-importance memories
await enhancedMemoryService.store(entry, {
  extractEntities: false, // Skip for faster writes
  importance: 3,
});
```

### Sync Performance

- Consistency check: ~10-50ms per memory
- Repair operation: ~50-200ms per inconsistency

**Recommendation**: Run sync operations during low-traffic periods.

## Future Enhancements

- [ ] Auto-sync scheduler (background job)
- [ ] Retry queue for failed writes
- [ ] Metrics collection (Prometheus/Grafana)
- [ ] Conflict resolution strategies
- [ ] Batch write optimization
- [ ] Incremental sync (delta-based)

## Related Documentation

- [Vector Operations](../db/vectors.ts) - Vector store implementation
- [Graph Builder](../graph/graph-builder.ts) - Graph operations
- [Entity Extraction](../extraction/entity-extractor.ts) - Entity extraction
- [Memory Service](./index.ts) - Original memory service
