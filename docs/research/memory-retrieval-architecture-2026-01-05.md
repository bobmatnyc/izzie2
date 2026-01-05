# Memory and Retrieval Architecture Research

**Date**: 2026-01-05
**Researcher**: Claude (Research Agent)
**Purpose**: Comprehensive analysis of izzie2's memory and retrieval implementation to inform benchmark design
**Related Ticket**: #17 (Hybrid Retrieval Optimization)

---

## Executive Summary

The izzie2 project implements a sophisticated **hybrid retrieval system** combining:
- **Vector similarity search** via pgvector (Neon Postgres) with 1536-dimensional embeddings
- **Graph traversal** via Neo4j for entity relationships
- **Weighted ranking** with configurable scoring strategies
- **Query parsing** for intent detection and adaptive retrieval strategies

The system is production-ready with performance targets of <500ms P95 latency and includes caching, parallel execution, and result deduplication.

---

## 1. Architecture Overview

### 1.1 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                  Memory Service Layer                        │
│  - MemoryService (src/lib/memory/index.ts)                  │
│  - EnhancedMemoryService (src/lib/memory/enhanced.ts)       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               Hybrid Retrieval Service                       │
│  - RetrievalService (src/lib/retrieval/index.ts)            │
│  - Query Parser (src/lib/retrieval/parser.ts)               │
│  - Ranker (src/lib/retrieval/ranker.ts)                     │
│  - Cache (src/lib/retrieval/cache.ts)                       │
└─────────────────────────────────────────────────────────────┘
              │                                    │
              ▼                                    ▼
┌─────────────────────────┐        ┌─────────────────────────┐
│   Vector Operations     │        │   Graph Queries         │
│ (src/lib/db/vectors.ts) │        │ (src/lib/graph/*.ts)    │
│                         │        │                         │
│ - Neon Postgres         │        │ - Neo4j                 │
│ - pgvector extension    │        │ - Cypher queries        │
│ - Cosine similarity     │        │ - Entity relationships  │
└─────────────────────────┘        └─────────────────────────┘
```

### 1.2 Key Features

1. **Dual Storage System**
   - **Vector Store**: Neon Postgres with pgvector for semantic search
   - **Graph Store**: Neo4j for entity relationships and co-occurrences

2. **Smart Query Routing**
   - Intent detection (factual, relational, temporal, exploratory, semantic)
   - Adaptive weight adjustment based on query type
   - Entity and keyword extraction

3. **Parallel Execution**
   - Concurrent vector and graph searches
   - ~40% latency reduction vs sequential

4. **Result Optimization**
   - Weighted ranking with multiple scoring signals
   - Deduplication across sources
   - LRU caching with 5-minute TTL

---

## 2. Database Schema

### 2.1 Vector Storage (Neon Postgres)

**Table**: `memory_entries`

```typescript
{
  id: uuid (PK)
  userId: uuid (FK -> users.id)
  conversationId: uuid (FK -> conversations.id, nullable)

  // Content
  content: text (NOT NULL)
  summary: text (nullable)
  metadata: jsonb (nullable)

  // Vector embedding (1536 dimensions)
  embedding: vector(1536) (nullable)

  // Scoring
  importance: integer (1-10 scale, default: 5)
  accessCount: integer (default: 0)
  lastAccessedAt: timestamp (nullable)

  // Soft delete
  isDeleted: boolean (default: false)

  // Timestamps
  createdAt: timestamp (NOT NULL)
  updatedAt: timestamp (NOT NULL)
}
```

**Indexes**:
- B-tree indexes: `userId`, `conversationId`, `createdAt`, `importance`
- **Vector index**: IVFFlat on `embedding` with `vector_cosine_ops`
  - Created via migration SQL (not in Drizzle schema)
  - Formula: `CREATE INDEX ON memory_entries USING ivfflat (embedding vector_cosine_ops)`

**Embedding Model**: OpenAI `text-embedding-3-small` (1536 dimensions)

### 2.2 Graph Storage (Neo4j)

**Node Types**:

1. **Person**
   ```cypher
   {
     name: string,
     normalized: string (key),
     email: string?,
     frequency: number,
     confidence: number,
     firstSeen: datetime,
     lastSeen: datetime
   }
   ```

2. **Company**
   ```cypher
   {
     name: string,
     normalized: string (key),
     domain: string?,
     frequency: number,
     confidence: number,
     firstSeen: datetime,
     lastSeen: datetime
   }
   ```

3. **Project**
   ```cypher
   {
     name: string,
     normalized: string (key),
     status: string?, // "active", "planned", "completed"
     frequency: number,
     confidence: number,
     firstSeen: datetime,
     lastSeen: datetime
   }
   ```

4. **Topic**
   ```cypher
   {
     name: string,
     normalized: string (key),
     category: string?,
     frequency: number,
     confidence: number,
     firstSeen: datetime,
     lastSeen: datetime
   }
   ```

5. **Location**
   ```cypher
   {
     name: string,
     normalized: string (key),
     type: string?, // "city", "country", "office", "address"
     frequency: number,
     confidence: number,
     firstSeen: datetime,
     lastSeen: datetime
   }
   ```

6. **Email**
   ```cypher
   {
     id: string (key),
     subject: string,
     timestamp: datetime,
     significanceScore: number?,
     threadId: string?,
     from: string?,
     to: [string],
     cc: [string]
   }
   ```

**Relationship Types**:

1. **MENTIONED_IN** (Entity -> Email)
   ```cypher
   {
     confidence: number,
     source: "metadata" | "body" | "subject",
     context: string?,
     extractedAt: datetime
   }
   ```

2. **WORKS_WITH** (Person -> Person)
   ```cypher
   {
     weight: number,
     emailIds: [string],
     firstSeen: datetime,
     lastSeen: datetime
   }
   ```

3. **DISCUSSED_TOPIC** (Person -> Topic)
   ```cypher
   {
     weight: number,
     emailIds: [string],
     firstSeen: datetime,
     lastSeen: datetime
   }
   ```

4. **COLLABORATES_ON** (Person -> Project)
   ```cypher
   {
     weight: number,
     emailIds: [string],
     role: string?, // "lead", "contributor", "stakeholder"
     firstSeen: datetime,
     lastSeen: datetime
   }
   ```

5. **WORKS_FOR** (Person -> Company)
   ```cypher
   {
     weight: number,
     emailIds: [string],
     current: boolean?,
     firstSeen: datetime,
     lastSeen: datetime
   }
   ```

6. **RELATED_TO** (Topic -> Topic)
   ```cypher
   {
     weight: number,
     emailIds: [string],
     firstSeen: datetime,
     lastSeen: datetime
   }
   ```

7. **LOCATED_AT** (Person/Company/Project -> Location)
   ```cypher
   {
     weight: number,
     emailIds: [string],
     firstSeen: datetime,
     lastSeen: datetime
   }
   ```

---

## 3. Retrieval Implementation

### 3.1 Vector Search

**File**: `src/lib/db/vectors.ts`

**Key Function**: `VectorOperations.searchSimilar()`

```typescript
async searchSimilar(
  embedding: number[],
  options: {
    userId?: string;
    conversationId?: string;
    limit?: number;           // Default: 10
    threshold?: number;       // Default: 0.7 (cosine similarity)
    minImportance?: number;   // Default: 1
    excludeDeleted?: boolean; // Default: true
  }
): Promise<VectorSearchResult[]>
```

**Implementation Details**:
- Uses pgvector's `<=>` operator for cosine distance
- Converts to similarity: `1 - cosine_distance`
- SQL query example:
  ```sql
  SELECT *,
    1 - (embedding <=> '[query_vector]'::vector) as similarity
  FROM memory_entries
  WHERE user_id = $1
    AND is_deleted = false
    AND importance >= $2
  ORDER BY similarity DESC
  LIMIT $3
  ```
- Filters results by threshold after query execution
- Returns `VectorSearchResult[]` with similarity scores

**Performance**:
- Target: <100ms for typical queries
- Uses IVFFlat index for approximate nearest neighbor search
- Index creation: `CREATE INDEX ON memory_entries USING ivfflat (embedding vector_cosine_ops)`

### 3.2 Graph Search

**File**: `src/lib/graph/graph-queries.ts`

**Key Functions**:

1. **Entity Search**
   ```typescript
   async searchEntities(
     query: string,
     type?: NodeLabel,
     limit: number = 20
   ): Promise<EntityQueryResult[]>
   ```
   - Searches by name or normalized name
   - Orders by frequency (popularity)
   - Returns entity nodes with labels

2. **Related Entities**
   ```typescript
   async getRelatedEntities(
     entityId: string,
     type: NodeLabel,
     limit: number = 10
   ): Promise<RelationshipQueryResult[]>
   ```
   - Finds all entities connected to a given entity
   - Orders by relationship weight
   - Returns source, relationship, target triples

3. **Co-occurrences**
   ```typescript
   async getCoOccurrences(
     entityId: string,
     type: NodeLabel,
     limit: number = 10
   ): Promise<CoOccurrenceResult[]>
   ```
   - Finds entities frequently mentioned together
   - Based on relationship weights and email IDs

**Performance**:
- Target: <150ms for typical queries
- Requires indexes on:
  - Entity `normalized` property
  - Entity `frequency` property
  - Relationship `weight` property

### 3.3 Hybrid Retrieval

**File**: `src/lib/retrieval/index.ts`

**Main Entry Point**: `RetrievalService.search()`

```typescript
async search(
  userId: string,
  query: string,
  options: {
    conversationId?: string;
    limit?: number;
    includeGraph?: boolean;
    forceRefresh?: boolean;
  }
): Promise<RetrievalResult>
```

**Execution Flow**:

1. **Cache Check** (if enabled)
   - LRU cache with 5-minute TTL
   - Key: `${query}:${userId}`

2. **Query Parsing**
   - Detect query type (factual, relational, temporal, exploratory, semantic)
   - Extract entities and keywords
   - Determine temporal constraints
   - Calculate confidence score

3. **Strategy Selection**
   - Adjust weights based on query type:
     - **Factual**: 70% vector, 30% graph
     - **Relational**: 30% vector, 70% graph
     - **Temporal**: 80% vector, 20% graph + recency boost
     - **Exploratory**: 50% vector, 50% graph
     - **Semantic**: 60% vector, 40% graph (default)

4. **Parallel Execution** (if enabled)
   ```typescript
   [vectorResults, graphResults] = await Promise.all([
     executeVectorSearch(userId, parsedQuery, options),
     executeGraphSearch(parsedQuery)
   ]);
   ```

5. **Ranking**
   - Rank vector results with scoring
   - Rank graph results with scoring
   - Merge and re-rank combined results
   - Apply diversity boost

6. **Filtering**
   - Apply similarity threshold
   - Limit to final result count
   - Deduplicate across sources

7. **Caching** (if enabled)
   - Store result in cache
   - Track hit count for popular queries

**Configuration**:
```typescript
{
  weights: {
    vector: 0.6,        // 60% - Semantic similarity
    graph: 0.4,         // 40% - Graph relevance
    recency: 0.15,      // 15% - Recent items boost
    importance: 0.1,    // 10% - Importance score
    entityOverlap: 0.2  // 20% - Entity match boost
  },
  vectorLimit: 20,      // Max vector candidates
  graphLimit: 10,       // Max graph candidates
  finalLimit: 10,       // Max final results
  vectorThreshold: 0.6, // Min similarity
  cacheEnabled: true,
  cacheTTL: 300,        // 5 minutes
  parallelExecution: true
}
```

---

## 4. Ranking and Scoring

### 4.1 Scoring Formula

**File**: `src/lib/retrieval/ranker.ts`

**Combined Score Calculation**:

```typescript
combined_score =
  (vector_similarity × vector_weight) +
  (graph_relevance × graph_weight) +
  (recency_score × recency_weight) +
  (importance_score × importance_weight) +
  (entity_overlap × entity_overlap_weight)
```

### 4.2 Individual Scoring Components

1. **Vector Similarity** (0-1)
   - Cosine similarity from pgvector
   - Direct from database query

2. **Graph Relevance** (0-1)
   ```typescript
   graph_score =
     (frequency_normalized × 0.7) +
     (name_match_bonus × 0.3)
   ```
   - `frequency_normalized`: `min(frequency / 100, 1.0)`
   - `name_match_bonus`: 0.3 if keyword matches name, else 0

3. **Recency Score** (0-1)
   - Decay curve based on age:
     ```typescript
     if (age < 1 day)    return 1.0;
     if (age < 7 days)   return 0.9;
     if (age < 30 days)  return 0.7;
     if (age < 90 days)  return 0.5;
     return 0.3; // 90+ days
     ```

4. **Importance Score** (0-1)
   - Normalized from 1-10 scale: `importance / 10`

5. **Entity Overlap** (0-1)
   - Ratio of matched entities: `matched_entities / total_entities`

### 4.3 Deduplication

**Strategy**:
- Vector results: Deduplicate by `memory_entry.id`
- Graph results: Deduplicate by `${label}:${normalized_name}`
- Cross-source: Keep both if content differs

### 4.4 Diversity Boost

**Purpose**: Prevent over-representation of single source

**Implementation**:
```typescript
if (sourceCount[source] > 3) {
  result.scores.combined *= 0.95; // 5% penalty
}
```

---

## 5. Query Parsing

### 5.1 Query Types

**File**: `src/lib/retrieval/parser.ts`

| Type | Pattern Examples | Use Case |
|------|-----------------|----------|
| **factual** | "What is...", "Tell me about...", "Explain..." | Direct information lookup |
| **relational** | "Who works with...", "Related to...", "Experts on..." | Relationship discovery |
| **temporal** | "Recent...", "Last week...", "Today..." | Time-based queries |
| **exploratory** | "Show me all...", "Explore...", "Browse..." | Broad exploration |
| **semantic** | Generic queries | Default similarity search |

### 5.2 Parsing Steps

1. **Entity Extraction**
   - Quoted strings: `"Project Alpha"`
   - Capitalized words (mid-sentence): `Sarah`, `Project`
   - Minimum 2 characters

2. **Keyword Extraction**
   - Split on whitespace
   - Remove punctuation
   - Filter stop words
   - Minimum 3 characters

3. **Temporal Parsing**
   - Patterns: "recent", "today", "yesterday", "this week", "last week", "last month"
   - Converts to date ranges

4. **Confidence Scoring**
   ```typescript
   confidence = 0.5 // base
     + (type !== 'semantic' ? 0.2 : 0)
     + (entities.length > 0 ? 0.15 * min(entities.length, 2) : 0)
     + (keywords.length >= 2 ? 0.1 : 0)
   ```

---

## 6. Performance Characteristics

### 6.1 Target Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| P50 latency | <200ms | Typical query |
| P95 latency | <500ms | Complex query with graph |
| P99 latency | <1000ms | Cache miss + large result set |
| Cache hit rate | >40% | For frequently searched queries |
| Vector search | <100ms | pgvector indexed search |
| Graph search | <150ms | Neo4j with proper indexes |

### 6.2 Optimization Strategies

1. **Parallel Execution**
   - Vector and graph searches run concurrently
   - Reduces total latency by ~40%

2. **Result Caching**
   - LRU cache with 5-minute TTL
   - ~90% latency reduction for cache hits

3. **Query Limits**
   - Vector: 20 candidates (configurable)
   - Graph: 10 candidates (configurable)
   - Final: 10 results (configurable)

4. **Index Optimization**
   - pgvector: IVFFlat index on embeddings
   - Neo4j: Indexes on entity names and frequencies

---

## 7. API Endpoints

### 7.1 Memory APIs

**Base Path**: `/api/memory/`

1. **Store Memory** - `POST /api/memory/store`
2. **Search Memory** - `POST /api/memory/search`
3. **Retrieve Memory** - `POST /api/memory/retrieve`
4. **Test Memory** - `GET /api/memory/test`

### 7.2 Retrieval API

**Base Path**: `/api/retrieval/`

1. **Hybrid Search** - `POST /api/retrieval/search`
   ```typescript
   Request: {
     userId: string,
     query: string,
     conversationId?: string,
     limit?: number,
     includeGraph?: boolean,
     forceRefresh?: boolean
   }

   Response: {
     success: boolean,
     data: RetrievalResult,
     meta: {
       executionTime: number,
       timestamp: string
     }
   }
   ```

2. **Cache Stats** - `GET /api/retrieval/search`
3. **Clear Cache** - `DELETE /api/retrieval/search`

---

## 8. Key Function Signatures

### 8.1 Memory Service

```typescript
// src/lib/memory/index.ts
class MemoryService {
  async store(
    entry: Omit<MemoryEntry, 'id' | 'createdAt'>,
    options: {
      conversationId?: string;
      importance?: number;
      summary?: string;
    }
  ): Promise<MemoryEntry>

  async retrieve(
    userId: string,
    query: string,
    options: SearchOptions
  ): Promise<MemoryEntry[]>

  async hybridSearch(
    userId: string,
    query: string,
    options: SearchOptions
  ): Promise<HybridSearchResult>

  async getAll(
    userId: string,
    options: { limit?: number; conversationId?: string }
  ): Promise<MemoryEntry[]>

  async getById(memoryId: string): Promise<MemoryEntry | null>

  async getStats(userId: string): Promise<{
    total: number;
    byConversation: Record<string, number>;
    avgImportance: number;
    totalAccesses: number;
  }>

  async delete(memoryId: string, hard?: boolean): Promise<void>
}
```

### 8.2 Enhanced Memory Service

```typescript
// src/lib/memory/enhanced.ts
class EnhancedMemoryService {
  async store(
    entry: Omit<MemoryEntry, 'id' | 'createdAt'>,
    options: StoreOptions
  ): Promise<MemoryEntry>

  async retrieve(
    userId: string,
    query: string,
    options: SearchOptions
  ): Promise<MemoryEntry[]>

  async update(
    memoryId: string,
    updates: {
      content?: string;
      summary?: string;
      metadata?: Record<string, unknown>;
      importance?: number;
      extractEntities?: boolean;
    }
  ): Promise<MemoryEntry | null>

  async delete(
    memoryId: string,
    options: { hard?: boolean; cascadeGraph?: boolean }
  ): Promise<void>

  async getHealth(): Promise<HealthStatus>
}
```

### 8.3 Vector Operations

```typescript
// src/lib/db/vectors.ts
class VectorOperations {
  async insertVector(data: {
    userId: string;
    content: string;
    embedding: number[];
    conversationId?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
    importance?: number;
  }): Promise<MemoryEntry>

  async searchSimilar(
    embedding: number[],
    options: {
      userId?: string;
      conversationId?: string;
      limit?: number;
      threshold?: number;
      minImportance?: number;
      excludeDeleted?: boolean;
    }
  ): Promise<VectorSearchResult[]>

  async updateVector(
    id: string,
    data: {
      content?: string;
      embedding?: number[];
      summary?: string;
      metadata?: Record<string, unknown>;
      importance?: number;
    }
  ): Promise<MemoryEntry>

  async deleteVector(id: string, hard?: boolean): Promise<void>

  async getById(id: string, trackAccess?: boolean): Promise<MemoryEntry | null>

  async getRecent(
    userId: string,
    options: {
      limit?: number;
      conversationId?: string;
      excludeDeleted?: boolean;
    }
  ): Promise<MemoryEntry[]>

  async getStats(userId: string): Promise<{
    total: number;
    byConversation: Record<string, number>;
    avgImportance: number;
    totalAccesses: number;
  }>
}
```

### 8.4 Graph Queries

```typescript
// src/lib/graph/graph-queries.ts

async function searchEntities(
  query: string,
  type?: NodeLabel,
  limit?: number
): Promise<EntityQueryResult[]>

async function getRelatedEntities(
  entityId: string,
  type: NodeLabel,
  limit?: number
): Promise<RelationshipQueryResult[]>

async function getCoOccurrences(
  entityId: string,
  type: NodeLabel,
  limit?: number
): Promise<CoOccurrenceResult[]>

async function getEmailsForEntity(
  entityId: string,
  type: NodeLabel,
  limit?: number
): Promise<Array<{
  email: any;
  confidence: number;
  source: string;
  context?: string;
}>>

async function getTopEntities(
  type: NodeLabel,
  limit?: number
): Promise<EntityQueryResult[]>

async function getEntityStats(
  entityId: string,
  type: NodeLabel
): Promise<{
  frequency: number;
  emailCount: number;
  relationshipCount: number;
  recentActivity: number;
}>
```

### 8.5 Retrieval Service

```typescript
// src/lib/retrieval/index.ts
class RetrievalService {
  async search(
    userId: string,
    query: string,
    options: {
      conversationId?: string;
      limit?: number;
      includeGraph?: boolean;
      forceRefresh?: boolean;
    }
  ): Promise<RetrievalResult>

  clearCache(): void

  getCacheStats(): CacheStats

  updateConfig(config: Partial<RetrievalConfig>): void
}

// Parser functions
function parseQuery(query: string): ParsedQuery

function suggestStrategy(parsed: ParsedQuery): {
  vectorWeight: number;
  graphWeight: number;
  useRecencyBoost: boolean;
}

// Ranker functions
function rankVectorResults(
  results: VectorSearchResult[],
  query: ParsedQuery,
  weights: RetrievalWeights
): RankedResult[]

function rankGraphResults(
  results: EntityQueryResult[],
  query: ParsedQuery,
  weights: RetrievalWeights
): RankedResult[]

function mergeAndRank(
  vectorResults: RankedResult[],
  graphResults: RankedResult[],
  weights: RetrievalWeights
): RankedResult[]

function getTopResults(
  results: RankedResult[],
  limit: number
): RankedResult[]

function filterByThreshold(
  results: RankedResult[],
  threshold: number
): RankedResult[]
```

---

## 9. Benchmark Design Implications

### 9.1 Required Test Scenarios

1. **Vector-Only Retrieval**
   - Direct pgvector similarity search
   - Varying similarity thresholds (0.5, 0.6, 0.7, 0.8, 0.9)
   - Different result set sizes (10, 20, 50, 100)
   - User-scoped vs global queries

2. **Graph-Only Retrieval**
   - Entity search by name
   - Related entities traversal (depth 1, 2, 3)
   - Co-occurrence queries
   - Relationship-based searches

3. **Hybrid Retrieval**
   - All 5 query types (factual, relational, temporal, exploratory, semantic)
   - Varying weight configurations
   - Cache hit vs cache miss scenarios
   - Parallel vs sequential execution

### 9.2 Synthetic Dataset Requirements

**Schema Compatibility**:
1. **Memory Entries**
   - Random content (100-500 words)
   - Realistic embeddings (1536-dimensional)
   - User IDs (10-100 users)
   - Conversation IDs (optional)
   - Importance scores (1-10)
   - Temporal distribution (last 90 days)

2. **Graph Entities**
   - Person nodes (100-500)
   - Company nodes (20-50)
   - Project nodes (30-100)
   - Topic nodes (50-200)
   - Location nodes (20-50)
   - Email nodes (1000-5000)

3. **Relationships**
   - WORKS_WITH (high frequency)
   - DISCUSSED_TOPIC (high frequency)
   - COLLABORATES_ON (medium frequency)
   - WORKS_FOR (low frequency)
   - MENTIONED_IN (very high frequency)

**Distribution Characteristics**:
- **Zipf distribution** for entity frequencies
- **Temporal clustering** (recent emails more frequent)
- **Realistic co-occurrence patterns** (people who work together appear in same emails)

### 9.3 Performance Metrics to Track

1. **Latency Metrics**
   - P50, P95, P99 response times
   - Vector search time
   - Graph search time
   - Ranking time
   - Cache hit/miss times

2. **Quality Metrics**
   - Relevance scores (NDCG, MAP)
   - Result diversity
   - Entity overlap accuracy
   - Query type detection accuracy

3. **Resource Metrics**
   - Memory usage
   - Database query counts
   - Cache size and hit rate
   - Embedding generation time

### 9.4 Existing Patterns to Follow

1. **File Organization**
   - Tests in `src/lib/retrieval/__tests__/`
   - Fixtures in dedicated directory
   - Database migrations for test schema

2. **Naming Conventions**
   - Test files: `*.test.ts`
   - Fixtures: `fixtures/*.ts`
   - Utilities: `test-utils.ts`

3. **Testing Approach**
   - Unit tests for individual components (parser, ranker)
   - Integration tests for end-to-end flows
   - Performance benchmarks separate from unit tests

---

## 10. File Locations Summary

### 10.1 Core Memory Services
- `src/lib/memory/index.ts` - Main memory service
- `src/lib/memory/enhanced.ts` - Enhanced memory service with persistence

### 10.2 Retrieval System
- `src/lib/retrieval/index.ts` - Hybrid retrieval orchestrator
- `src/lib/retrieval/types.ts` - Type definitions
- `src/lib/retrieval/parser.ts` - Query parsing and intent detection
- `src/lib/retrieval/ranker.ts` - Weighted ranking algorithms
- `src/lib/retrieval/cache.ts` - LRU cache implementation

### 10.3 Vector Operations
- `src/lib/db/vectors.ts` - pgvector operations
- `src/lib/db/schema.ts` - Database schema (Drizzle ORM)
- `src/lib/db/client.ts` - Database client

### 10.4 Graph Operations
- `src/lib/graph/graph-queries.ts` - Cypher query functions
- `src/lib/graph/graph-builder.ts` - Graph construction
- `src/lib/graph/neo4j-client.ts` - Neo4j driver wrapper
- `src/lib/graph/types.ts` - Graph node and relationship types
- `src/lib/graph/index.ts` - Graph exports

### 10.5 Supporting Services
- `src/lib/embeddings/index.ts` - Embedding generation
- `src/lib/extraction/entity-extractor.ts` - Entity extraction
- `src/lib/persistence/index.ts` - Dual-write persistence layer

### 10.6 API Routes
- `src/app/api/memory/search/route.ts` - Memory search endpoint
- `src/app/api/memory/retrieve/route.ts` - Memory retrieval endpoint
- `src/app/api/memory/store/route.ts` - Memory storage endpoint
- `src/app/api/retrieval/search/route.ts` - Hybrid search endpoint

### 10.7 Documentation
- `docs/retrieval-system.md` - Comprehensive retrieval system docs
- `docs/implementation/neo4j-memory-graph-implementation.md` - Graph implementation
- `docs/research/neo4j-memory-graph-integration-2026-01-05.md` - Graph integration research

### 10.8 Existing Tests
- `src/lib/retrieval/__tests__/parser.test.ts` - Parser unit tests
- `src/lib/retrieval/__tests__/ranker.test.ts` - Ranker unit tests

---

## 11. Recommendations for Benchmark Implementation

### 11.1 Benchmark Structure

```
src/lib/retrieval/__tests__/
├── benchmarks/
│   ├── benchmark-runner.ts       # Main benchmark orchestrator
│   ├── vector-benchmark.test.ts  # Vector-only tests
│   ├── graph-benchmark.test.ts   # Graph-only tests
│   ├── hybrid-benchmark.test.ts  # Hybrid retrieval tests
│   └── fixtures/
│       ├── synthetic-dataset.ts  # Dataset generator
│       ├── sample-queries.ts     # Representative queries
│       └── test-data.json        # Pre-generated test data
├── parser.test.ts                # Existing parser tests
└── ranker.test.ts                # Existing ranker tests
```

### 11.2 Dataset Generation Strategy

1. **Use Existing Schema**
   - Generate data compatible with `memoryEntries` table
   - Generate graph nodes following Neo4j schema
   - Use real embedding model for vectors

2. **Realistic Distributions**
   - Zipf for entity frequencies
   - Temporal clustering for recent bias
   - Co-occurrence patterns for relationships

3. **Parameterized Size**
   - Small: 100 memories, 50 entities
   - Medium: 1000 memories, 500 entities
   - Large: 10000 memories, 5000 entities

### 11.3 Test Execution

1. **Setup Phase**
   - Create test database
   - Seed with synthetic data
   - Warm up caches

2. **Execution Phase**
   - Run each test scenario
   - Collect timing metrics
   - Track quality metrics

3. **Cleanup Phase**
   - Clear test data
   - Reset caches
   - Generate report

### 11.4 Integration with Existing Code

**Reuse**:
- `VectorOperations` for vector search
- `searchEntities`, `getRelatedEntities` for graph queries
- `RetrievalService` for hybrid tests
- `parseQuery` for query parsing
- `rankVectorResults`, `rankGraphResults` for ranking

**Mock**:
- Embedding generation (use pre-computed embeddings)
- External API calls
- User authentication

**Extend**:
- Add performance monitoring wrappers
- Add result validation helpers
- Add dataset generation utilities

---

## 12. Next Steps

1. **Design Benchmark Framework**
   - Define test scenarios and metrics
   - Create dataset generator
   - Implement benchmark runner

2. **Generate Synthetic Datasets**
   - Create realistic memory entries
   - Build graph with proper distributions
   - Pre-compute embeddings

3. **Implement Benchmarks**
   - Vector-only tests
   - Graph-only tests
   - Hybrid retrieval tests

4. **Validate Results**
   - Compare against performance targets
   - Identify bottlenecks
   - Propose optimizations

5. **Document Findings**
   - Performance report
   - Optimization recommendations
   - Benchmark results visualization

---

## Appendix A: Default Configuration

```typescript
// Retrieval Configuration
const DEFAULT_CONFIG = {
  weights: {
    vector: 0.6,        // 60% - Semantic similarity
    graph: 0.4,         // 40% - Graph relevance
    recency: 0.15,      // 15% - Recent items boost
    importance: 0.1,    // 10% - Importance score
    entityOverlap: 0.2  // 20% - Entity match boost
  },
  vectorLimit: 20,      // Max vector candidates
  graphLimit: 10,       // Max graph candidates
  finalLimit: 10,       // Max final results
  vectorThreshold: 0.6, // Min similarity
  cacheEnabled: true,
  cacheTTL: 300,        // 5 minutes
  parallelExecution: true
};

// Memory Service Configuration
const MEMORY_CONFIG = {
  enableGraph: true,
  enableVectorPersistence: true,
  llmModel: 'gpt-4.1-nano-2025-04-14'
};

// Vector Search Defaults
const VECTOR_DEFAULTS = {
  limit: 10,
  threshold: 0.7,
  minImportance: 1,
  excludeDeleted: true
};

// Graph Search Defaults
const GRAPH_DEFAULTS = {
  limit: 20,
  maxDepth: 3
};
```

---

## Appendix B: Type Definitions

See source files for complete type definitions:
- `src/lib/retrieval/types.ts` - Retrieval types
- `src/lib/graph/types.ts` - Graph types
- `src/lib/db/schema.ts` - Database types
- `src/types/index.ts` - Global types

---

**End of Research Document**

This research provides a complete foundation for designing comprehensive benchmarks that test vector retrieval, graph retrieval, and hybrid retrieval performance while maintaining compatibility with the existing izzie2 codebase.
