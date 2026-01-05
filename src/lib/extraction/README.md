# Entity Extraction Service

Extracts structured entities from emails using Mistral AI for building user memory and context awareness.

## Overview

The Entity Extraction service analyzes emails to identify:
- **People** - Names from To/From/CC and email body
- **Companies** - Organizations mentioned
- **Projects** - Project names and references
- **Dates** - Important dates and deadlines
- **Topics** - Subject areas and themes
- **Locations** - Geographic references (cities, countries, addresses)

## Features

- ✅ **AI-Powered Extraction** - Uses Mistral Small via OpenRouter for cost-effective entity recognition
- ✅ **Batch Processing** - Process multiple emails efficiently with progress tracking
- ✅ **Entity Normalization** - Consistent entity naming (e.g., "Bob" → "bob_johnson")
- ✅ **Confidence Scoring** - Filter entities by confidence threshold (0.0-1.0)
- ✅ **Frequency Analysis** - Track which entities appear most often
- ✅ **Co-occurrence Mapping** - Identify which entities appear together
- ✅ **Cost Tracking** - Monitor API costs per email and batch
- ✅ **Email Thread Support** - Track entities across conversation threads

## Usage

### Basic Example

```typescript
import { getEntityExtractor } from '@/lib/extraction';
import { getGmailService } from '@/lib/google/gmail';

// Fetch emails
const gmail = await getGmailService(auth);
const { emails } = await gmail.fetchEmails({
  folder: 'inbox',
  maxResults: 100,
});

// Extract entities
const extractor = getEntityExtractor();
const results = await extractor.extractBatch(emails);

console.log(`Extracted ${results.length} results`);
console.log(`Total cost: $${results.reduce((sum, r) => sum + r.cost, 0).toFixed(6)}`);
```

### Single Email Extraction

```typescript
import { getEntityExtractor } from '@/lib/extraction';

const extractor = getEntityExtractor({
  minConfidence: 0.7,
  extractFromMetadata: true,
  extractFromSubject: true,
  extractFromBody: true,
});

const result = await extractor.extractFromEmail(email);

console.log(`Entities found: ${result.entities.length}`);
console.log(`Cost: $${result.cost.toFixed(6)}`);

// Access extracted entities
result.entities.forEach((entity) => {
  console.log(`${entity.type}: ${entity.value} (confidence: ${entity.confidence})`);
});
```

### Frequency Analysis

```typescript
import { getEntityExtractor } from '@/lib/extraction';

const extractor = getEntityExtractor();
const results = await extractor.extractBatch(emails);

// Get top 20 most frequent entities
const topEntities = extractor.getTopEntities(results, 20);

topEntities.forEach((freq) => {
  console.log(`${freq.entity.type}: ${freq.entity.value} - appears ${freq.count} times`);
});
```

### Co-occurrence Analysis

```typescript
import { getEntityExtractor } from '@/lib/extraction';

const extractor = getEntityExtractor();
const results = await extractor.extractBatch(emails);

// Get top 20 entity pairs that appear together
const topPairs = extractor.getTopCoOccurrences(results, 20);

topPairs.forEach((pair) => {
  console.log(
    `${pair.entity1.value} + ${pair.entity2.value} - appear together ${pair.count} times`
  );
});
```

### Custom Configuration

```typescript
import { getEntityExtractor } from '@/lib/extraction';

const extractor = getEntityExtractor({
  minConfidence: 0.8, // Only extract high-confidence entities
  extractFromMetadata: true, // Extract from To/From/CC
  extractFromSubject: true, // Extract from subject line
  extractFromBody: true, // Extract from email body
  normalizeEntities: true, // Normalize entity names
});
```

## Performance

### Test Results (3 Sample Emails)

```
Total Entities: 36
Total Cost: $0.000880
Average Entities/Email: 12
Average Cost/Email: $0.000293
Processing Time: ~78 seconds (3 emails)
```

### Expected Performance at Scale

**100 emails:**
- Cost: ~$0.029 (2.9 cents)
- Time: ~30-40 seconds
- Entities: ~1,200

**1,000 emails:**
- Cost: ~$0.29 (29 cents)
- Time: ~5-7 minutes
- Entities: ~12,000

**10,000 emails (full inbox):**
- Cost: ~$2.90
- Time: ~50-70 minutes
- Entities: ~120,000

## Entity Types

### Person
- Names from email metadata (To/From/CC)
- Names mentioned in email body
- Normalized format: `john_doe`
- Links email addresses to person entities

### Company
- Organization names
- Company references
- Normalized format: `acme_corp`

### Project
- Project names
- Product references
- Normalized format: `project_apollo`

### Date
- Important dates
- Deadlines
- Meeting dates
- Normalized format: `2025-01-15` (ISO format)

### Topic
- Subject areas
- Discussion themes
- Meeting topics
- Normalized format: `q1_launch_timeline`

### Location
- Cities
- Countries
- Office locations
- Addresses
- Normalized format: `san_francisco`

## Integration with Email Scoring

Combine entity extraction with email scoring for enhanced insights:

```typescript
import { getGmailService } from '@/lib/google/gmail';
import { EmailScorer } from '@/lib/scoring';
import { getEntityExtractor } from '@/lib/extraction';

// Fetch emails
const gmail = await getGmailService(auth);
const { emails } = await gmail.fetchEmails({ folder: 'all', maxResults: 100 });

// Process in parallel
const scorer = new EmailScorer();
const extractor = getEntityExtractor();

const [scores, extractions] = await Promise.all([
  scorer.scoreBatch(emails, userEmail),
  extractor.extractBatch(emails),
]);

// Combine results
const enrichedEmails = emails.map((email, i) => ({
  ...email,
  score: scores[i],
  entities: extractions[i],
}));

// Filter to high-value emails with entities
const significantEmails = enrichedEmails.filter(
  (email) => email.score.score > 50 && email.entities.entities.length > 0
);
```

## API Reference

### `EntityExtractor`

Main service class for entity extraction.

#### Constructor

```typescript
constructor(config?: Partial<ExtractionConfig>)
```

#### Methods

**`extractFromEmail(email: Email): Promise<ExtractionResult>`**
Extract entities from a single email.

**`extractBatch(emails: Email[]): Promise<ExtractionResult[]>`**
Extract entities from multiple emails with progress tracking.

**`buildFrequencyMap(results: ExtractionResult[]): Map<string, EntityFrequency>`**
Build entity frequency map across all results.

**`buildCoOccurrenceMap(results: ExtractionResult[]): Map<string, EntityCoOccurrence>`**
Build entity co-occurrence map (which entities appear together).

**`getTopEntities(results: ExtractionResult[], limit = 20): EntityFrequency[]`**
Get top N most frequent entities.

**`getTopCoOccurrences(results: ExtractionResult[], limit = 20): EntityCoOccurrence[]`**
Get top N entity pairs that appear together.

**`normalizeEntityName(name: string): string`**
Normalize entity name for consistent tracking.

### Types

**`Entity`**
```typescript
interface Entity {
  type: EntityType;
  value: string;
  normalized: string;
  confidence: number; // 0-1
  source: 'metadata' | 'body' | 'subject';
  context?: string;
}
```

**`ExtractionResult`**
```typescript
interface ExtractionResult {
  emailId: string;
  entities: Entity[];
  extractedAt: Date;
  cost: number;
  model: string;
}
```

**`ExtractionConfig`**
```typescript
interface ExtractionConfig {
  minConfidence: number; // Default: 0.7
  extractFromMetadata: boolean; // Default: true
  extractFromSubject: boolean; // Default: true
  extractFromBody: boolean; // Default: true
  normalizeEntities: boolean; // Default: true
}
```

## Cost Optimization

### Selective Extraction

Only extract from high-scoring emails:

```typescript
const scorer = new EmailScorer();
const scores = scorer.scoreBatch(emails, userEmail);

// Only extract from top 20% significant emails
const topEmails = scores
  .sort((a, b) => b.score - a.score)
  .slice(0, Math.ceil(emails.length * 0.2))
  .map((score) => emails.find((e) => e.id === score.emailId)!);

const extractions = await extractor.extractBatch(topEmails);
// Cost reduced by 80%
```

### Caching

Implement caching to avoid re-extracting from the same emails:

```typescript
const cache = new Map<string, ExtractionResult>();

const extractWithCache = async (email: Email): Promise<ExtractionResult> => {
  const cached = cache.get(email.id);
  if (cached) {
    return cached;
  }

  const result = await extractor.extractFromEmail(email);
  cache.set(email.id, result);
  return result;
};
```

## Testing

### Test Endpoint

Visit `/api/extraction/test` to test entity extraction with sample emails.

### Sample Response

```json
{
  "success": true,
  "summary": {
    "totalEmails": 3,
    "totalEntities": 36,
    "totalCost": 0.0008795,
    "averageEntitiesPerEmail": 12,
    "averageCostPerEmail": 0.0002931666666666667
  },
  "results": [...],
  "analysis": {
    "topEntities": [
      {
        "type": "person",
        "value": "John Doe",
        "normalized": "john_doe",
        "count": 3,
        "emailIds": ["test-email-1", "test-email-2", "test-email-3"]
      }
    ],
    "topCoOccurrences": [
      {
        "entity1": { "type": "person", "value": "John Doe" },
        "entity2": { "type": "project", "value": "Project Apollo" },
        "count": 3,
        "emailIds": ["test-email-1", "test-email-2", "test-email-3"]
      }
    ]
  }
}
```

## Error Handling

The service includes robust error handling:

```typescript
try {
  const result = await extractor.extractFromEmail(email);
  console.log(`Extracted ${result.entities.length} entities`);
} catch (error) {
  console.error('[Extraction] Failed:', error);
  // Service returns empty result on error
}
```

Batch processing continues on errors:

```typescript
const results = await extractor.extractBatch(emails);
// Some emails may fail, but processing continues
console.log(`Successfully processed ${results.filter(r => r.entities.length > 0).length} emails`);
```

## Future Enhancements

- [ ] **Database Integration** - Store extracted entities in database
- [ ] **Entity Linking** - Link email addresses to person entities
- [ ] **Name Disambiguation** - Resolve "Bob" vs "Robert Smith"
- [ ] **Sentiment Analysis** - Add sentiment scores to entities
- [ ] **Action Item Detection** - Extract TODOs and follow-ups
- [ ] **Memory Layer Integration** - Feed entities to Mem0 (POC-5)
- [ ] **Relationship Graph** - Build contact/organization network
- [ ] **Topic Clustering** - Group emails by extracted topics

## Related Documentation

- [Email Scoring Service](../scoring/README.md)
- [Gmail Service](../google/gmail.ts)
- [AI Client](../ai/client.ts)
- [Research Document](../../../docs/research/email-entity-extraction-implementation-2026-01-05.md)

## License

Part of Izzie2 project - Internal use only.
