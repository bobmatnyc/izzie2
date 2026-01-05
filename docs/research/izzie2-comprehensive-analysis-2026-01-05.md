# Izzie2 Comprehensive Project Analysis

**Research Date:** January 5, 2026
**Researcher:** Claude Code Research Agent
**Purpose:** Complete codebase analysis for CLAUDE.md generation

---

## Executive Summary

Izzie2 is an AI-powered personal assistant built with Next.js 15, TypeScript, and a multi-agent architecture. The project uses serverless-first design targeting Vercel deployment with intelligent email processing, knowledge graph memory, and event-driven workflows.

**Current Status:**
- ✅ POC-1 Complete: Multi-tier event classification system
- ✅ POC-2 In Progress: Gmail/Drive integration, entity extraction, Neo4j knowledge graph
- 🔄 POC-3 Pending: Authentication (Better Auth)
- 🔄 POC-4 Pending: Event processing (Inngest)
- 🔄 POC-5 Pending: Memory layer (Mem0)

---

## 1. Project Purpose & Vision

### What is Izzie2?

Izzie2 is an intelligent personal assistant that unifies communication and scheduling management across multiple channels:
- **Email** (Gmail API)
- **Calendar** (Google Calendar)
- **Documents** (Google Drive)
- **Project Management** (GitHub, Linear)
- **Communication** (Slack, Telegram, SMS)

### Core Operating Modes

1. **Distinct Persona Mode**: Acts as a separate assistant entity
2. **Transparent Proxy Mode**: Acts on behalf of the user invisibly

### Key Principles

- **Serverless-First**: Optimized for Vercel edge deployment
- **TypeScript Throughout**: Strict type safety across entire stack
- **Model-Agnostic**: Uses OpenRouter for flexible AI model selection
- **Hybrid Memory**: RAG + knowledge graph for semantic and relationship queries
- **Proactive Event Loop**: Agent-driven actions based on schedules and triggers

---

## 2. Technology Stack

### Core Framework
- **Next.js 16.1.1** (App Router, React Server Components)
- **React 19.2.3** (Latest features)
- **TypeScript 5.9.3** (Strict mode enabled)
- **Turbopack** (Fast development builds)

### AI & Models
- **OpenRouter** (Multi-model access via single API)
  - Claude Opus 4.5 (orchestrator reasoning)
  - Mistral Large (event classification)
  - Cost-optimized tiered model selection
- **openai@6.15.0** (OpenRouter-compatible client)
- **Zod 4.3.5** (Schema validation and type inference)

### Databases
- **Neon Postgres** (Serverless PostgreSQL with pgvector)
- **Neo4j Aura** (Knowledge graph for entity relationships)
- **neo4j-driver@6.0.1** (Official Neo4j JavaScript client)

### Event System
- **Inngest 3.48.1** (Durable event-driven workflows)
- **QStash/Redis** (Upstash for long-running tasks)

### Authentication (Planned)
- **Better Auth** (TypeScript-first auth library)
- **Google OAuth** (Gmail/Drive/Calendar access)

### External APIs
- **googleapis@169.0.0** (Gmail, Drive, Calendar)
- **Telegram Bot API** (Notifications)
- **GitHub/Linear Webhooks** (Project management)

### Testing
- **Vitest 4.0.16** (Fast Vite-native test runner)
- **@testing-library/react@16.3.1** (React component testing)
- **happy-dom@20.0.11** (Lightweight DOM for tests)
- **Coverage**: 80% minimum threshold (branches, functions, lines, statements)

### Development Tools
- **ESLint 9.39.2** (TypeScript strict rules)
- **Prettier 3.7.4** (Code formatting)
- **Pre-commit hooks** (Quality gates)

### Deployment
- **Vercel** (Primary serverless platform)
- **Docker** (Container support)
- **GitHub Actions** (CI/CD)

---

## 3. Project Structure

```
/Users/masa/Projects/izzie2/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── api/                  # API Routes
│   │   │   ├── health/           # ✅ Health check endpoint
│   │   │   ├── ai/test/          # AI model testing
│   │   │   ├── gmail/            # Gmail sync/test endpoints
│   │   │   ├── drive/test/       # Drive API testing
│   │   │   ├── extraction/test/  # Entity extraction testing
│   │   │   ├── scoring/          # Email significance scoring
│   │   │   ├── graph/            # Neo4j graph operations
│   │   │   ├── metrics/          # Performance metrics
│   │   │   ├── routing/test/     # Event routing testing
│   │   │   ├── webhooks/         # GitHub, Linear, Google webhooks
│   │   │   └── inngest/          # Inngest function endpoint
│   │   ├── auth/                 # Authentication routes (planned)
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Home page
│   │   └── globals.css           # Global styles
│   │
│   ├── lib/                      # Shared Utilities (~594 LOC core)
│   │   ├── ai/                   # AI/LLM Integration
│   │   │   └── index.ts          # OpenRouter client wrapper
│   │   ├── events/               # Event Definitions
│   │   │   └── index.ts          # Inngest event schemas (Zod)
│   │   ├── extraction/           # Entity Extraction
│   │   │   ├── entity-extractor.ts   # Extract entities from emails
│   │   │   ├── prompts.ts            # Extraction prompts
│   │   │   ├── types.ts              # Entity types (Person, Company, etc.)
│   │   │   └── index.ts
│   │   ├── google/               # Google API Integration
│   │   │   ├── auth.ts           # OAuth & service account auth
│   │   │   ├── gmail.ts          # Gmail API wrapper
│   │   │   ├── drive.ts          # Drive API wrapper
│   │   │   ├── types.ts          # Email, Drive file types
│   │   │   └── index.ts
│   │   ├── graph/                # Neo4j Knowledge Graph
│   │   │   ├── neo4j-client.ts   # Neo4j driver wrapper
│   │   │   ├── graph-builder.ts  # Build graph from entities
│   │   │   ├── graph-queries.ts  # Common query patterns
│   │   │   ├── types.ts          # Node/relationship types
│   │   │   └── index.ts
│   │   ├── memory/               # Memory Layer
│   │   │   └── index.ts          # Mem0 hybrid retrieval (planned)
│   │   ├── metrics/              # Performance Metrics
│   │   │   ├── collector.ts      # Metrics collection
│   │   │   ├── types.ts          # Metric types
│   │   │   └── index.ts
│   │   ├── routing/              # Event Routing
│   │   │   ├── classifier.ts     # 3-tier event classifier
│   │   │   ├── dispatcher.ts     # Route to agent handlers
│   │   │   ├── types.ts          # Classification types
│   │   │   └── index.ts
│   │   └── scoring/              # Email Significance Scoring
│   │       ├── email-scorer.ts   # Score email importance
│   │       ├── contact-analyzer.ts   # Analyze contact relationships
│   │       ├── types.ts          # Scoring types
│   │       └── index.ts
│   │
│   ├── agents/                   # Agent Implementations
│   │   ├── orchestrator/         # Main Orchestrator (Claude Opus)
│   │   │   └── index.ts          # Decision-making agent (placeholder)
│   │   ├── classifier/           # Event Classifier (Mistral)
│   │   │   └── index.ts          # Route events to agents (placeholder)
│   │   ├── scheduler/            # Calendar Scheduler
│   │   │   └── index.ts          # Schedule management (placeholder)
│   │   └── notifier/             # Notification Agent
│   │       └── index.ts          # Send alerts/summaries (placeholder)
│   │
│   └── types/                    # TypeScript Type Definitions
│       └── index.ts              # Shared types
│
├── tests/                        # Test Suite (~1,800 LOC)
│   ├── __fixtures__/
│   │   └── events.ts             # Test event fixtures (8 types)
│   ├── mocks/
│   │   └── openrouter.ts         # Mock OpenRouter client
│   ├── unit/
│   │   ├── classifier.test.ts    # TieredClassifier tests (15 tests)
│   │   └── dispatcher.test.ts    # EventDispatcher tests (17 tests)
│   ├── integration/
│   │   └── pipeline.test.ts      # Full pipeline tests (9 tests)
│   ├── e2e/
│   │   └── poc-validation.test.ts    # POC-1 validation (5 tests)
│   ├── setup.ts                  # Test configuration
│   └── README.md                 # Comprehensive testing guide
│
├── docs/                         # Documentation
│   ├── architecture/
│   │   └── izzie-architecture.md # System architecture spec
│   ├── implementation/
│   │   ├── neo4j-memory-graph-implementation.md
│   │   └── entity-extraction-implementation-summary.md
│   ├── research/
│   │   ├── neo4j-memory-graph-integration-2026-01-05.md
│   │   ├── email-entity-extraction-implementation-2026-01-05.md
│   │   ├── google-drive-api-integration-analysis-2026-01-05.md
│   │   └── izzie2-architecture-analysis-2026-01-05.md
│   ├── setup-complete.md         # POC-0 setup summary
│   ├── gmail-integration.md      # Gmail API guide
│   ├── google-drive-implementation.md
│   └── classifier-flow.md        # Event classification flow
│
├── .env.example                  # Environment variable template
├── .gitignore                    # Git ignore patterns
├── tsconfig.json                 # TypeScript strict config
├── next.config.ts                # Next.js 16 config (Cache Components)
├── vitest.config.ts              # Vitest test configuration
├── .eslintrc.json                # ESLint strict rules
├── .prettierrc                   # Prettier code formatting
├── package.json                  # Dependencies and scripts
├── CLAUDE.md                     # Project memory (KuzuMemory)
└── README.md                     # Project overview
```

---

## 4. Key Services & Libraries

### Gmail Service (`src/lib/google/gmail.ts`)

**Purpose**: Fetch and process Gmail emails with intelligent filtering

**Key Features:**
- OAuth2 and service account authentication
- Batch email fetching with pagination
- Thread processing and deduplication
- Label management (INBOX, SENT, STARRED, etc.)
- Rate limiting and retry logic
- Parse email headers, body, attachments
- **isSent flag**: Critical for email significance scoring

**API Methods:**
```typescript
await gmail.fetchEmails({ folder: 'all', maxResults: 100 })
await gmail.getThreads(email.threadId)
await gmail.syncEmails({ since: lastSyncTime })
```

### Drive Service (`src/lib/google/drive.ts`)

**Purpose**: Access and process Google Drive files

**Key Features:**
- List files with pagination
- Search files by query
- Download file contents
- Parse file metadata (permissions, owners, timestamps)
- Support for Docs, Sheets, Slides, PDFs

**API Methods:**
```typescript
await drive.listFiles({ pageSize: 100 })
await drive.searchFiles({ query: 'mimeType="application/pdf"' })
await drive.getFileContent(fileId)
```

### Entity Extraction (`src/lib/extraction/`)

**Purpose**: Extract structured entities from unstructured email text

**Entities Extracted:**
- **People**: Names, roles, relationships
- **Companies**: Organizations, domains
- **Projects**: Initiatives, codenames
- **Topics**: Discussion themes
- **Locations**: Places mentioned
- **Dates/Times**: Event timestamps

**Process:**
1. Build AI prompt with email content
2. Send to OpenRouter (Claude/Mistral)
3. Parse JSON response with entity array
4. Normalize entity names (case-insensitive)
5. Track confidence scores
6. Build co-occurrence relationships

**Performance:**
- Batch processing for efficiency
- Configurable entity types
- Confidence thresholds (default: 0.7)

### Neo4j Knowledge Graph (`src/lib/graph/`)

**Purpose**: Build relationship graph from extracted entities

**Graph Schema:**

**Node Types (7):**
1. `Person` (name, email, frequency, confidence)
2. `Company` (name, domain, frequency)
3. `Project` (name, status, frequency)
4. `Topic` (name, category, frequency)
5. `Location` (name, type, frequency)
6. `Email` (id, subject, timestamp, significanceScore)
7. `Document` (id, type, source, title)

**Relationship Types (7):**
1. `MENTIONED_IN` (Entity → Email/Document)
2. `WORKS_WITH` (Person → Person)
3. `DISCUSSED_TOPIC` (Person → Topic)
4. `COLLABORATES_ON` (Person → Project)
5. `WORKS_FOR` (Person → Company)
6. `RELATED_TO` (Topic → Topic)
7. `PART_OF` (Project → Project)

**Key Operations:**
```typescript
await graphBuilder.buildFromEmails(emails, extractionResults)
await graphQueries.findPersonConnections(personName)
await graphQueries.getProjectCollaborators(projectName)
await graphQueries.getTopicEvolution(topicName, startDate, endDate)
```

**Optimizations:**
- Incremental updates with MERGE pattern (no duplicates)
- Indexes on name, email, timestamp
- Batch operations for performance
- Connection pooling

### Email Scoring (`src/lib/scoring/`)

**Purpose**: Predict email importance using engagement signals

**Scoring Philosophy:**
> **SENT emails are the strongest signal** - User actively engaged

**Weights (Total: 100 points):**
- `isSent`: 40 points (highest weight)
- `isReply`: 15 points
- `recipientFrequency`: 15 points (frequent contacts)
- `threadDepth`: 10 points
- `hasStars`: 10 points
- `hasAttachments`: 5 points
- `hasLabels`: 5 points (custom organization)

**Contact Analysis:**
```typescript
const scorer = new EmailScorer()
const topEmails = scorer.getTopSignificant(emails, userEmail, 10)

const analyzer = new ContactAnalyzer()
const vips = analyzer.getVIPContacts(emails, userEmail) // Top 10%
const frequent = analyzer.getFrequentCorrespondents(emails, userEmail, 5)
```

**Performance:**
- Target: 1000 emails in <5s
- Actual: ~427 emails/second
- In-memory processing (no DB queries)

### Event Routing (`src/lib/routing/`)

**Purpose**: 3-tier classifier with cost/latency optimization

**Classification Tiers:**
1. **CHEAP** (Mistral 7B): ~$0.001/event, <500ms
   - Confidence threshold: 0.85
   - Escalate if confidence < 0.85
2. **STANDARD** (Claude Haiku): ~$0.003/event, <1000ms
   - Confidence threshold: 0.75
   - Escalate if confidence < 0.75
3. **PREMIUM** (Claude Opus): ~$0.01/event, <2000ms
   - Final decision, no escalation

**Event Categories:**
- `CALENDAR` → Scheduler Agent
- `COMMUNICATION` → Notifier Agent
- `TASK` → Orchestrator Agent
- `NOTIFICATION` → Notifier Agent
- `UNKNOWN` → Orchestrator Agent

**POC-1 Success Criteria:**
- ✅ Accuracy: ≥90% correct classifications
- ✅ Cost: <$0.01 per event
- ✅ Latency: <2 seconds per event

### Metrics System (`src/lib/metrics/`)

**Purpose**: Track performance, costs, and accuracy

**Metrics Collected:**
- API call counts and durations
- Model selection distribution
- Cost tracking per event/batch
- Classification accuracy
- Error rates and types
- Latency percentiles (p50, p95, p99)

**API Endpoint:**
```
GET /api/metrics
{
  "totalEvents": 1500,
  "accuracy": 0.94,
  "avgCost": 0.0042,
  "avgLatency": 847,
  "modelDistribution": {
    "CHEAP": 0.72,
    "STANDARD": 0.21,
    "PREMIUM": 0.07
  }
}
```

### Memory Layer (`src/lib/memory/`)

**Purpose**: Hybrid RAG + graph memory system (Mem0)

**Status**: Planned for POC-5

**Features:**
- Semantic search via pgvector (Neon Postgres)
- Relationship queries via Neo4j
- Automatic memory consolidation
- Temporal memory decay
- User preference learning

---

## 5. API Routes

### Health & Testing
- `GET /api/health` - Health check (status, timestamp, version)
- `GET /api/ai/test` - Test OpenRouter integration
- `GET /api/metrics` - Performance metrics

### Gmail Integration
- `POST /api/gmail/sync` - Sync emails from Gmail
- `GET /api/gmail/test` - Test Gmail API connection

### Drive Integration
- `GET /api/drive/test` - Test Drive API connection

### Entity Extraction
- `GET /api/extraction/test` - Test entity extraction

### Email Scoring
- `POST /api/scoring/analyze` - Analyze email significance
- `GET /api/scoring/test` - Test scoring with fixtures

### Knowledge Graph
- `POST /api/graph/build` - Build graph from emails
- `GET /api/graph/test` - Test Neo4j connection and queries

### Event Routing
- `GET /api/routing/test` - Test event classification

### Webhooks
- `POST /api/webhooks/github` - GitHub webhook handler
- `POST /api/webhooks/linear` - Linear webhook handler
- `POST /api/webhooks/google` - Google Calendar webhook handler

### Event System
- `POST /api/inngest` - Inngest function endpoint

---

## 6. Environment Variables

### Required (`.env.example`)

```bash
# AI Models (OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Database (Neon Postgres)
DATABASE_URL=postgresql://user:password@host/database?sslmode=require  # pragma: allowlist secret

# Neo4j Graph Database
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

# Next.js Environment
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Authentication Types

**Google OAuth** (user delegation):
- Used for: User-specific Gmail/Drive access
- Scopes: gmail.readonly, drive.readonly, calendar.readonly

**Service Account** (domain-wide delegation):
- Used for: Admin-level access across workspace
- Requires: G Suite domain admin setup
- Subject: User email for impersonation

---

## 7. Development Commands

### Daily Development
```bash
npm run dev           # Start dev server (localhost:3300, Turbopack)
npm run build         # Build for production
npm run start         # Start production server
npm run lint          # Run ESLint checks
npm run format        # Format code with Prettier
npm run format:check  # Check formatting (CI)
npm run type-check    # TypeScript type checking
```

### Testing
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode (TDD workflow)
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
npm run test:e2e      # E2E/POC validation tests
npm run test:cov      # Coverage report
npm run test:ui       # Interactive test UI
```

### Test Files (46 tests total)
- `tests/unit/classifier.test.ts` (15 tests)
- `tests/unit/dispatcher.test.ts` (17 tests)
- `tests/integration/pipeline.test.ts` (9 tests)
- `tests/e2e/poc-validation.test.ts` (5 tests)

---

## 8. Testing Setup

### Framework: Vitest 4.0.16

**Configuration** (`vitest.config.ts`):
- Environment: Node.js
- Coverage: 80% minimum (branches, functions, lines, statements)
- Coverage providers: v8, text, JSON, HTML, LCOV
- Path alias: `@` → `./src`

### Test Structure

```
tests/
├── __fixtures__/events.ts         # 8 webhook event types
├── mocks/openrouter.ts            # Mock AI responses
├── unit/
│   ├── classifier.test.ts         # Tiered classification
│   └── dispatcher.test.ts         # Event routing
├── integration/pipeline.test.ts   # End-to-end flow
├── e2e/poc-validation.test.ts     # POC-1 criteria
└── setup.ts                       # Global test setup
```

### Mock Infrastructure

**MockOpenRouterClient**:
- Deterministic AI responses (no API calls)
- Fast test execution (<100ms for unit tests)
- Configurable confidence levels
- Call tracking and history

### POC-1 Validation

**100-Event Load Test**:
```
Total Events: 100
Successful Classifications: 100/100
Accuracy Rate: 100.00% (≥90% ✓)
Average Cost: $0.001000 (<$0.01 ✓)
Average Latency: 10.00ms (<2000ms ✓)
Overall POC-1 Success: ✓ PASS
```

---

## 9. Deployment

### Primary Platform: Vercel

**Features:**
- Serverless edge functions
- Automatic HTTPS
- GitHub integration (auto-deploy)
- Environment variable management
- Preview deployments per PR

**Configuration** (`next.config.ts`):
```typescript
{
  experimental: {
    cacheComponents: true,  // Includes Partial Prerendering
  },
  typescript: {
    ignoreBuildErrors: false,  // Strict type checking
  },
}
```

### Docker Support

**Container Build**:
```bash
docker build -t izzie2 .
docker run -p 3000:3000 --env-file .env.local izzie2
```

### CI/CD: GitHub Actions

**Planned Workflow**:
1. Run tests (`npm run test:cov`)
2. Type checking (`npm run type-check`)
3. Linting (`npm run lint`)
4. Build verification (`npm run build`)
5. Deploy to Vercel (on push to main)

---

## 10. Current POC Status

### ✅ POC-0: Project Setup (Complete)

**Completed Features:**
- Next.js 16 App Router setup
- TypeScript strict mode configuration
- OpenRouter client integration
- Health check endpoint
- Webhook route handlers (placeholders)
- ESLint + Prettier configuration

**Verification:**
- ✓ `npm run dev` starts successfully
- ✓ TypeScript strict mode enabled
- ✓ `/api/health` returns 200 OK
- ✓ Basic project structure in place

### ✅ POC-1: Event Classification (Complete)

**Completed Features:**
- 3-tier classifier (CHEAP → STANDARD → PREMIUM)
- Event dispatcher with routing rules
- Metrics collection system
- Comprehensive test suite (46 tests)
- POC-1 criteria validation

**Success Metrics:**
- ✓ Accuracy: ≥90% (achieved 100% in tests)
- ✓ Cost: <$0.01/event (achieved $0.001)
- ✓ Latency: <2s/event (achieved 10ms with mocks)

**Recent Commits:**
- `0d7acf3` feat(poc-1): add comprehensive integration tests (#43)
- `76d053e` feat(poc-1): add comprehensive metrics and logging system (#42)
- `859f7a5` feat(poc-1): create event routing dispatcher (#41)
- `c597d43` feat(poc-1): build 3-tier classifier with escalation logic (#40)

### 🔄 POC-2: Database Integration (In Progress)

**Completed Features:**
- ✅ Gmail API integration with batch fetching
- ✅ Google Drive API integration
- ✅ Entity extraction from emails (People, Companies, Projects, Topics)
- ✅ Email significance scoring system
- ✅ Neo4j knowledge graph implementation
- ✅ Graph schema (7 node types, 7 relationship types)
- ✅ Graph query utilities
- ✅ API endpoints for all services

**Recent Commits:**
- `8c11079` feat(poc-2): build Neo4j memory graph from entities (#50)
- `47b6168` feat(poc-2): implement entity extraction from emails (#48)
- `81eaf69` feat(poc-2): implement Google Drive API integration (#47)
- `dfc7b25` feat(poc-2): build email significance scoring system (#54)
- `504f9a0` feat(poc-2): implement Gmail API integration for email ingestion (#53)

**Remaining Work:**
- Neon Postgres integration (pgvector for embeddings)
- Complete Mem0 hybrid retrieval setup
- Production authentication flow
- Data migration scripts

### 🔜 POC-3: Authentication (Planned)

**Technology:** Better Auth (TypeScript-first)

**Features to Implement:**
- Google OAuth integration
- User session management
- Protected API routes
- Token refresh logic
- Multi-tenant support

### 🔜 POC-4: Event Processing (Planned)

**Technology:** Inngest (durable workflows)

**Features to Implement:**
- Webhook event ingestion
- Background job processing
- Scheduled tasks (daily digest, reminders)
- Retry logic for failures
- Event history tracking

### 🔜 POC-5: Memory Layer (Planned)

**Technology:** Mem0 (hybrid vector + graph)

**Features to Implement:**
- Automatic memory consolidation
- Semantic search (pgvector)
- Relationship queries (Neo4j)
- Temporal memory decay
- User preference learning
- Context-aware retrieval

---

## 11. Multi-Agent Architecture

### Agent Design Philosophy

Izzie2 uses specialized agents with clear responsibilities:

### Orchestrator Agent (Claude Opus 4.5)
**Role:** Main decision-making and reasoning
**Status:** Placeholder (POC-1 #8)
**Responsibilities:**
- Complex reasoning tasks
- Strategic planning
- Multi-step workflows
- Unknown event handling

**File:** `src/agents/orchestrator/index.ts`

### Classifier Agent (Mistral Large)
**Role:** Event classification and routing
**Status:** Implemented (POC-1)
**Responsibilities:**
- Categorize incoming events
- Route to appropriate handlers
- Escalate on low confidence

**File:** `src/agents/classifier/index.ts`

### Scheduler Agent (Mistral)
**Role:** Calendar and scheduling
**Status:** Placeholder
**Responsibilities:**
- Calendar event management
- Conflict detection
- Reminder scheduling
- Meeting coordination

**File:** `src/agents/scheduler/index.ts`

### Notifier Agent (Mistral)
**Role:** Notifications and summaries
**Status:** Placeholder
**Responsibilities:**
- Draft message creation
- Digest generation
- Alert dispatching
- Multi-channel notifications (Telegram, email)

**File:** `src/agents/notifier/index.ts`

### Agent Communication Pattern

```
Webhook/Trigger
      ↓
Event Bus (Inngest)
      ↓
Classifier Agent ──→ Route Decision
      ↓
┌─────┴─────┬─────────┬──────────┐
│           │         │          │
Orchestrator Scheduler Notifier   │
│           │         │          │
└─────┬─────┴─────────┴──────────┘
      ↓
Memory Layer (Mem0 + Neo4j)
      ↓
Actions (API calls, notifications, etc.)
```

---

## 12. Key Insights & Patterns

### Code Organization
- **Strict TypeScript**: All files use strict mode, no `any` types
- **Zod Schemas**: Runtime validation for all external data
- **Path Aliases**: `@/*` maps to `src/*` for clean imports
- **Modular Services**: Each lib has clear single responsibility
- **Export Pattern**: Each module has `index.ts` with re-exports

### Performance Optimizations
- **Batch Processing**: Email/entity operations batched for efficiency
- **Incremental Updates**: Neo4j uses MERGE to avoid duplicates
- **Connection Pooling**: Neo4j driver manages connection pool
- **Caching**: Classification results cached to avoid re-processing
- **Rate Limiting**: Gmail/Drive respect API quotas

### Error Handling
- **Graceful Degradation**: Services fail gracefully with warnings
- **Retry Logic**: Transient failures retry with exponential backoff
- **Detailed Logging**: All errors logged with context
- **Type Safety**: Zod validates all external data

### Security Practices
- **No Secrets in Code**: All credentials in `.env` files
- **Service Accounts**: Domain-wide delegation for admin access
- **OAuth Scopes**: Minimal required permissions
- **Input Validation**: All API inputs validated with Zod
- **HTTPS Only**: SSL required for all external connections

### Testing Philosophy
- **TDD-Ready**: Watch mode for rapid iteration
- **Mock External APIs**: No real API calls in tests
- **Deterministic**: Tests produce same results every run
- **Fast Feedback**: Unit tests <1ms, integration <10ms
- **Comprehensive**: 80% coverage minimum enforced

---

## 13. Documentation

### Architecture
- `docs/architecture/izzie-architecture.md` - System architecture spec (locked)

### Implementation Guides
- `docs/implementation/neo4j-memory-graph-implementation.md` - Graph setup
- `docs/implementation/entity-extraction-implementation-summary.md` - Entity extraction

### Research Documents
- `docs/research/neo4j-memory-graph-integration-2026-01-05.md`
- `docs/research/email-entity-extraction-implementation-2026-01-05.md`
- `docs/research/google-drive-api-integration-analysis-2026-01-05.md`
- `docs/research/izzie2-architecture-analysis-2026-01-05.md`

### API Documentation
- `src/lib/scoring/README.md` - Email scoring system (450 lines)
- `src/lib/metrics/README.md` - Metrics collection
- `tests/README.md` - Testing guide (1,200+ lines)

### Setup Guides
- `docs/setup-complete.md` - POC-0 setup summary
- `docs/gmail-integration.md` - Gmail API integration
- `docs/google-drive-implementation.md` - Drive API setup
- `docs/classifier-flow.md` - Event classification flow

---

## 14. Development Workflow

### Starting Development
```bash
# Clone and setup
git clone https://github.com/bobmatnyc/izzie2.git
cd izzie2
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Start development
npm run dev  # http://localhost:3300
```

### Making Changes
```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes
# ... edit files ...

# Run tests
npm run test:watch  # TDD mode

# Check types and lint
npm run type-check
npm run lint
npm run format

# Commit changes
git add .
git commit -m "feat: add your feature"

# Push and create PR
git push origin feature/your-feature
```

### Pre-commit Checks
- TypeScript type checking
- ESLint validation
- Prettier formatting
- Test execution

---

## 15. Future Roadmap

### POC-3: Authentication
- Better Auth integration
- Google OAuth flow
- User session management
- Protected routes

### POC-4: Event Processing
- Inngest function implementation
- Webhook ingestion
- Background jobs
- Scheduled tasks

### POC-5: Memory Layer
- Mem0 hybrid retrieval
- Vector search (pgvector)
- Graph queries (Neo4j)
- Memory consolidation
- Preference learning

### Production Features
- Multi-user support
- Admin dashboard
- Usage analytics
- Cost tracking UI
- Agent performance monitoring
- Telegram bot integration
- SMS notifications (Twilio)
- Slack integration
- Calendar sync

---

## 16. Contributing Guidelines

### Code Style
- **TypeScript Strict**: No `any` types, explicit return types
- **Formatting**: Prettier with 2-space tabs, 100-char line width
- **Naming**: camelCase for variables/functions, PascalCase for types/classes
- **Comments**: JSDoc for public APIs, inline for complex logic
- **File Organization**: Group related code, clear separation of concerns

### Testing Requirements
- **Coverage**: Minimum 80% (branches, functions, lines, statements)
- **Test Types**: Unit tests for logic, integration for flows, E2E for POCs
- **Naming**: `describe('ComponentName', () => { it('should do X', ...) })`
- **AAA Pattern**: Arrange, Act, Assert
- **Isolation**: No shared state between tests

### Git Workflow
- **Branches**: `feature/`, `fix/`, `docs/`, `test/`
- **Commits**: Conventional commits (feat, fix, docs, refactor, test, chore)
- **PRs**: Clear description, link to issues, tests passing
- **Reviews**: At least one approval required

---

## 17. Common Tasks

### Add New API Endpoint
```typescript
// src/app/api/your-endpoint/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Your logic here
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

### Add New Service
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

### Add New Test
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

## Conclusion

Izzie2 is a well-architected, TypeScript-first AI personal assistant with:
- ✅ Solid foundation (Next.js 16, strict TypeScript)
- ✅ Multi-tier event classification (POC-1 complete)
- 🔄 Gmail/Drive/Neo4j integration (POC-2 in progress)
- 📋 Clear roadmap (POC-3, POC-4, POC-5)
- 🧪 Comprehensive test suite (46 tests, 80% coverage)
- 📚 Extensive documentation

**Next Steps:**
1. Complete Neon Postgres + Mem0 integration (POC-2)
2. Implement Better Auth (POC-3)
3. Set up Inngest workflows (POC-4)
4. Build hybrid memory system (POC-5)
5. Deploy to production (Vercel)

---

**Document Metadata:**
- **Lines of Code**: ~5,000+ (src/), ~1,800 (tests/), ~10,000+ (total)
- **Test Count**: 46 tests (15 unit classifier, 17 unit dispatcher, 9 integration, 5 E2E)
- **API Endpoints**: 16 routes
- **Services**: 9 core libraries (ai, events, extraction, google, graph, memory, metrics, routing, scoring)
- **Dependencies**: 15 production, 11 development
- **Documentation**: 15+ markdown files

**Research Completion Date:** January 5, 2026
