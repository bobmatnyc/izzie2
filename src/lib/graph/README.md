# Neo4j Graph Module

Neo4j knowledge graph integration for building and querying entity relationships from email extractions.

## Overview

This module builds a knowledge graph from entity extraction results, creating nodes for entities (people, companies, projects, topics, locations) and relationships between them (works with, collaborates on, discussed topics, etc.).

## Architecture

```
src/lib/graph/
├── types.ts              # Graph node/relationship type definitions
├── neo4j-client.ts       # Neo4j driver wrapper (singleton)
├── graph-builder.ts      # Build graph from entity extractions
├── graph-queries.ts      # Common query patterns
├── index.ts              # Module exports
└── README.md             # This file
```

## Setup

### 1. Install Dependencies

Dependencies are already installed via `package.json`:
- `neo4j-driver` - Official Neo4j driver
- `mem0ai` - Memory system with graph integration

### 2. Configure Neo4j

Set environment variables in `.env.local`:

```bash
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=xxxxx
```

**Recommended**: Use [Neo4j Aura Free Tier](https://neo4j.com/cloud/aura-free/) (200MB storage, 1GB RAM)

### 3. Initialize Graph

```typescript
import { initializeGraph } from '@/lib/graph';

// Creates indexes for performance
await initializeGraph();
```

## Graph Schema

### Node Types

- **Person**: People mentioned in emails (normalized name, email, frequency)
- **Company**: Organizations (normalized name, domain, frequency)
- **Project**: Projects or initiatives (normalized name, status, frequency)
- **Topic**: Discussion topics (normalized name, category, frequency)
- **Location**: Places mentioned (normalized name, type, frequency)
- **Email**: Email messages (id, subject, timestamp, significance score)

### Relationship Types

- **MENTIONED_IN**: Entity → Email (confidence, source, context)
- **WORKS_WITH**: Person → Person (weight, co-occurrence count)
- **DISCUSSED_TOPIC**: Person → Topic (weight, frequency)
- **COLLABORATES_ON**: Person → Project (weight, role)
- **WORKS_FOR**: Person → Company (weight, current status)
- **RELATED_TO**: Topic → Topic (weight, co-occurrence)
- **LOCATED_AT**: Entity → Location (weight)

## Usage

### Building Graph from Extractions

```typescript
import { processExtraction, processBatch } from '@/lib/graph';
import type { ExtractionResult } from '@/lib/extraction/types';

// Process single extraction
const extraction: ExtractionResult = {
  emailId: 'msg-123',
  entities: [
    { type: 'person', value: 'John Doe', normalized: 'john_doe', confidence: 0.95, source: 'metadata' },
    { type: 'company', value: 'Acme Corp', normalized: 'acme_corp', confidence: 0.90, source: 'body' }
  ],
  extractedAt: new Date(),
  cost: 0.0003,
  model: 'mistral-small'
};

await processExtraction(extraction, {
  subject: 'Meeting Request',
  timestamp: new Date(),
  significanceScore: 0.8
});

// Process batch
const extractions: ExtractionResult[] = [...];
await processBatch(extractions);
```

### Querying Graph

```typescript
import {
  getEntityByName,
  getWorksWith,
  getProjectCollaborators,
  getTopicExperts,
  searchEntities
} from '@/lib/graph';

// Find person by name
const person = await getEntityByName('john_doe', 'Person');

// Get people who work with John
const colleagues = await getWorksWith('john_doe', 10);

// Find project collaborators
const team = await getProjectCollaborators('project_apollo', 20);

// Find topic experts
const experts = await getTopicExperts('ai_research', 10);

// Search entities
const results = await searchEntities('project', 'Project', 20);
```

### Graph Statistics

```typescript
import { neo4jClient } from '@/lib/graph';

const stats = await neo4jClient.getStats();
console.log(stats);
// {
//   nodeCount: 1234,
//   relationshipCount: 5678,
//   nodesByType: { Person: 450, Company: 123, ... },
//   relationshipsByType: { WORKS_WITH: 890, ... }
// }
```

## API Endpoints

### Test Endpoint

**GET `/api/graph/test`** - Verify Neo4j connection and test operations

```bash
curl http://localhost:3300/api/graph/test
```

Response:
```json
{
  "status": "success",
  "checks": {
    "configured": true,
    "connected": true,
    "initialized": true,
    "nodeCreation": true,
    "query": true,
    "relationships": true,
    "stats": true,
    "topEntities": true
  },
  "summary": {
    "passed": 8,
    "total": 8,
    "percentage": 100
  },
  "stats": { ... }
}
```

**DELETE `/api/graph/test`** - Clean up test data

### Build Endpoint

**POST `/api/graph/build`** - Build graph from extractions

Test mode (uses sample emails):
```bash
curl -X POST http://localhost:3300/api/graph/build \
  -H "Content-Type: application/json" \
  -d '{"mode": "test"}'
```

Production mode (with extraction results):
```bash
curl -X POST http://localhost:3300/api/graph/build \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "production",
    "extractions": [...],
    "emailMetadata": {...}
  }'
```

**GET `/api/graph/build`** - Get graph statistics

```bash
curl http://localhost:3300/api/graph/build
```

## Performance

### Query Performance Targets

- Simple entity lookup: < 10ms
- Relationship queries: < 20ms
- Complex traversals: < 100ms

### Indexes

Automatically created on:
- All entity `normalized` fields
- Email `id` and `timestamp`
- Entity `frequency` for sorting
- Email `significanceScore` for filtering

### Optimization

- **MERGE** pattern for atomic upserts (no duplicates)
- **Batch processing** for efficiency (100 entities per batch)
- **Connection pooling** (50 max connections)
- **Parameterized queries** for query plan caching

## Integration with Mem0

The graph integrates with Mem0 for hybrid retrieval (semantic + graph):

```typescript
import { MemoryService } from '@/lib/memory';

const memory = new MemoryService();

// Hybrid search (semantic + graph)
const results = await memory.hybridSearch(
  'user-123',
  'Who works on Project Apollo?',
  { limit: 10, includeGraph: true }
);

console.log(results.combined); // Merged semantic + graph results
```

## Incremental Updates

The graph supports incremental updates without duplication:

```typescript
// Adding same entity twice increments frequency
await createEntityNode(entity, 'email-1'); // frequency: 1
await createEntityNode(entity, 'email-2'); // frequency: 2

// Relationships accumulate weight
await createCoOccurrence(person1, person2, 'email-1'); // weight: 1
await createCoOccurrence(person1, person2, 'email-2'); // weight: 2
```

## Error Handling

All operations include error handling:

- Connection failures return meaningful errors
- Missing configuration returns warnings
- Query errors are logged with context
- Graceful degradation when Neo4j is not configured

Example:
```typescript
if (!neo4jClient.isConfigured()) {
  console.warn('[Graph] Neo4j not configured');
  return; // Graceful degradation
}
```

## Common Patterns

### Find People Working on a Project

```cypher
MATCH (p:Person)-[c:COLLABORATES_ON]->(proj:Project {normalized: 'project_apollo'})
RETURN p.name, c.role, c.weight
ORDER BY c.weight DESC
```

### Find Related Topics

```cypher
MATCH (t1:Topic {normalized: 'ai_research'})-[r:RELATED_TO]-(t2:Topic)
RETURN t2.name, r.weight
ORDER BY r.weight DESC
LIMIT 10
```

### Get Email Context

```cypher
MATCH (entity)-[:MENTIONED_IN]->(e:Email {id: 'msg-123'})
RETURN labels(entity)[0] as type, entity.name
```

## Troubleshooting

### Connection Issues

```bash
# Verify Neo4j credentials
curl -X GET \
  -u neo4j:password \
  https://xxxxx.databases.neo4j.io
```

### Check Graph Status

```typescript
import { neo4jClient } from '@/lib/graph';

const connected = await neo4jClient.verifyConnection();
console.log('Connected:', connected);

const stats = await neo4jClient.getStats();
console.log('Graph stats:', stats);
```

### Clear All Data (Development Only)

```typescript
// WARNING: Deletes all nodes and relationships
await neo4jClient.clearAll();
```

## Next Steps

1. Set up Neo4j Aura account
2. Configure environment variables
3. Run test endpoint to verify connection
4. Build graph from sample emails
5. Query graph with provided utilities
6. Integrate with Mem0 for hybrid search

## Resources

- [Neo4j JavaScript Driver Manual](https://neo4j.com/docs/javascript-manual/current/)
- [Cypher Query Language](https://neo4j.com/docs/cypher-manual/current/)
- [Mem0 Graph Memory](https://docs.mem0.ai/open-source/features/graph-memory)
- [Neo4j Aura Free Tier](https://neo4j.com/cloud/aura-free/)
