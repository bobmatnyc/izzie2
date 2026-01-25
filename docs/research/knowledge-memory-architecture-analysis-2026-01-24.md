# Knowledge/Memory Architecture Analysis

**Issue:** #94 - Core Knowledge vs User-Specific Knowledge Architecture
**Date:** 2026-01-24
**Status:** Research Complete

---

## Executive Summary

The current izzie2 architecture uses a **fully user-scoped data model** with no separation between core/shared knowledge and user-specific data. All data storage (Weaviate entities, Postgres memory entries, preferences, etc.) requires a `userId` field and filters all queries by user. This is appropriate for a personal assistant but would need significant changes to support shared organizational knowledge or multi-tenant scenarios.

---

## Question 1: How is User Data Currently Stored?

### Two Primary Data Stores

| Store | Technology | Purpose | Connection |
|-------|-----------|---------|------------|
| **Weaviate Cloud** | Vector DB (Weaviate) | Entities, Memories (vector search), Relationships, Research Findings | `WEAVIATE_URL` + `WEAVIATE_API_KEY` |
| **Neon Postgres** | PostgreSQL + Drizzle ORM | Users, Conversations, Memory Entries (pgvector), Sessions, Preferences, Tasks | `DATABASE_URL` (Neon) |

### Weaviate Collections (Vector Search)

```
Collections:
- Person          - Extracted person entities
- Company         - Extracted company/org entities
- Project         - Extracted project entities
- Date            - Extracted date/deadline entities
- Topic           - Extracted topic entities
- Location        - Extracted location entities
- ActionItem      - Action items with assignee/deadline
- Relationship    - Inferred entity relationships
- Memory          - User memories with temporal decay
- ResearchFinding - Research task outputs
```

**Key Fields (all collections):**
- `userId` - Owner filtering (REQUIRED)
- `sourceId` - Email/event ID origin
- `confidence` - Extraction confidence (0-1)
- `extractedAt` - Timestamp

### Postgres Tables (Relational Data)

```sql
Core Tables:
- users              - User accounts (id, email, name, metadata)
- conversations      - Chat conversation records
- memoryEntries      - Memory with pgvector embeddings (1536 dim)
- chatSessions       - Session state, compressed history
- agentTasks         - Agent workflow tasks

Preferences:
- userPreferences    - Writing style, tone, custom instructions
- alertPreferences   - VIP senders, quiet hours, notifications
- writingStyles      - Learned writing patterns per user/recipient

Auth & Sessions:
- sessions           - NextAuth sessions
- accounts           - OAuth account connections
- mcpServers         - MCP server configs per user
```

**Memory Entries Schema (pgvector):**
```typescript
{
  id: uuid,
  userId: text (required),
  content: text,
  embedding: vector(1536),  // text-embedding-3-small
  memoryType: text,
  importance: integer (1-10),
  accessCount: integer,
  lastAccessedAt: timestamp,
  metadata: jsonb,
  isDeleted: boolean
}
```

---

## Question 2: Is There Separation Between Core/Shared and User-Specific Knowledge?

### Current State: **NO SEPARATION**

**All data is user-scoped:**
- Every Weaviate collection requires `userId` filtering
- Every Postgres table has `userId` foreign key
- No concept of "global" or "shared" knowledge exists
- No organization/team level abstraction

**Code Evidence:**

```typescript
// Memory retrieval (src/lib/memory/retrieval.ts)
searchMemories({
  query: searchQuery,
  userId,  // ALWAYS required
  ...
})

// Entity search (src/lib/weaviate/entities.ts)
searchEntities(searchQuery, userId, {  // userId required
  limit: opts.maxEntities,
  ...
})

// Context retrieval (src/lib/chat/context-retrieval.ts)
retrieveContext(userId, message, recentMessages, options)
// All sub-queries filter by userId
```

**No shared knowledge layer exists for:**
- Organization-wide facts
- Team preferences
- Company policies/guidelines
- Shared contact information
- Common project knowledge

---

## Question 3: Where Are Entities, Memories, Preferences Stored?

### Storage Location Matrix

| Data Type | Primary Store | Secondary Store | Vector Search? |
|-----------|--------------|-----------------|----------------|
| **Entities** (Person, Company, etc.) | Weaviate | - | BM25 keyword |
| **Relationships** | Weaviate | - | No |
| **Memories** (facts, events) | Weaviate | Postgres (memoryEntries) | Both |
| **User Preferences** | Postgres (userPreferences) | Weaviate (Memory category='preference') | Weaviate only |
| **Alert Preferences** | Postgres (alertPreferences) | - | No |
| **Writing Styles** | Postgres (writingStyles) | - | No |
| **Research Findings** | Weaviate | - | Yes |
| **Chat Sessions** | Postgres (chatSessions) | - | No |
| **Tasks** | Postgres (memoryEntries with metadata) | - | pgvector |

### Memory Categories (Weaviate)

```typescript
type MemoryCategory =
  | 'preference'    // User likes/dislikes, habits
  | 'fact'          // Objective information
  | 'event'         // Something that happened/will happen
  | 'decision'      // A decision that was made
  | 'sentiment'     // Emotional context, feelings
  | 'reminder'      // Something to remember for later
  | 'relationship'; // How entities relate to each other
```

### Decay Rates by Category

```typescript
DECAY_RATES = {
  preference: 0.01,    // Very slow - preferences persist
  fact: 0.02,          // Slow - facts are stable
  relationship: 0.02,  // Slow - relationships persist
  decision: 0.03,      // Medium - decisions can change
  event: 0.05,         // Medium-fast - events become less relevant
  sentiment: 0.1,      // Fast - emotions are temporary
  reminder: 0.2,       // Very fast - reminders expire quickly
}
```

---

## Question 4: How Does Chat Context Pull in User Data?

### Context Retrieval Flow

```
User Message
    |
    v
extractQueryTerms(message)
    |-- Remove stop words
    |-- Extract capitalized names (potential entities)
    |-- Build search query
    |
    v
retrieveContext(userId, message, recentMessages, options)
    |
    +--[Parallel Queries]--+
    |                      |
    v                      v
searchEntities()      searchMemories()
(Weaviate BM25)       (Weaviate BM25)
    |                      |
    v                      v
listEvents()          retrievePendingTasks()
(Google Calendar)     (Postgres memoryEntries)
    |                      |
    v                      v
getRecentEmails()     preferenceMemories
(Google Mail)         (high-importance preferences)
    |
    v
ChatContext {
  entities: Entity[],
  memories: MemoryWithStrength[],
  upcomingEvents: CalendarEvent[],
  pendingTasks: PendingTask[],
  recentEmails: RecentEmailSummary[],
  recentConversation?: ChatMessage[]
}
```

### Context Options

```typescript
interface ContextRetrievalOptions {
  maxEntities?: number;          // Default: 10
  maxMemories?: number;          // Default: 10
  minMemoryStrength?: number;    // Default: 0.3
  entityTypes?: EntityType[];
  memoryCategories?: MemoryCategory[];
  includeRecentMessages?: boolean;
  useMultiAccount?: boolean;     // Fetch from all Google accounts
  accountId?: string;            // Specific account override
}
```

### Key Observations

1. **Query-based retrieval**: Extracts terms from user message, searches both entities and memories
2. **Parallel fetching**: Calendar, email, tasks, memories fetched simultaneously
3. **Preference boosting**: High-importance preferences (>0.8) always included regardless of query match
4. **Decay weighting**: Memories ranked by `strength = importance * decay_factor * access_boost`
5. **Multi-account support**: Can aggregate data from multiple Google accounts

---

## Question 5: What Would Need to Change for Two-Tier Architecture?

### Proposed Two-Tier Model

```
                    +------------------------+
                    |    SHARED KNOWLEDGE    |
                    |   (Organization-wide)  |
                    |                        |
                    | - Company facts        |
                    | - Team members         |
                    | - Project info         |
                    | - Policies/guidelines  |
                    +------------------------+
                              |
                              | inherits/extends
                              v
     +----------+   +----------+   +----------+
     |  User A  |   |  User B  |   |  User C  |
     | Knowledge|   | Knowledge|   | Knowledge|
     |          |   |          |   |          |
     | Personal |   | Personal |   | Personal |
     | prefs,   |   | prefs,   |   | prefs,   |
     | memories |   | memories |   | memories |
     +----------+   +----------+   +----------+
```

### Required Changes

#### 1. Schema Changes

**Weaviate - Add organization scoping:**
```typescript
// New field on all collections
{
  organizationId?: string;  // null = user-only, value = shared
  visibility: 'private' | 'organization' | 'public';
}
```

**Postgres - Add organization tables:**
```sql
-- New tables
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  settings JSONB
);

CREATE TABLE organization_members (
  organization_id UUID REFERENCES organizations(id),
  user_id TEXT REFERENCES users(id),
  role TEXT NOT NULL,  -- 'admin', 'member', 'viewer'
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE shared_knowledge (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  visibility TEXT DEFAULT 'organization',
  embedding VECTOR(1536)
);

-- Modify existing tables
ALTER TABLE memory_entries ADD COLUMN organization_id UUID;
ALTER TABLE memory_entries ADD COLUMN visibility TEXT DEFAULT 'private';
```

#### 2. Query Layer Changes

**Current:**
```typescript
searchMemories({ query, userId, ... })
```

**New:**
```typescript
searchMemories({
  query,
  userId,
  organizationId?,      // Include org knowledge
  includeShared: true,  // Merge shared + private
  visibilityFilter: ['private', 'organization']
})
```

**Merge Strategy:**
```typescript
async function retrieveContextWithShared(userId, orgId, message) {
  const [personalContext, sharedContext] = await Promise.all([
    retrieveContext(userId, message, { visibility: 'private' }),
    retrieveSharedContext(orgId, message)
  ]);

  return mergeContexts(personalContext, sharedContext, {
    deduplication: 'prefer-personal',  // Personal overrides shared
    maxTotal: 20
  });
}
```

#### 3. Access Control

```typescript
interface KnowledgeAccessControl {
  canRead(userId: string, knowledgeId: string): Promise<boolean>;
  canWrite(userId: string, orgId: string): Promise<boolean>;
  getVisibleOrgs(userId: string): Promise<string[]>;
}
```

#### 4. Memory Categories Extension

```typescript
type SharedMemoryCategory =
  | 'org_fact'        // Organization-wide facts
  | 'org_policy'      // Policies and guidelines
  | 'team_member'     // Shared contact info
  | 'project_info'    // Project knowledge
  | 'org_decision';   // Organization decisions

// Combined type
type ExtendedMemoryCategory = MemoryCategory | SharedMemoryCategory;
```

#### 5. Context Retrieval Updates

```typescript
interface ExtendedContextRetrievalOptions extends ContextRetrievalOptions {
  organizationId?: string;
  includeSharedKnowledge?: boolean;
  sharedKnowledgeLimit?: number;
  preferPersonalOverShared?: boolean;
}
```

---

## Summary: Current State vs What Needs to Be Built

| Aspect | Current State | Two-Tier Architecture |
|--------|---------------|----------------------|
| **Data Scoping** | User-only (`userId` required everywhere) | User + Organization layers |
| **Knowledge Sharing** | None - completely isolated | Org-level knowledge visible to members |
| **Schema** | Single-tenant design | Multi-tenant with visibility controls |
| **Context Retrieval** | Personal data only | Merged personal + shared context |
| **Access Control** | User authentication only | Role-based org access |
| **Memory Categories** | 7 personal categories | Extended with org categories |
| **Conflict Resolution** | N/A | Personal overrides shared |

### Implementation Effort Estimate

| Component | Effort | Priority |
|-----------|--------|----------|
| Database schema changes | Medium | P0 |
| Organization management API | Medium | P0 |
| Weaviate collection updates | Low | P0 |
| Query layer modifications | High | P1 |
| Context merge logic | Medium | P1 |
| Access control layer | Medium | P1 |
| Admin UI for shared knowledge | High | P2 |
| Migration scripts | Medium | P2 |

### Recommended Approach

1. **Phase 1**: Add organization tables and membership (no functional changes)
2. **Phase 2**: Add `organizationId` and `visibility` to existing schemas
3. **Phase 3**: Implement shared knowledge CRUD operations
4. **Phase 4**: Update retrieval layer to merge contexts
5. **Phase 5**: Build admin UI for managing shared knowledge

---

## Files Analyzed

- `/src/lib/weaviate/schema.ts` - Weaviate collection definitions
- `/src/lib/weaviate/client.ts` - Weaviate connection management
- `/src/lib/weaviate/index.ts` - Weaviate exports
- `/src/lib/db/schema.ts` - Postgres/Drizzle schema (1523 lines)
- `/src/lib/memory/retrieval.ts` - Memory search with decay weighting
- `/src/lib/memory/storage.ts` - Memory CRUD operations
- `/src/lib/memory/types.ts` - Memory type definitions
- `/src/lib/chat/context-retrieval.ts` - Chat context assembly

---

*Research conducted by Claude Research Agent for issue #94*
