# Ingestion Pipeline

Automated event-driven pipeline for ingesting emails and Drive files into the Izzie2 knowledge graph.

## Quick Start

### 1. Set Environment Variables

```bash
# Required
export DEFAULT_USER_ID=your-user-id
export INNGEST_EVENT_KEY=your-inngest-key

# Google OAuth
export GOOGLE_CLIENT_ID=...
export GOOGLE_CLIENT_SECRET=...

# Neo4j
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=...

# Postgres
export DATABASE_URL=postgresql://...
```

### 2. Create Metadata Table

```sql
CREATE TABLE IF NOT EXISTS metadata_store (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);
```

### 3. Deploy Functions

The Inngest functions will automatically register when your Next.js app starts:

```bash
npm run dev
```

Functions registered:
- ✅ `ingest-emails` (hourly)
- ✅ `ingest-drive` (daily at 2 AM)
- ✅ `extract-entities-from-email` (event-triggered)
- ✅ `extract-entities-from-drive` (event-triggered)
- ✅ `update-graph` (event-triggered)

### 4. Trigger Manual Sync

```bash
# Sync emails
curl -X POST http://localhost:3000/api/ingestion/sync-emails \
  -H "Content-Type: application/json" \
  -d '{}'

# Sync Drive
curl -X POST http://localhost:3000/api/ingestion/sync-drive \
  -H "Content-Type: application/json" \
  -d '{}'

# Check status
curl http://localhost:3000/api/ingestion/status
```

## How It Works

### Scheduled Ingestion

**Email (Hourly)**
1. Fetch emails since last sync
2. Emit events for entity extraction
3. Update sync state

**Drive (Daily)**
1. Fetch changes via page tokens
2. Emit events for entity extraction
3. Update sync state

### Entity Processing

**Extraction**
1. Receive email/drive content
2. Extract entities using Mistral AI
3. Emit entities extracted event

**Graph Update**
1. Receive extracted entities
2. Update Neo4j graph
3. Store in Mem0 with embeddings

### Data Flow

```
Scheduled → Fetch → Extract → Graph + Memory
```

## API Endpoints

### POST /api/ingestion/sync-emails

Manually trigger email sync.

**Body:**
```json
{
  "userId": "optional-user-id",
  "force": false
}
```

### POST /api/ingestion/sync-drive

Manually trigger Drive sync.

**Body:**
```json
{
  "userId": "optional-user-id",
  "force": false
}
```

### GET /api/ingestion/status

Get sync status for both sources.

**Query:**
- `userId` (optional)

### POST /api/ingestion/reset

Reset sync state for re-sync.

**Body:**
```json
{
  "userId": "optional-user-id",
  "source": "gmail" | "drive" | "all"
}
```

## Sync State

Tracked per user per source:

```typescript
{
  source: 'gmail' | 'drive',
  lastSyncTime: Date,
  lastPageToken?: string,
  itemsProcessed: number,
  lastError?: string,
  updatedAt: Date
}
```

## Error Handling

- **Retries:** 3 attempts with exponential backoff
- **Error logging:** Stored in sync state
- **Partial failures:** Non-blocking (logged but continue)

## Monitoring

View function runs in Inngest dashboard:
https://app.inngest.com

Key metrics:
- Items processed
- Sync freshness
- Extraction costs
- Error rates

## Files

- `sync-state.ts` - Sync state management
- `../events/functions/ingest-emails.ts` - Email ingestion
- `../events/functions/ingest-drive.ts` - Drive ingestion
- `../events/functions/extract-entities.ts` - Entity extraction
- `../events/functions/update-graph.ts` - Graph updates

## See Also

- [Full Documentation](../../docs/INGESTION_PIPELINE.md)
- [Event Types](../events/types.ts)
- [Graph Builder](../graph/graph-builder.ts)
- [Memory Service](../memory/enhanced.ts)
