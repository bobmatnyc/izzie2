# Izzie2 - AI Personal Assistant

> **Project Context for AI Agents**
> This file provides comprehensive project knowledge for Claude Code, Claude Desktop, and other AI assistants working on Izzie2.

---

## Project Overview

**Izzie2** is an intelligent personal assistant that unifies communication and scheduling management across email, calendar, documents, and project management tools. Built with Next.js 15, TypeScript, and a multi-agent AI architecture.

**Key Characteristics:**
- **Serverless-First**: Optimized for Vercel edge deployment
- **Multi-Agent Architecture**: Specialized AI agents for different tasks (orchestrator, classifier, scheduler, notifier)
- **Hybrid Memory**: RAG (vector search) + knowledge graph (Neo4j) for semantic and relationship queries
- **Cost-Optimized**: 3-tier AI model selection (cheap → standard → premium)
- **TypeScript Strict**: 100% type-safe codebase with Zod runtime validation

---

## Technology Stack

### Core Framework
- **Next.js 16.1.1** - App Router, React Server Components, Turbopack
- **React 19.2.3** - Latest React features
- **TypeScript 5.9.3** - Strict mode enforced throughout

### AI & Models
- **OpenRouter** - Multi-model access (Claude Opus 4.5, Mistral Large)
- **3-Tier Classification**: CHEAP (Mistral 7B) → STANDARD (Claude Haiku) → PREMIUM (Claude Opus)
- **Zod 4.3.5** - Schema validation and type inference

### Databases
- **Neon Postgres** - Serverless PostgreSQL with pgvector for embeddings
- **Neo4j Aura** - Knowledge graph for entity relationships
- **Mem0** - Hybrid vector + graph memory system (planned)

### External APIs
- **googleapis@169.0.0** - Gmail, Google Drive, Google Calendar
- **Inngest 3.48.1** - Event-driven durable workflows
- **Telegram Bot API** - Notifications (planned)

### Testing & Quality
- **Vitest 4.0.16** - Fast Vite-native test runner
- **46 comprehensive tests** - Unit, integration, E2E with 80% coverage minimum
- **ESLint + Prettier** - Strict TypeScript rules, consistent formatting
- **Pre-commit hooks** - Quality gates before commits

---

## Project Structure

```
izzie2/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API endpoints (16 routes)
│   │   │   ├── health/         # Health check
│   │   │   ├── gmail/          # Gmail sync endpoints
│   │   │   ├── drive/          # Google Drive integration
│   │   │   ├── extraction/     # Entity extraction
│   │   │   ├── scoring/        # Email significance scoring
│   │   │   ├── graph/          # Neo4j graph operations
│   │   │   ├── metrics/        # Performance metrics
│   │   │   ├── routing/        # Event classification
│   │   │   ├── webhooks/       # GitHub, Linear, Google
│   │   │   └── inngest/        # Event workflows
│   │   └── layout.tsx          # Root layout
│   │
│   ├── lib/                    # Shared libraries (9 core services)
│   │   ├── ai/                 # OpenRouter client wrapper
│   │   ├── events/             # Inngest event definitions (Zod schemas)
│   │   ├── extraction/         # Entity extraction (People, Companies, Projects, Topics)
│   │   ├── google/             # Gmail, Drive, Calendar APIs
│   │   ├── graph/              # Neo4j knowledge graph (7 node types, 7 relationships)
│   │   ├── memory/             # Mem0 hybrid retrieval (planned)
│   │   ├── metrics/            # Performance tracking
│   │   ├── routing/            # 3-tier event classifier + dispatcher
│   │   └── scoring/            # Email significance scoring
│   │
│   ├── agents/                 # AI Agent implementations
│   │   ├── orchestrator/       # Claude Opus (main reasoning)
│   │   ├── classifier/         # Mistral (event routing)
│   │   ├── scheduler/          # Calendar management
│   │   └── notifier/           # Notifications & summaries
│   │
│   └── types/                  # TypeScript type definitions
│
├── tests/                      # Test suite (46 tests, ~1,800 LOC)
│   ├── unit/                   # Classifier (15), Dispatcher (17)
│   ├── integration/            # Pipeline (9 tests)
│   └── e2e/                    # POC validation (5 tests)
│
└── docs/                       # Documentation (15+ guides)
    ├── architecture/           # System architecture spec
    ├── implementation/         # Feature implementation summaries
    └── research/               # Research documents
```

---

## Core Services

### 1. Gmail Service (`src/lib/google/gmail.ts`)
**Purpose**: Fetch and process Gmail emails

**Key Features:**
- OAuth2 + service account authentication (domain-wide delegation)
- Batch email fetching with pagination
- Thread processing and deduplication
- **isSent flag**: Critical for email significance scoring
- Rate limiting and retry logic

**Usage:**
```typescript
import { getGmailService } from '@/lib/google/gmail';

const gmail = await getGmailService(auth);
const { emails } = await gmail.fetchEmails({ folder: 'all', maxResults: 100 });
```

### 2. Entity Extraction (`src/lib/extraction/`)
**Purpose**: Extract structured entities from unstructured email text

**Entities Extracted:**
- **People**: Names, roles, email addresses
- **Companies**: Organizations, domains
- **Projects**: Initiatives, codenames
- **Topics**: Discussion themes, categories
- **Locations**: Places mentioned
- **Dates/Times**: Event timestamps

**Process:**
1. Build AI prompt with email content
2. Send to OpenRouter (Claude/Mistral)
3. Parse JSON response with entities
4. Normalize names (case-insensitive)
5. Track confidence scores and co-occurrences

**Usage:**
```typescript
import { getEntityExtractor } from '@/lib/extraction';

const extractor = getEntityExtractor();
const result = await extractor.extractFromEmail(email);
// result.entities: Array<{ type, name, confidence, context }>
```

### 3. Neo4j Knowledge Graph (`src/lib/graph/`)
**Purpose**: Build relationship graph from extracted entities

**Graph Schema:**
- **Node Types (7)**: Person, Company, Project, Topic, Location, Email, Document
- **Relationships (7)**: MENTIONED_IN, WORKS_WITH, DISCUSSED_TOPIC, COLLABORATES_ON, WORKS_FOR, RELATED_TO, PART_OF

**Key Features:**
- Incremental updates (MERGE pattern, no duplicates)
- Indexes on name, email, timestamp
- Batch operations for performance
- Connection pooling

**Common Queries:**
```typescript
import { getGraphQueries } from '@/lib/graph';

const queries = getGraphQueries();
const connections = await queries.findPersonConnections('John Doe');
const collaborators = await queries.getProjectCollaborators('Project Alpha');
const topicTrends = await queries.getTopicEvolution('AI', startDate, endDate);
```

### 4. Email Scoring (`src/lib/scoring/`)
**Purpose**: Predict email importance using engagement signals

**Scoring Philosophy:**
> **SENT emails are the strongest signal** (40 points) - User actively engaged

**Weight Distribution (100 points total):**
- `isSent`: 40 (user actively wrote and sent)
- `recipientFrequency`: 15 (frequent contacts are important)
- `isReply`: 15 (engagement indicator)
- `threadDepth`: 10 (sustained conversations)
- `hasStars`: 10 (explicit user signal)
- `hasAttachments`: 5 (often important content)
- `hasLabels`: 5 (organization signals importance)

**Usage:**
```typescript
import { EmailScorer, ContactAnalyzer } from '@/lib/scoring';

const scorer = new EmailScorer();
const topEmails = scorer.getTopSignificant(emails, userEmail, 10);

const analyzer = new ContactAnalyzer();
const vips = analyzer.getVIPContacts(emails, userEmail); // Top 10%
const frequent = analyzer.getFrequentCorrespondents(emails, userEmail, 5);
```

**Performance**: ~427 emails/second (target: 1000 emails in <5s)

### 5. Event Routing (`src/lib/routing/`)
**Purpose**: 3-tier classifier with cost/latency optimization

**Classification Tiers:**
1. **CHEAP** (Mistral 7B): ~$0.001/event, <500ms, confidence ≥0.85
2. **STANDARD** (Claude Haiku): ~$0.003/event, <1000ms, confidence ≥0.75
3. **PREMIUM** (Claude Opus): ~$0.01/event, <2000ms, final decision

**Event Categories → Agent Routing:**
- `CALENDAR` → Scheduler Agent
- `COMMUNICATION` → Notifier Agent
- `TASK` → Orchestrator Agent
- `NOTIFICATION` → Notifier Agent
- `UNKNOWN` → Orchestrator Agent

**POC-1 Success Criteria:**
- ✅ Accuracy: ≥90% (achieved 100% in tests)
- ✅ Cost: <$0.01/event (achieved $0.001)
- ✅ Latency: <2s/event (achieved 10ms with mocks)

---

## API Endpoints (16 routes)

### Health & Metrics
- `GET /api/health` - Health check (status, timestamp, version)
- `GET /api/metrics` - Performance metrics (costs, latency, accuracy)

### Gmail Integration
- `POST /api/gmail/sync` - Sync emails from Gmail
- `GET /api/gmail/test` - Test Gmail API connection

### Entity Extraction
- `GET /api/extraction/test` - Test entity extraction with sample email

### Email Scoring
- `POST /api/scoring/analyze` - Analyze batch of emails for significance
- `GET /api/scoring/test` - Test scoring with fixtures

### Knowledge Graph
- `POST /api/graph/build` - Build Neo4j graph from emails
- `GET /api/graph/test` - Test Neo4j connection and queries

### Event Routing
- `GET /api/routing/test` - Test event classification

### Webhooks
- `POST /api/webhooks/github` - GitHub webhook handler
- `POST /api/webhooks/linear` - Linear webhook handler
- `POST /api/webhooks/google` - Google Calendar webhook handler

### Others
- `GET /api/ai/test` - Test OpenRouter integration
- `GET /api/drive/test` - Test Drive API connection
- `POST /api/inngest` - Inngest function endpoint

---

## Environment Variables

### Required Configuration (`.env.example`)

```bash
# AI Models (OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Database (Neon Postgres with pgvector)
DATABASE_URL=postgresql://user:password@host/database?sslmode=require  # pragma: allowlist secret

# Neo4j Knowledge Graph
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=xxxxx

# Event System (Inngest)
INNGEST_EVENT_KEY=your_event_key
INNGEST_SIGNING_KEY=your_signing_key

# Google OAuth (Gmail/Drive/Calendar)
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"  # pragma: allowlist secret
GOOGLE_ADMIN_EMAIL=admin@example.com

# Telegram Notifications
TELEGRAM_BOT_TOKEN=xxxxx:xxxxx

# Next.js
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3300
```

---

## Development Commands

### Daily Workflow
```bash
npm run dev           # Start dev server (localhost:3300, Turbopack)
npm run build         # Build for production
npm run start         # Start production server
npm run lint          # Run ESLint checks
npm run format        # Format code with Prettier
npm run type-check    # TypeScript type checking
```

### Testing (46 tests total)
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode (TDD workflow)
npm run test:unit     # Unit tests (32 tests)
npm run test:integration  # Integration tests (9 tests)
npm run test:e2e      # E2E/POC validation (5 tests)
npm run test:cov      # Coverage report (80% minimum)
npm run test:ui       # Interactive test UI
```

---

## Current POC Status

### ✅ POC-0: Project Setup (Complete)
- Next.js 16 App Router setup
- TypeScript strict mode
- OpenRouter client integration
- Health check endpoint
- Webhook handlers (placeholders)

### ✅ POC-1: Event Classification (Complete)
**Features:**
- 3-tier classifier (CHEAP → STANDARD → PREMIUM)
- Event dispatcher with routing rules
- Metrics collection system
- 46 comprehensive tests

**Success Metrics:**
- ✓ Accuracy: 100% (target ≥90%)
- ✓ Cost: $0.001/event (target <$0.01)
- ✓ Latency: 10ms (target <2000ms)

### 🔄 POC-2: Database Integration (In Progress)
**Completed:**
- ✅ Gmail API integration (batch fetching, threading)
- ✅ Google Drive API integration
- ✅ Entity extraction (People, Companies, Projects, Topics)
- ✅ Email significance scoring
- ✅ Neo4j knowledge graph (7 node types, 7 relationships)
- ✅ Graph query utilities
- ✅ All API endpoints

**Remaining:**
- Neon Postgres integration (pgvector)
- Mem0 hybrid retrieval setup
- Production authentication
- Data migration scripts

### 🔜 POC-3: Authentication (Planned)
- Better Auth integration
- Google OAuth flow
- User session management
- Protected API routes

### 🔜 POC-4: Event Processing (Planned)
- Inngest function implementation
- Webhook ingestion
- Background jobs
- Scheduled tasks (daily digest, reminders)

### 🔜 POC-5: Memory Layer (Planned)
- Mem0 hybrid retrieval (vector + graph)
- Automatic memory consolidation
- Temporal memory decay
- User preference learning

---

## Multi-Agent Architecture

### Agent Roles

**Orchestrator Agent** (Claude Opus 4.5)
- **File**: `src/agents/orchestrator/index.ts`
- **Status**: Placeholder
- **Role**: Main decision-making and complex reasoning
- **Use Cases**: Strategic planning, multi-step workflows, unknown events

**Classifier Agent** (Mistral Large)
- **File**: `src/agents/classifier/index.ts`
- **Status**: Implemented (POC-1)
- **Role**: Event classification and routing
- **Use Cases**: Categorize events, route to handlers, escalate on low confidence

**Scheduler Agent** (Mistral)
- **File**: `src/agents/scheduler/index.ts`
- **Status**: Placeholder
- **Role**: Calendar and scheduling management
- **Use Cases**: Event creation, conflict detection, reminder scheduling

**Notifier Agent** (Mistral)
- **File**: `src/agents/notifier/index.ts`
- **Status**: Placeholder
- **Role**: Notifications and summaries
- **Use Cases**: Draft messages, daily digests, alerts, multi-channel notifications

### Communication Flow

```
Webhook/Trigger
      ↓
Event Bus (Inngest)
      ↓
Classifier Agent → Route Decision
      ↓
┌─────┴─────┬─────────┬──────────┐
│           │         │          │
Orchestrator Scheduler Notifier  │
│           │         │          │
└─────┬─────┴─────────┴──────────┘
      ↓
Memory Layer (Mem0 + Neo4j)
      ↓
Actions (API calls, notifications)
```

---

## Testing Philosophy

### Test Structure
- **Unit Tests** (32 tests): Classifier (15), Dispatcher (17)
- **Integration Tests** (9 tests): End-to-end pipeline flows
- **E2E Tests** (5 tests): POC-1 criteria validation

### Testing Best Practices
- **AAA Pattern**: Arrange, Act, Assert
- **Mock External APIs**: No real API calls (MockOpenRouterClient)
- **Deterministic**: Same results every run
- **Fast Feedback**: Unit <1ms, Integration <10ms
- **Coverage**: 80% minimum enforced (branches, functions, lines, statements)

### Running Tests
```bash
# TDD workflow
npm run test:watch

# Single file
npx vitest run tests/unit/classifier.test.ts

# Single test
npx vitest run -t "should classify with CHEAP tier"

# Coverage report
npm run test:cov
open coverage/index.html
```

---

## Code Quality Standards

### TypeScript
- **Strict Mode**: Enabled throughout (`tsconfig.json`)
- **No Any Types**: Explicit types required
- **Return Types**: All functions have explicit return types
- **Zod Validation**: Runtime validation for external data

### Formatting
- **Prettier**: 2-space tabs, 100-char line width, single quotes
- **ESLint**: Next.js recommended + TypeScript strict rules
- **Pre-commit**: Auto-format on commit

### File Organization
- **Path Aliases**: `@/*` → `src/*`
- **Index Exports**: Each module has `index.ts` with re-exports
- **Single Responsibility**: Each service has clear purpose
- **Type Separation**: `types.ts` for shared types

### Error Handling
- **Graceful Degradation**: Services fail with warnings
- **Retry Logic**: Exponential backoff for transient failures
- **Detailed Logging**: Context-rich error messages
- **Type Safety**: Zod validates all inputs

---

## Common Patterns

### Creating API Endpoints
```typescript
// src/app/api/your-endpoint/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Your logic
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error in /api/your-endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Adding Services
```typescript
// src/lib/your-service/types.ts
export interface YourType {
  id: string;
  name: string;
}

// src/lib/your-service/your-service.ts
export class YourService {
  async doSomething(): Promise<YourType> {
    // Implementation
  }
}

// src/lib/your-service/index.ts
export { YourService } from './your-service';
export type { YourType } from './types';
```

### Writing Tests
```typescript
// tests/unit/your-service.test.ts
import { describe, it, expect } from 'vitest';
import { YourService } from '@/lib/your-service';

describe('YourService', () => {
  it('should do something', () => {
    const service = new YourService();
    const result = service.doSomething();
    expect(result).toBeDefined();
  });
});
```

---

## Documentation

### Architecture
- `docs/architecture/izzie-architecture.md` - System architecture (locked spec)

### Implementation
- `docs/implementation/neo4j-memory-graph-implementation.md` - Graph setup
- `docs/implementation/entity-extraction-implementation-summary.md` - Extraction

### Research
- `docs/research/izzie2-comprehensive-analysis-2026-01-05.md` - Complete analysis
- `docs/research/neo4j-memory-graph-integration-2026-01-05.md` - Graph research
- `docs/research/email-entity-extraction-implementation-2026-01-05.md` - Extraction

### Service READMEs
- `src/lib/scoring/README.md` - Email scoring system (450 lines)
- `tests/README.md` - Testing guide (1,200+ lines)

### Guides
- `docs/setup-complete.md` - POC-0 setup
- `docs/gmail-integration.md` - Gmail API
- `docs/classifier-flow.md` - Event classification

---

## Quick Start

### First Time Setup
```bash
# Clone and install
git clone https://github.com/bobmatnyc/izzie2.git
cd izzie2
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Run tests
npm test

# Start development
npm run dev  # http://localhost:3300
```

### Verify Installation
```bash
# Check health
curl http://localhost:3300/api/health

# Test OpenRouter
curl http://localhost:3300/api/ai/test

# Run POC-1 validation
npm run test:e2e
```

---

## Key Insights for AI Agents

### When Working on This Project

1. **Always Use Path Aliases**: `@/lib/your-service` not `../../lib/your-service`
2. **Validate External Data**: Use Zod schemas for all API inputs
3. **Batch Operations**: Gmail, extraction, graph all support batching
4. **Check Tests**: Run `npm run test:watch` during development
5. **Type Safety**: No `any` types, use `unknown` and type guards
6. **Error Handling**: All services fail gracefully with warnings
7. **Documentation**: Update service READMEs when adding features

### Common Tasks

- **Add Gmail Feature**: Modify `src/lib/google/gmail.ts`, add types to `types.ts`
- **Add Entity Type**: Update `src/lib/extraction/types.ts`, modify prompts
- **Add Graph Node**: Update `src/lib/graph/types.ts`, modify builder/queries
- **Add API Endpoint**: Create `src/app/api/your-route/route.ts`
- **Add Test**: Create in `tests/unit/` or `tests/integration/`

### Performance Considerations

- **Email Scoring**: Optimized for 1000 emails in <5s
- **Entity Extraction**: Batch process for efficiency
- **Graph Updates**: Use MERGE to avoid duplicates
- **Classification**: CHEAP tier handles 72% of events

### Security Notes

- **No Secrets in Code**: All credentials in `.env` files
- **OAuth Scopes**: Minimal required permissions
- **Input Validation**: Zod validates all external data
- **HTTPS Only**: SSL required for all external connections

---

## Project Statistics

- **Lines of Code**: ~5,000+ (src/), ~1,800 (tests/), ~10,000+ (total)
- **Test Count**: 46 tests (80% coverage minimum)
- **API Endpoints**: 16 routes
- **Services**: 9 core libraries
- **Dependencies**: 15 production, 11 development
- **Documentation**: 15+ markdown files
- **Git History**: Active development (recent POC-2 work)

---

## Contact & Resources

- **Repository**: https://github.com/bobmatnyc/izzie2
- **License**: ISC
- **Node Version**: Latest LTS recommended
- **Deployment**: Vercel (serverless)

---

**Last Updated**: January 5, 2026
**Document Version**: 1.0
**Research Source**: `docs/research/izzie2-comprehensive-analysis-2026-01-05.md`
