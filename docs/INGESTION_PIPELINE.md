# Ingestion Pipeline Documentation

## Overview

The Izzie2 ingestion pipeline is an event-driven system built with Inngest that automatically processes emails and Drive files, extracts entities, and updates the knowledge graph.

## Architecture

```
┌─────────────────┐
│  Scheduled      │
│  Functions      │
└────────┬────────┘
         │
         ├─► ingestEmails (hourly)
         │   └─► Fetches new emails
         │       └─► Emits: izzie/ingestion.email.extracted
         │
         └─► ingestDrive (daily)
             └─► Fetches changed Drive files
                 └─► Emits: izzie/ingestion.drive.extracted

         ┌────────────────────────────────┐
         │  Event-Triggered Functions     │
         └────────┬───────────────────────┘
                  │
                  ├─► extractEntitiesFromEmail
                  │   └─► Extracts entities from email
                  │       └─► Emits: izzie/ingestion.entities.extracted
                  │
                  ├─► extractEntitiesFromDrive
                  │   └─► Extracts entities from Drive file
                  │       └─► Emits: izzie/ingestion.entities.extracted
                  │
                  └─► updateGraph
                      └─► Updates Neo4j + Mem0
```

## Components

### 1. Sync State Tracker (`src/lib/ingestion/sync-state.ts`)

Manages incremental sync progress for each data source.

**Functions:**
- `getSyncState(userId, source)` - Get current sync state
- `updateSyncState(userId, source, updates)` - Update sync state
- `initializeSyncState(userId, source)` - Initialize for new user
- `clearSyncState(userId, source)` - Clear state for re-sync
- `incrementProcessedCount(userId, source, count)` - Track progress
- `recordSyncError(userId, source, error)` - Log errors

**Storage:**
```typescript
interface SyncState {
  source: 'gmail' | 'drive';
  lastSyncTime: Date;
  lastPageToken?: string;      // Drive only
  lastHistoryId?: string;       // Gmail only
  itemsProcessed: number;
  lastError?: string;
  updatedAt: Date;
}
```

### 2. Email Ingestion (`src/lib/events/functions/ingest-emails.ts`)

**Schedule:** Every hour (`0 * * * *`)

**Process:**
1. Get sync state
2. Fetch emails since last sync (max 100)
3. Emit `izzie/ingestion.email.extracted` events
4. Update sync state

**Configuration:**
- `DEFAULT_USER_ID` - Target user for ingestion
- Fetches from all folders
- Incremental sync based on timestamp

### 3. Drive Ingestion (`src/lib/events/functions/ingest-drive.ts`)

**Schedule:** Daily at 2 AM (`0 2 * * *`)

**Process:**
1. Get sync state (page token)
2. Fetch changes via Drive Changes API
3. Filter supported MIME types
4. Emit `izzie/ingestion.drive.extracted` events
5. Update sync state with new page token

**Supported MIME Types:**
- `application/vnd.google-apps.document` (Docs)
- `application/vnd.google-apps.spreadsheet` (Sheets)
- `application/vnd.google-apps.presentation` (Slides)
- `text/plain`
- `application/pdf`

### 4. Entity Extraction (`src/lib/events/functions/extract-entities.ts`)

**Triggers:**
- `izzie/ingestion.email.extracted`
- `izzie/ingestion.drive.extracted`

**Process:**
1. Convert content to Email format
2. Extract entities using Mistral AI
3. Emit `izzie/ingestion.entities.extracted` event

**Entity Types:**
- Person
- Company
- Project
- Location
- Date
- Topic

**Cost Tracking:**
- Uses Mistral Small (cheap tier)
- Logs cost per extraction
- Total cost reported in events

### 5. Graph Update (`src/lib/events/functions/update-graph.ts`)

**Triggers:**
- `izzie/ingestion.entities.extracted`

**Process:**
1. Update Neo4j graph (nodes + relationships)
2. Store in Mem0 with embeddings
3. Log completion metrics

**Concurrency:** Max 5 concurrent updates

**Dual Storage:**
- **Neo4j:** Entity nodes and relationships
- **Mem0:** Vector embeddings for semantic search

## Manual Triggers

### Sync Emails

```bash
curl -X POST http://localhost:3000/api/ingestion/sync-emails \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123", "force": false}'
```

### Sync Drive

```bash
curl -X POST http://localhost:3000/api/ingestion/sync-drive \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123", "force": false}'
```

### Get Status

```bash
curl http://localhost:3000/api/ingestion/status?userId=user-123
```

### Reset State

```bash
curl -X POST http://localhost:3000/api/ingestion/reset \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123", "source": "all"}'
```

## Event Flow

### Email Ingestion Flow

```
1. ingestEmails (scheduled)
   ↓
2. Emits: izzie/ingestion.email.extracted
   ↓
3. extractEntitiesFromEmail (triggered)
   ↓
4. Emits: izzie/ingestion.entities.extracted
   ↓
5. updateGraph (triggered)
   ↓ (parallel)
   ├─► Neo4j graph update
   └─► Mem0 vector storage
```

### Drive Ingestion Flow

```
1. ingestDrive (scheduled)
   ↓
2. Emits: izzie/ingestion.drive.extracted
   ↓
3. extractEntitiesFromDrive (triggered)
   ↓
4. Emits: izzie/ingestion.entities.extracted
   ↓
5. updateGraph (triggered)
   ↓ (parallel)
   ├─► Neo4j graph update
   └─► Mem0 vector storage
```

## Error Handling

### Retry Logic

- **Email Ingestion:** 3 retries with exponential backoff
- **Drive Ingestion:** 3 retries with exponential backoff
- **Entity Extraction:** 3 retries with exponential backoff
- **Graph Update:** 3 retries with exponential backoff

### Error Recording

Errors are logged in sync state:
```typescript
await recordSyncError(userId, source, error);
```

### Partial Failures

- Graph update failures don't block memory storage
- Memory storage failures don't block graph updates
- Extraction failures are logged and skipped

## Configuration

### Environment Variables

```bash
# Required
DEFAULT_USER_ID=your-user-id
INNGEST_EVENT_KEY=your-inngest-key

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=...

# Postgres (for Mem0)
DATABASE_URL=postgresql://...
```

### Database Setup

The sync state tracker requires a `metadata_store` table:

```sql
CREATE TABLE IF NOT EXISTS metadata_store (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);
```

## Monitoring

### Logs

All functions log:
- Start/completion events
- Item counts processed
- Error details
- Performance metrics

### Metrics

Key metrics to monitor:
- `itemsProcessed` - Total items synced
- `lastSyncTime` - Freshness of data
- `cost` - AI extraction costs
- `processingTimeMs` - Performance

### Inngest Dashboard

View function runs, retries, and failures at:
https://app.inngest.com

## Performance

### Email Ingestion

- **Batch size:** 100 emails/run
- **Frequency:** Hourly
- **Rate limiting:** 100ms delay between emails

### Drive Ingestion

- **Frequency:** Daily
- **Change tracking:** Via page tokens (incremental)
- **Rate limiting:** 100ms delay between files

### Entity Extraction

- **Model:** Mistral Small (fast, cheap)
- **Cost:** ~$0.0001 per email
- **Concurrency:** 1 extraction at a time (serial)

### Graph Updates

- **Concurrency:** 5 concurrent updates
- **Dual-write:** Neo4j + Mem0 in parallel

## Troubleshooting

### No emails being ingested

1. Check sync state: `GET /api/ingestion/status`
2. Verify `DEFAULT_USER_ID` is set
3. Check Google OAuth credentials
4. Review Inngest function logs

### Drive changes not syncing

1. Check page token in sync state
2. Verify Drive API is enabled
3. Check file MIME types are supported
4. Review Drive API quota

### Entities not appearing in graph

1. Check extraction events in Inngest dashboard
2. Verify Neo4j connection
3. Check entity confidence threshold
4. Review graph update logs

### Reset everything

```bash
curl -X POST http://localhost:3000/api/ingestion/reset \
  -H "Content-Type: application/json" \
  -d '{"source": "all"}'
```

## Future Enhancements

- [ ] Dead letter queue for failed items
- [ ] Metrics export to Datadog/Prometheus
- [ ] Multi-user support with parallel ingestion
- [ ] Smart throttling based on API quotas
- [ ] Incremental email sync via historyId
- [ ] Support for additional MIME types
- [ ] Entity deduplication and merging
- [ ] Relationship strength scoring
