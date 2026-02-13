# Onboarding Database Service

Implementation of persistent storage for the onboarding flow, enabling production use with multi-user support.

## Architecture

### Data Storage

1. **Entities** → Weaviate (tenant-isolated per userId)
2. **Relationships** → Weaviate (tenant-isolated per userId)
3. **Day Tracking** → PostgreSQL (`training_progress` table)
4. **Feedback** → In-memory (FeedbackService)

### Database Service (`database.ts`)

The `OnboardingDatabase` class wraps Weaviate operations and PostgreSQL day tracking:

```typescript
import { createOnboardingDatabase } from './services/database';

const database = createOnboardingDatabase(userId);

// Save entities to Weaviate
await database.saveEntities(entities, sourceId);

// Save relationships to Weaviate
await database.saveRelationships(relationships, sourceId);

// Mark day as processed in PostgreSQL
await database.markDayProcessed('2024-01-15', 'email', 50);

// Check if day already processed (idempotency)
const processed = await database.isDayProcessed('2024-01-15', 'email');

// Get processing stats
const stats = await database.getProcessingStats();
```

## Email Processor Integration

The `EmailProcessorService` now supports database persistence:

```typescript
import { createEmailProcessor } from './services/email-processor';

const processor = createEmailProcessor(oauthClient, {
  userId: 'user_123', // Enable database persistence
  batchSize: 50,
  maxEmailsPerDay: 100,
});

await processor.processSentEmails();
```

### Day Processing Flow

1. **Check if day processed** → Skip if already in `training_progress`
2. **Fetch emails** → From Gmail API
3. **Extract entities/relationships** → Via classifier
4. **Save to database** → Batch write to Weaviate
5. **Mark day processed** → Insert into `training_progress`
6. **Emit SSE updates** → Real-time progress

### Idempotency

Days are never reprocessed. The `training_progress` table ensures each day is processed exactly once per user:

```sql
-- Unique constraint prevents duplicate processing
UNIQUE INDEX training_progress_user_source_date_unique
  ON (userId, sourceType, processedDate)
```

## API Endpoints

### Start Processing (with userId)

```bash
POST /api/start
{
  "userId": "user_123",
  "userEmail": "user@example.com",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

### Get Database Statistics

```bash
GET /api/database/stats?userId=user_123
```

Response:
```json
{
  "entities": {
    "person": 150,
    "company": 45,
    "project": 30,
    "total": 225
  },
  "relationships": {
    "total": 380,
    "byType": {
      "works_for": 120,
      "works_on": 80
    },
    "avgConfidence": 0.85
  },
  "daysProcessed": 31,
  "processedDates": ["2024-01-01", "2024-01-02", ...]
}
```

### Flush All Data

```bash
POST /api/flush
```

Flushes both in-memory and database data for the current user.

## Database Schema

### `training_progress` Table

```typescript
{
  id: string;               // UUID
  userId: string;           // User ID (indexed)
  sessionId: string | null; // Optional training session link
  sourceType: 'email' | 'calendar';
  processedDate: string;    // YYYY-MM-DD format (date type)
  itemsFound: number;       // Number of items processed
  processedAt: Date;        // Timestamp
}

// Unique constraint: (userId, sourceType, processedDate)
```

### Weaviate Collections

**Entities** (tenant-isolated):
- `Person`, `Company`, `Project`, `Tool`, `Topic`, `Location`, `ActionItem`
- Each user has their own tenant partition
- Automatic tenant creation on first write

**Relationships** (tenant-isolated):
- Single `Relationship` collection
- Stores inferred relationships between entities
- Deduplication logic prevents duplicates

## Migration Path

### Phase 1: Backward Compatible (Current)

- API accepts optional `userId` parameter
- Without `userId`: memory-only mode (test harness)
- With `userId`: database persistence (production)

### Phase 2: Production Integration

1. **Authentication**: Get userId from session/JWT
2. **Multi-Account**: Support multiple Google accounts per user
3. **Resume**: Load from last processed day
4. **Budget Tracking**: Integrate with discovery/training budgets

### Phase 3: Advanced Features

1. **Batch Transactions**: Wrap day processing in DB transactions
2. **Quality Checks**: CI schema drift detection
3. **Retry Logic**: Automatic retry for failed days
4. **Progress Resumption**: Continue from last checkpoint

## Testing

### Manual Testing

```bash
# Start onboarding server
npm run dev:onboarding

# Authenticate via browser
open http://localhost:3333/oauth/login

# Start processing with database
curl -X POST http://localhost:3333/api/start \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user_123",
    "userEmail": "test@example.com",
    "startDate": "2024-01-01",
    "endDate": "2024-01-07"
  }'

# Check database stats
curl http://localhost:3333/api/database/stats?userId=test_user_123
```

### Integration Tests

```typescript
import { createOnboardingDatabase } from './services/database';

describe('OnboardingDatabase', () => {
  it('should mark day as processed and prevent reprocessing', async () => {
    const db = createOnboardingDatabase('test_user');

    // Mark day processed
    await db.markDayProcessed('2024-01-15', 'email', 50);

    // Check idempotency
    const processed = await db.isDayProcessed('2024-01-15', 'email');
    expect(processed).toBe(true);
  });
});
```

## Monitoring

### Database Metrics

```typescript
const stats = await database.getProcessingStats();

console.log(`
  Total Entities: ${stats.entities.total}
  Total Relationships: ${stats.relationships.total}
  Days Processed: ${stats.daysProcessed}
  Avg Confidence: ${stats.relationships.avgConfidence}
`);
```

### SSE Progress Updates

The progress service now includes database counts:

```json
{
  "type": "progress",
  "state": "processing",
  "emailsProcessed": 150,
  "entitiesFound": 225,
  "relationshipsFound": 380,
  "currentDay": "2024-01-15"
}
```

## Error Handling

### Database Failures

- Email processor continues even if database save fails
- Errors logged but don't stop day processing
- SSE error events emitted for monitoring

### Retry Strategy

```typescript
try {
  await database.saveEntities(entities, sourceId);
} catch (error) {
  console.error('Failed to persist entities:', error);
  // Continue processing, don't fail the whole day
  result.errors.push(`Database persistence failed: ${error.message}`);
}
```

## Performance Considerations

### Batch Writes

- Entities saved per day (not per email)
- Relationships saved per day
- Single database transaction per day

### Weaviate Tenant Isolation

- Each user gets dedicated tenant
- No cross-user data leakage
- Automatic cleanup when tenant removed

### PostgreSQL Indexing

```sql
-- Efficient day lookup
CREATE INDEX training_progress_user_id_idx ON training_progress(userId);
CREATE INDEX training_progress_processed_date_idx ON training_progress(processedDate);

-- Prevent duplicate processing
CREATE UNIQUE INDEX training_progress_user_source_date_unique
  ON training_progress(userId, sourceType, processedDate);
```

## Future Enhancements

1. **Streaming Inserts**: Write entities/relationships as they're discovered
2. **Checkpointing**: Save progress within a day for long-running processes
3. **Delta Sync**: Only process new emails since last run
4. **Calendar Integration**: Extend to process calendar events
5. **Conflict Resolution**: Handle concurrent processing attempts

## Related Files

- `src/onboarding/services/database.ts` - Main database service
- `src/onboarding/services/email-processor.ts` - Updated with persistence
- `src/onboarding/routes/api.ts` - Updated endpoints
- `src/lib/weaviate/entities.ts` - Weaviate entity operations
- `src/lib/weaviate/relationships.ts` - Weaviate relationship operations
- `src/lib/db/schema.ts` - PostgreSQL schema (training_progress table)
