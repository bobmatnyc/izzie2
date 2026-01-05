# Persistence Layer - Quick Start Guide

Get started with the memory persistence layer in 5 minutes.

## TL;DR

```typescript
import { enhancedMemoryService } from '@/lib/memory/enhanced';

// Store a memory (auto-extracts entities, writes to both stores)
const memory = await enhancedMemoryService.store(
  {
    userId: 'user-123',
    content: 'Meeting with John about Q4 roadmap',
    metadata: { source: 'email' },
  },
  { importance: 8 }
);

// Retrieve memories
const memories = await enhancedMemoryService.retrieve(
  'user-123',
  'roadmap planning',
  { limit: 10 }
);

// Check health
const health = await enhancedMemoryService.getHealth();
console.log('Status:', health.status);
```

## Common Tasks

### 1. Store a Memory with Entity Extraction

```typescript
import { enhancedMemoryService } from '@/lib/memory/enhanced';

const memory = await enhancedMemoryService.store(
  {
    userId: 'user-123',
    content: 'Had a great meeting with Alice from Acme Corp about the new product launch in San Francisco.',
    metadata: { source: 'email', emailId: 'msg-456' },
  },
  {
    conversationId: 'conv-789',
    importance: 8,
    summary: 'Product launch discussion',
    extractEntities: true, // Default: true
  }
);

// Entities are automatically extracted and stored in Neo4j graph:
// - Person: Alice
// - Company: Acme Corp
// - Project: product launch
// - Location: San Francisco
```

### 2. Retrieve Memories by Semantic Search

```typescript
const memories = await enhancedMemoryService.retrieve(
  'user-123',
  'product launch planning',
  {
    limit: 10,
    threshold: 0.7, // Similarity threshold (0-1)
    minImportance: 5, // Filter by importance
  }
);

memories.forEach(mem => {
  console.log(`${mem.content} (similarity: ${mem.metadata.similarity})`);
});
```

### 3. Update a Memory

```typescript
await enhancedMemoryService.update('memory-id', {
  content: 'Updated: Meeting rescheduled to next week',
  importance: 9,
  extractEntities: true, // Re-extract entities
});
```

### 4. Delete a Memory

```typescript
// Soft delete (default)
await enhancedMemoryService.delete('memory-id');

// Hard delete with graph cleanup
await enhancedMemoryService.delete('memory-id', {
  hard: true,
  cascadeGraph: true,
});
```

### 5. Check System Health

```typescript
const health = await enhancedMemoryService.getHealth();

console.log('Overall status:', health.status); // 'healthy' | 'degraded' | 'unhealthy'
console.log('Vector store:', health.stores.vectorStore.healthy);
console.log('Graph store:', health.stores.graphStore.healthy);
console.log('Total memories:', health.metrics.totalMemories);
console.log('Sync percentage:', health.metrics.syncPercentage, '%');
```

### 6. Run Sync Operations

```typescript
import { syncService } from '@/lib/persistence/sync';

// Check for inconsistencies
const inconsistencies = await syncService.checkConsistency({ limit: 100 });
console.log(`Found ${inconsistencies.length} inconsistencies`);

// Repair inconsistencies
if (inconsistencies.length > 0) {
  const result = await syncService.repairInconsistencies(inconsistencies);
  console.log(`Repaired: ${result.repaired}, Failed: ${result.failed}`);
}

// Or do it all in one step
const fullResult = await syncService.fullSync({ limit: 1000 });
```

## API Endpoints

### Health Check

```bash
curl http://localhost:3000/api/persistence/status
```

### Trigger Sync

```bash
# Check only (dry run)
curl -X POST http://localhost:3000/api/persistence/sync \
  -H "Content-Type: application/json" \
  -d '{"operation": "check", "limit": 100, "dryRun": true}'

# Full sync (check + repair)
curl -X POST http://localhost:3000/api/persistence/sync \
  -H "Content-Type: application/json" \
  -d '{"operation": "full", "limit": 100}'
```

### Get Sync Stats

```bash
curl http://localhost:3000/api/persistence/sync
```

## Configuration

### Default Configuration (Recommended)

```typescript
{
  enableVectorStore: true,
  enableGraphStore: true,
  rollbackOnPartialFailure: false, // Continue even if graph fails
  retryAttempts: 3,
  retryDelayMs: 1000,
}
```

### Custom Configuration

```typescript
import { PersistenceService } from '@/lib/persistence';

const customPersistence = new PersistenceService({
  rollbackOnPartialFailure: true, // Rollback if graph fails
  retryAttempts: 5,
});
```

## Troubleshooting

### Graph writes failing

**Symptom**: Health check shows graph store unhealthy

**Solution**:
```typescript
const health = await enhancedMemoryService.getHealth();

if (!health.stores.graphStore.healthy) {
  // Check Neo4j configuration
  console.log('Neo4j error:', health.stores.graphStore.error);

  // System will continue using vector store only
  // Run sync later to fix graph data
}
```

### Low sync percentage

**Symptom**: Sync percentage < 90%

**Solution**:
```typescript
import { syncService } from '@/lib/persistence/sync';

// Run full sync
const result = await syncService.fullSync({ limit: 1000 });
console.log(`Repaired ${result.repaired} inconsistencies`);
```

### Performance issues

**Symptom**: Slow write operations

**Solution**:
```typescript
// Disable entity extraction for bulk operations
await enhancedMemoryService.store(entry, {
  extractEntities: false, // Skip extraction for speed
  importance: 3,
});
```

## Best Practices

### 1. Always Check Health in Production

```typescript
// Monitor health regularly
setInterval(async () => {
  const health = await enhancedMemoryService.getHealth();

  if (health.status !== 'healthy') {
    // Alert ops team
    console.error('Persistence layer unhealthy:', health);
  }

  if (health.metrics.syncPercentage < 90) {
    // Run sync
    await syncService.fullSync({ limit: 1000 });
  }
}, 60000); // Every minute
```

### 2. Use Importance Scores

```typescript
// High importance: meetings, decisions, key information
await enhancedMemoryService.store(entry, { importance: 9 });

// Medium importance: regular emails, notes
await enhancedMemoryService.store(entry, { importance: 5 });

// Low importance: spam, automated messages
await enhancedMemoryService.store(entry, { importance: 2 });
```

### 3. Provide Summaries

```typescript
await enhancedMemoryService.store(entry, {
  summary: 'Q4 planning meeting with product team',
  importance: 8,
});
```

### 4. Use Conversation IDs

```typescript
// Group related memories
await enhancedMemoryService.store(entry, {
  conversationId: 'conv-789',
});

// Later, retrieve by conversation
const memories = await enhancedMemoryService.retrieve(
  'user-123',
  'query',
  { conversationId: 'conv-789' }
);
```

### 5. Handle Errors Gracefully

```typescript
try {
  const memory = await enhancedMemoryService.store(entry, options);
} catch (error) {
  if (error instanceof VectorStoreError) {
    // Critical: vector store failed
    console.error('Vector store error:', error);
    // Alert ops team
  } else if (error instanceof GraphStoreError) {
    // Non-critical: graph store failed
    console.warn('Graph store error (will sync later):', error);
    // Continue operation
  }
}
```

## Next Steps

- Read the [full documentation](./README.md)
- Explore the [API reference](./README.md#api-endpoints)
- Check out [advanced patterns](./README.md#best-practices)

## Getting Help

- Check health: `GET /api/persistence/status`
- View sync status: `GET /api/persistence/sync`
- Read logs: Look for `[Persistence]`, `[Sync]`, `[EnhancedMemory]` prefixes
- Review code: `src/lib/persistence/`

---

**Questions?** See the [full documentation](./README.md) or check the implementation in `src/lib/persistence/index.ts`.
