# Email Entity Extraction Implementation Research

**Research Date:** January 5, 2026
**Research Agent:** AI Research Agent
**Research Scope:** Entity extraction from emails using Mistral API integration

---

## Executive Summary

**Key Finding:** Mistral AI is already configured and integrated via OpenRouter. No new API keys needed.

**Recommendation:** Implement entity extraction as a new service in `src/lib/extraction/` following established patterns from the Gmail and scoring services.

**Integration Strategy:** Use existing Mistral Small model via OpenRouter for cost-effective entity extraction, following the tiered AI architecture pattern already established in the codebase.

---

## 1. Existing Mistral/AI Integration ✅

### 1.1 OpenRouter Client (Already Configured)

**Location:** `src/lib/ai/client.ts`

**Current Setup:**
- **OpenRouter API Client:** Fully functional with retry logic, cost tracking, and usage statistics
- **Authentication:** Uses `OPENROUTER_API_KEY` environment variable (already in `.env.example`)
- **Singleton Pattern:** `getAIClient()` provides reusable client instance

**Mistral Models Available:**
```typescript
// From src/lib/ai/models.ts
MODELS = {
  CLASSIFIER: 'mistralai/mistral-small-3.2-24b-instruct',  // ✅ Already in use
  SCHEDULER: 'mistralai/mistral-small-3.2-24b-instruct',   // ✅ Already in use
  GENERAL: 'anthropic/claude-sonnet-4',
  ORCHESTRATOR: 'anthropic/claude-opus-4',
}

MODEL_COSTS = {
  'mistralai/mistral-small-3.2-24b-instruct': {
    input: 0.0001,   // $0.10 per 1M tokens
    output: 0.0003   // $0.30 per 1M tokens
  }
}
```

**Key Methods:**
- `client.chat()` - Basic completion with retry logic
- `client.streamChat()` - Streaming responses
- `client.classify()` - Quick classification using cheap model
- `client.escalate()` - Tier-based escalation (Mistral → Sonnet → Opus)

### 1.2 Existing Mistral Usage Patterns

**Classifier Agent:** `src/agents/classifier/`
- Uses Mistral Small for event classification
- Achieves 90%+ accuracy at cheap tier
- Cost: ~$0.000040 per classification
- **Pattern to follow:** Tiered approach with confidence thresholds

**Cost Tracking:**
- Automatic usage tracking per model
- Cost estimation before execution
- Actual cost logging after completion

---

## 2. Email Processing Infrastructure ✅

### 2.1 Gmail Service

**Location:** `src/lib/google/gmail.ts`

**Current Capabilities:**
- ✅ Email fetching with pagination
- ✅ Full email parsing (headers, body, HTML)
- ✅ Thread management
- ✅ Label handling
- ✅ Rate limiting (100ms between requests)
- ✅ Error handling and logging

**Email Data Structure:**
```typescript
// From src/lib/google/types.ts
interface Email {
  id: string;
  threadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: string;        // ✅ Plain text - ready for extraction
  htmlBody?: string;   // ✅ HTML version available
  date: Date;
  labels: string[];
  isSent: boolean;
  hasAttachments: boolean;
  snippet?: string;
  internalDate: number;
}
```

**Integration Points:**
- Authentication via service account with domain-wide delegation
- Batch processing support
- Sync status tracking

### 2.2 Email Fetching Example

```typescript
import { getGmailService } from '@/lib/google/gmail';

// Fetch emails
const gmail = await getGmailService(auth);
const { emails } = await gmail.fetchEmails({
  folder: 'all',
  maxResults: 100
});

// Each email has:
// - email.body (plain text)
// - email.subject
// - email.from.email / email.from.name
// - email.to[] array
```

---

## 3. Significance Scoring System (Pattern Reference)

### 3.1 Existing Scoring Architecture

**Location:** `src/lib/scoring/`

**Structure:**
```
src/lib/scoring/
├── types.ts              # Type definitions
├── email-scorer.ts       # Email scoring logic
├── contact-analyzer.ts   # Contact importance analysis
├── index.ts              # Module exports
└── README.md             # Documentation
```

**Key Patterns to Mimic:**

1. **Type-First Design:**
```typescript
// From src/lib/scoring/types.ts
export interface SignificanceScore {
  emailId: string;
  score: number;
  factors: ScoreFactor[];
  computedAt: Date;
}
```

2. **Context Building:**
```typescript
// Build context from batch for O(1) lookups
buildContext(emails: Email[], userEmail: string): ScoringContext {
  const contactFrequency = new Map<string, number>();
  const threadDepths = new Map<string, number>();
  // ...optimize for batch processing
}
```

3. **Batch Processing:**
```typescript
scoreBatch(emails: Email[], userEmail: string): SignificanceScore[] {
  const context = this.buildContext(emails, userEmail);
  return emails.map((email) => this.scoreEmail(email, context));
}
```

**Performance:**
- **Actual:** ~427 emails/second (0.234ms average per email)
- **Optimizations:** Pre-built context maps, O(1) lookups, no DB queries

### 3.2 No Existing Entity Extraction

**Current Limitations:**
- ❌ No keyword extraction
- ❌ No entity recognition (people, orgs, dates, locations)
- ❌ No topic detection
- ❌ No sentiment analysis

**Opportunity:** Build entity extraction as complementary service to scoring system

---

## 4. Recommended Project Structure

### 4.1 New Entity Extraction Service

**Proposed Location:** `src/lib/extraction/`

**Directory Structure:**
```
src/lib/extraction/
├── types.ts                 # Entity types, extraction results
├── entity-extractor.ts      # Main extraction service
├── prompts.ts              # Mistral prompts for extraction
├── cache.ts                # Optional: Cache results by email ID
├── index.ts                # Module exports
├── README.md               # Documentation
└── __tests__/
    └── entity-extractor.test.ts
```

### 4.2 Proposed Type Definitions

**File:** `src/lib/extraction/types.ts`

```typescript
/**
 * Entity types that can be extracted from emails
 */
export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'date'
  | 'time'
  | 'project'
  | 'topic'
  | 'action_item'
  | 'deadline';

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;      // 0-1 confidence score
  context?: string;        // Surrounding text for context
  position?: {
    start: number;
    end: number;
  };
}

export interface EntityExtractionResult {
  emailId: string;
  entities: ExtractedEntity[];
  keywords: string[];      // Top keywords
  topics: string[];        // High-level topics
  sentiment?: 'positive' | 'negative' | 'neutral';
  actionItems: string[];   // Extracted TODOs
  extractedAt: Date;
  cost: number;           // API cost for tracking
  model: string;          // Model used (for debugging)
}

export interface ExtractionConfig {
  extractEntities: boolean;        // Default: true
  extractKeywords: boolean;        // Default: true
  extractTopics: boolean;          // Default: true
  extractActionItems: boolean;     // Default: true
  extractSentiment: boolean;       // Default: false (more expensive)
  maxKeywords: number;             // Default: 10
  minConfidence: number;           // Default: 0.7
}

export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  extractEntities: true,
  extractKeywords: true,
  extractTopics: true,
  extractActionItems: true,
  extractSentiment: false,
  maxKeywords: 10,
  minConfidence: 0.7,
};
```

### 4.3 Main Extractor Service

**File:** `src/lib/extraction/entity-extractor.ts`

```typescript
/**
 * Entity Extractor
 *
 * Extracts entities, keywords, and topics from emails using Mistral Small
 */

import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import type { Email } from '../google/types';
import type {
  EntityExtractionResult,
  ExtractionConfig,
  ExtractedEntity,
} from './types';
import { DEFAULT_EXTRACTION_CONFIG } from './types';
import { buildExtractionPrompt } from './prompts';

export class EntityExtractor {
  private config: ExtractionConfig;
  private client = getAIClient();

  constructor(config?: Partial<ExtractionConfig>) {
    this.config = {
      ...DEFAULT_EXTRACTION_CONFIG,
      ...config,
    };
  }

  /**
   * Extract entities from a single email
   */
  async extractFromEmail(email: Email): Promise<EntityExtractionResult> {
    const prompt = buildExtractionPrompt(email, this.config);

    // Use Mistral Small (cheap tier) for extraction
    const response = await this.client.chat(
      [
        { role: 'system', content: 'You are an expert entity extraction system. Extract structured information from emails.' },
        { role: 'user', content: prompt }
      ],
      {
        model: MODELS.CLASSIFIER,  // Mistral Small
        maxTokens: 1000,
        temperature: 0.1,  // Low temperature for consistent extraction
        logCost: true,
      }
    );

    // Parse response (expecting JSON)
    const extracted = JSON.parse(response.content);

    return {
      emailId: email.id,
      entities: extracted.entities || [],
      keywords: extracted.keywords || [],
      topics: extracted.topics || [],
      sentiment: extracted.sentiment,
      actionItems: extracted.actionItems || [],
      extractedAt: new Date(),
      cost: response.usage.cost,
      model: response.model,
    };
  }

  /**
   * Batch extraction with cost tracking
   */
  async extractBatch(emails: Email[]): Promise<EntityExtractionResult[]> {
    const results: EntityExtractionResult[] = [];
    let totalCost = 0;

    console.log(`[EntityExtractor] Processing ${emails.length} emails...`);

    for (const email of emails) {
      try {
        const result = await this.extractFromEmail(email);
        results.push(result);
        totalCost += result.cost;
      } catch (error) {
        console.error(`[EntityExtractor] Failed to extract from ${email.id}:`, error);
        // Continue with other emails
      }
    }

    console.log(`[EntityExtractor] Completed ${results.length}/${emails.length} extractions`);
    console.log(`[EntityExtractor] Total cost: $${totalCost.toFixed(6)}`);

    return results;
  }

  /**
   * Get top entities across multiple emails (for building context)
   */
  getTopEntities(results: EntityExtractionResult[], limit = 20): Map<string, number> {
    const entityCounts = new Map<string, number>();

    for (const result of results) {
      for (const entity of result.entities) {
        const key = `${entity.type}:${entity.value}`;
        entityCounts.set(key, (entityCounts.get(key) || 0) + 1);
      }
    }

    // Sort by frequency and take top N
    const sorted = Array.from(entityCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return new Map(sorted);
  }
}
```

### 4.4 Extraction Prompts

**File:** `src/lib/extraction/prompts.ts`

```typescript
import type { Email } from '../google/types';
import type { ExtractionConfig } from './types';

export function buildExtractionPrompt(email: Email, config: ExtractionConfig): string {
  const tasks: string[] = [];

  if (config.extractEntities) {
    tasks.push('- Extract entities (people, organizations, locations, dates, times, projects)');
  }
  if (config.extractKeywords) {
    tasks.push(`- Extract top ${config.maxKeywords} keywords`);
  }
  if (config.extractTopics) {
    tasks.push('- Identify high-level topics (e.g., "meeting scheduling", "bug report", "project update")');
  }
  if (config.extractActionItems) {
    tasks.push('- Extract action items, TODOs, or requests');
  }
  if (config.extractSentiment) {
    tasks.push('- Determine overall sentiment (positive, negative, neutral)');
  }

  return `Extract structured information from this email.

**From:** ${email.from.name || email.from.email}
**To:** ${email.to.map(t => t.name || t.email).join(', ')}
**Subject:** ${email.subject}
**Date:** ${email.date.toISOString()}

**Body:**
${email.body}

**Tasks:**
${tasks.join('\n')}

**Response Format (JSON only):**
{
  "entities": [
    { "type": "person", "value": "John Doe", "confidence": 0.95 },
    { "type": "organization", "value": "Acme Corp", "confidence": 0.9 }
  ],
  "keywords": ["meeting", "deadline", "review"],
  "topics": ["project planning", "code review"],
  "actionItems": ["Schedule follow-up meeting", "Review PR #123"],
  "sentiment": "neutral"
}

Respond with JSON only. Use confidence scores 0-1. Minimum confidence: ${config.minConfidence}.`;
}
```

---

## 5. Environment Variables

### 5.1 Current Setup ✅

**File:** `.env.example`

```bash
# OpenRouter API Key (for AI model access via OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-xxxxx  # ✅ Already configured

# No additional keys needed for Mistral!
# Mistral is accessed via OpenRouter using same API key
```

### 5.2 No Additional Configuration Required

**Why this works:**
- OpenRouter provides unified API for multiple AI providers
- Single API key accesses Mistral, Claude, and other models
- Cost tracking built-in to OpenRouter client
- No direct Mistral API integration needed

---

## 6. Dependencies

### 6.1 Already Installed ✅

From `package.json`:
```json
{
  "dependencies": {
    "openai": "^6.15.0",        // ✅ OpenRouter uses OpenAI SDK format
    "googleapis": "^169.0.0",    // ✅ Gmail API
    "inngest": "^3.48.1",        // ✅ Event processing (future use)
    "zod": "^4.3.5"             // ✅ Schema validation
  }
}
```

### 6.2 No New Dependencies Required

**Why:**
- Mistral accessed via existing OpenRouter client
- Gmail service already handles email fetching
- TypeScript provides type safety
- No NLP libraries needed (Mistral handles extraction)

---

## 7. Integration with Gmail Ingestion

### 7.1 Current Email Flow

```
1. Authentication (Service Account + Domain-Wide Delegation)
   ↓
2. Gmail API Fetch (GmailService.fetchEmails())
   ↓
3. Email Parsing (parseEmail())
   ↓
4. Email Scoring (EmailScorer.scoreBatch())
   ↓
5. Storage (Future: Database)
```

### 7.2 Proposed Enhanced Flow

```
1. Authentication (Service Account + Domain-Wide Delegation)
   ↓
2. Gmail API Fetch (GmailService.fetchEmails())
   ↓
3. Email Parsing (parseEmail())
   ↓
4. Parallel Processing:
   ├─> Email Scoring (EmailScorer.scoreBatch())
   └─> Entity Extraction (EntityExtractor.extractBatch())
   ↓
5. Combined Storage (Email + Score + Entities)
```

### 7.3 Integration Example

```typescript
import { getGmailService } from '@/lib/google/gmail';
import { EmailScorer } from '@/lib/scoring';
import { EntityExtractor } from '@/lib/extraction';

// Fetch emails
const gmail = await getGmailService(auth);
const { emails } = await gmail.fetchEmails({ folder: 'all', maxResults: 100 });

// Process in parallel
const scorer = new EmailScorer();
const extractor = new EntityExtractor();

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

console.log(`Processed ${enrichedEmails.length} emails`);
console.log(`Total extraction cost: $${extractions.reduce((sum, e) => sum + e.cost, 0).toFixed(6)}`);
```

---

## 8. Cost Analysis

### 8.1 Mistral Small Pricing

**Per 1M Tokens:**
- Input: $0.10 (0.0001 per 1K)
- Output: $0.30 (0.0003 per 1K)

**Typical Email Extraction:**
- Input: ~500 tokens (email + prompt)
- Output: ~200 tokens (extracted entities JSON)
- **Cost per email:** ~$0.00011

### 8.2 Projected Costs

**100 emails:**
- Cost: ~$0.011 (1.1 cents)
- Time: ~30 seconds (3 emails/sec with rate limiting)

**1,000 emails:**
- Cost: ~$0.11 (11 cents)
- Time: ~5 minutes

**10,000 emails (full inbox):**
- Cost: ~$1.10
- Time: ~50 minutes

### 8.3 Optimization Strategies

1. **Batch Processing:** Process multiple emails concurrently
2. **Caching:** Store extraction results by email ID
3. **Selective Extraction:** Only extract from high-scoring emails
4. **Incremental Processing:** Extract only new/updated emails

**Example Cost Reduction:**
```typescript
// Only extract from top 20% significant emails
const topEmails = scores
  .sort((a, b) => b.score - a.score)
  .slice(0, Math.ceil(emails.length * 0.2))
  .map(score => emails.find(e => e.id === score.emailId)!);

const extractions = await extractor.extractBatch(topEmails);
// Cost reduced by 80%
```

---

## 9. Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1)
1. ✅ **Verify Mistral access** via OpenRouter (already working)
2. Create `src/lib/extraction/` directory structure
3. Implement type definitions (`types.ts`)
4. Build extraction prompts (`prompts.ts`)
5. Create main `EntityExtractor` class

### Phase 2: Integration (Week 2)
1. Write unit tests for entity extractor
2. Test with sample emails from Gmail
3. Integrate with email scoring pipeline
4. Add cost tracking and logging
5. Implement caching layer (optional)

### Phase 3: Optimization (Week 3)
1. Benchmark extraction performance
2. Tune confidence thresholds
3. Add selective extraction (only high-score emails)
4. Implement batch processing optimizations
5. Add monitoring and metrics

### Phase 4: Memory Integration (Week 4)
1. Store extracted entities in database
2. Build entity frequency tracking
3. Create contact/organization relationship graph
4. Integrate with Mem0 memory layer (POC-5)

---

## 10. Success Metrics

### Performance Targets
- **Throughput:** 3-5 emails/second
- **Accuracy:** >85% entity recognition
- **Cost:** <$0.0002 per email
- **Latency:** <1 second per email

### Quality Metrics
- **Entity Precision:** % of extracted entities that are correct
- **Entity Recall:** % of actual entities that are extracted
- **Keyword Relevance:** User validation of top keywords
- **Action Item Detection:** % of TODOs successfully identified

---

## 11. Existing Patterns to Follow

### 11.1 Code Organization (from Gmail Service)

✅ **Good patterns:**
- Singleton factory pattern: `getGmailService(auth)`
- Comprehensive error handling with context
- Rate limiting between API calls
- Structured logging with service prefix (`[Gmail]`, `[EntityExtractor]`)
- TypeScript-first with full type coverage

### 11.2 AI Client Usage (from Classifier)

✅ **Good patterns:**
- Use tiered models (cheap → standard → premium)
- Log costs for monitoring
- Retry logic with exponential backoff
- Cost estimation before execution
- Usage tracking per model

### 11.3 Batch Processing (from Email Scorer)

✅ **Good patterns:**
- Build context once for O(1) lookups
- In-memory data structures for performance
- No database queries during scoring
- Process arrays with `.map()` for parallelization
- Return detailed metrics (count, time, cost)

---

## 12. Testing Strategy

### 12.1 Unit Tests

**File:** `src/lib/extraction/__tests__/entity-extractor.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { EntityExtractor } from '../entity-extractor';
import type { Email } from '../../google/types';

describe('EntityExtractor', () => {
  it('extracts entities from sample email', async () => {
    const mockEmail: Email = {
      id: 'test-123',
      subject: 'Meeting with John Doe at Acme Corp',
      body: 'Hi, let\'s meet on January 10th to discuss the project.',
      // ... other required fields
    };

    const extractor = new EntityExtractor();
    const result = await extractor.extractFromEmail(mockEmail);

    expect(result.entities).toContainEqual(
      expect.objectContaining({ type: 'person', value: 'John Doe' })
    );
    expect(result.entities).toContainEqual(
      expect.objectContaining({ type: 'organization', value: 'Acme Corp' })
    );
  });
});
```

### 12.2 Integration Tests

Test with real Gmail API:
1. Fetch 10 sample emails
2. Run entity extraction
3. Validate output format
4. Check cost tracking
5. Verify error handling

---

## 13. Documentation Requirements

1. **README.md** in `src/lib/extraction/`
   - Service overview
   - Usage examples
   - API reference
   - Cost analysis
   - Performance benchmarks

2. **Inline Documentation**
   - TSDoc comments for all public methods
   - Type documentation
   - Usage examples in comments

3. **Architecture Docs**
   - Update `docs/architecture/izzie-architecture.md`
   - Add entity extraction section
   - Document integration points

---

## 14. Next Steps

### Immediate Actions (Today)

1. **Create directory structure:**
   ```bash
   mkdir -p src/lib/extraction/__tests__
   ```

2. **Create initial files:**
   - `types.ts` (entity definitions)
   - `prompts.ts` (extraction prompts)
   - `entity-extractor.ts` (main service)
   - `index.ts` (exports)
   - `README.md` (documentation)

3. **Write basic test:**
   - Test with sample email
   - Verify Mistral API access
   - Validate JSON parsing

### This Week

1. Implement full `EntityExtractor` class
2. Write comprehensive unit tests
3. Test with real Gmail emails
4. Add cost tracking and logging
5. Document usage patterns

### Next Week

1. Integrate with email scoring pipeline
2. Add caching layer
3. Benchmark performance
4. Optimize batch processing
5. Prepare for memory layer integration (POC-5)

---

## 15. Risk Assessment

### Low Risk ✅
- **Mistral already configured:** No API setup needed
- **Gmail integration mature:** Email fetching working
- **Clear patterns:** Similar to email scoring service
- **Cost-effective:** Mistral Small very cheap

### Medium Risk ⚠️
- **JSON parsing:** Mistral may return invalid JSON occasionally
  - **Mitigation:** Add robust parsing with fallback
- **Rate limiting:** Multiple API calls per email
  - **Mitigation:** Implement batch delay and exponential backoff
- **Entity accuracy:** May need prompt tuning
  - **Mitigation:** Start with high confidence threshold, iterate

### Negligible Risk ✓
- **Dependencies:** All already installed
- **Authentication:** Using existing OpenRouter key
- **Project structure:** Following established patterns

---

## 16. Related Work

### Completed
- ✅ Gmail API integration (Issue #XX)
- ✅ Email significance scoring (Issue #46)
- ✅ Classifier agent with Mistral (POC-1)

### In Progress
- 🔄 POC-1: Event classification and routing
- 🔄 POC-2: Database integration

### Future
- 📅 POC-5: Memory layer (Mem0) - entity extraction feeds here
- 📅 Contact relationship graph
- 📅 Topic clustering and analysis

---

## Conclusion

**Entity extraction implementation is straightforward:**

1. ✅ **Mistral already configured** via OpenRouter - no new API keys
2. ✅ **Email data readily available** from Gmail service
3. ✅ **Clear patterns exist** from scoring and classifier services
4. ✅ **Cost-effective** at ~$0.00011 per email
5. ✅ **Low risk** with high impact for memory building

**Recommended approach:** Create `src/lib/extraction/` service following established patterns, use Mistral Small via existing OpenRouter client, integrate with email scoring pipeline for selective extraction.

**Estimated implementation time:** 2-3 days for core functionality, 1 week for full integration and testing.

---

**Research conducted by:** AI Research Agent
**Document saved to:** `/docs/research/email-entity-extraction-implementation-2026-01-05.md`
**Related Issues:** Gmail integration, Email scoring (#46), Memory building (POC-5)
**Next Action:** Create `src/lib/extraction/` directory and implement type definitions
