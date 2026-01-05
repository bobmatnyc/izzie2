# Izzie 2.0 Architecture Document

**Version:** 1.0  
**Status:** Locked  
**Date:** January 2026

---

## Executive Summary

Izzie is a personal assistant that unifies communication and scheduling management across email, calendar, Slack, SMS, GitHub, Linear, and other channels. The system operates as either a distinct persona or a transparent user proxy, with a proactive event loop driving agent actions.

**Core principles:**
- Serverless-first (Vercel target) with local development parity
- TypeScript throughout for toolchain alignment
- RAG + knowledge graph memory for both similarity and relationship queries
- Model-agnostic via OpenRouter with tiered model selection
- Autonomous testing via synthetic user personas

---

## Technology Stack (Locked)

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Runtime** | Next.js 14+ (App Router) | Serverless-native, TypeScript-first |
| **Memory** | Mem0 (OSS → Cloud path) | TypeScript SDK, graph+vector hybrid |
| **Auth** | Better Auth | TypeScript-first, plugin ecosystem, full DB control |
| **Events** | Inngest | Durable functions, proactive scheduling |
| **Models** | OpenRouter | Model switching, unified API |
| **Database** | Neon (Postgres + pgvector) | Serverless Postgres, vector support |
| **Graph DB** | Neo4j Aura Free | Mem0 graph backend |
| **Hosting** | Vercel (target) | Serverless, edge functions |
| **Long-running** | Upstash (QStash/Redis) | When Vercel limits hit |

### Dependencies Not Yet Locked

| Component | Options Under Consideration | Decision Trigger |
|-----------|---------------------------|------------------|
| MCP Integrations | mcp-ticketer, custom | When building first integration |
| Messaging | Telegram Bot API | When building comms interface |
| SMS | Twilio, other | If SMS required |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INGRESS LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│  Telegram Bot  │  Webhooks (GitHub, Linear, etc.)  │  API Routes   │
└───────┬────────┴──────────────────┬─────────────────┴───────┬───────┘
        │                           │                         │
        ▼                           ▼                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         EVENT BUS (Inngest)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │ Triggers │  │ Schedules│  │ Webhooks │  │ Internal Events  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AGENT DISPATCH LAYER                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Event Router                              │   │
│  │  • Classifies event type (cheap model)                       │   │
│  │  • Selects agent persona                                     │   │
│  │  • Determines mode (proxy vs assistant)                      │   │
│  │  • Routes to appropriate handler                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│   ORCHESTRATOR │       │   SCHEDULER   │       │   NOTIFIER    │
│   (Opus 4.5)   │       │  (Mistral)    │       │  (Mistral)    │
│                │       │               │       │               │
│  • Reasoning   │       │  • Calendar   │       │  • Drafts     │
│  • Planning    │       │  • Reminders  │       │  • Summaries  │
│  • Decisions   │       │  • Conflicts  │       │  • Alerts     │
└───────┬───────┘       └───────┬───────┘       └───────┬───────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         MEMORY LAYER (Mem0)                         │
│  ┌─────────────────────┐          ┌─────────────────────────────┐  │
│  │    Vector Store     │          │      Knowledge Graph        │  │
│  │   (Neon pgvector)   │◄────────►│      (Neo4j Aura)           │  │
│  │                     │          │                             │  │
│  │  • Semantic search  │          │  • Entity relationships     │  │
│  │  • Similarity       │          │  • People ↔ Projects        │  │
│  │  • Embeddings       │          │  • Temporal connections     │  │
│  └─────────────────────┘          └─────────────────────────────┘  │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      INTEGRATION LAYER (MCP)                        │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│  │ Google │ │ Slack  │ │ GitHub │ │ Linear │ │Calendar│ │  SMS   │ │
│  │ (OAuth)│ │  Bot   │ │  App   │ │  API   │ │  API   │ │(Twilio)│ │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Agent Persona Model

### Role-Based Agents

Four distinct agent roles with different model tiers and responsibilities:

| Agent | Model Tier | Responsibility | Triggers |
|-------|-----------|----------------|----------|
| **Orchestrator** | Opus 4.5 (thinking) | Complex reasoning, planning, decision-making | User requests, escalations |
| **Classifier** | Mistral/Haiku | Event classification, routing, triage | All incoming events |
| **Scheduler** | Mistral | Calendar operations, conflict detection, reminders | Time-based events, calendar webhooks |
| **Notifier** | Mistral | Draft generation, summaries, alerts | Scheduled digests, threshold triggers |

### Context-Based Personas

The Orchestrator operates with different system prompts based on context:

```typescript
type PersonaContext = 'work' | 'personal';

interface PersonaConfig {
  context: PersonaContext;
  systemPrompt: string;
  toolAccess: Tool[];
  memoryNamespace: string;
  communicationStyle: 'formal' | 'casual';
}

const workPersona: PersonaConfig = {
  context: 'work',
  systemPrompt: `You are Izzie, a professional assistant...`,
  toolAccess: ['slack', 'github', 'linear', 'calendar', 'email'],
  memoryNamespace: 'work',
  communicationStyle: 'formal',
};

const personalPersona: PersonaConfig = {
  context: 'personal',
  systemPrompt: `You are Izzie, a personal assistant...`,
  toolAccess: ['calendar', 'email', 'sms', 'reminders'],
  memoryNamespace: 'personal',
  communicationStyle: 'casual',
};
```

### Operating Modes

**Assistant Mode:** Izzie acts as itself—a distinct entity the user interacts with.
- Clear attribution: "I scheduled the meeting..."
- Own voice and personality
- Can express uncertainty, ask clarifying questions

**Proxy Mode:** Izzie acts as the user—sending communications on their behalf.
- No attribution: email appears from user
- Matches user's communication style (learned from memory)
- Requires explicit authorization per action or action-class
- Audit trail of all proxy actions

```typescript
type OperatingMode = 'assistant' | 'proxy';

interface ActionRequest {
  mode: OperatingMode;
  action: string;
  authorization: 'per-action' | 'class-authorized' | 'standing';
  confidence: number; // 0-1, proxy mode requires higher threshold
}

// Proxy mode safeguards
const PROXY_CONFIDENCE_THRESHOLD = 0.9;
const PROXY_REQUIRES_CONFIRMATION = ['send_email', 'post_slack', 'create_issue'];
```

### Test Personas

Synthetic users for autonomous functional testing:

| Persona | Behavior Pattern | Tests |
|---------|-----------------|-------|
| **Busy Executive** | Terse messages, high urgency, calendar conflicts | Prioritization, conflict resolution |
| **Forgetful User** | Contradictory instructions, changing context | Memory retrieval, clarification |
| **Adversarial Tester** | Edge cases, ambiguous requests, attempts to confuse | Robustness, safety rails |
| **New User** | No history, needs onboarding | Cold start, preference learning |

---

## Event-Driven Architecture

### Core Event Loop

Inngest manages the proactive event loop with three trigger types:

```typescript
// 1. Scheduled triggers (proactive)
const morningDigest = inngest.createFunction(
  { id: 'morning-digest', name: 'Morning Digest' },
  { cron: '0 7 * * *' }, // 7am daily
  async ({ event, step }) => {
    const summary = await step.run('gather-overnight', async () => {
      return gatherOvernightActivity();
    });
    
    await step.run('generate-digest', async () => {
      return generateAndSendDigest(summary);
    });
  }
);

// 2. Webhook triggers (reactive)
const githubPROpened = inngest.createFunction(
  { id: 'github-pr-opened' },
  { event: 'github/pull_request.opened' },
  async ({ event, step }) => {
    const classification = await step.run('classify', async () => {
      return classifyPR(event.data); // cheap model
    });
    
    if (classification.requiresAttention) {
      await step.run('notify', async () => {
        return notifyUser(classification);
      });
    }
  }
);

// 3. Internal triggers (chained)
const escalateToOrchestrator = inngest.createFunction(
  { id: 'escalate-orchestrator' },
  { event: 'izzie/escalate' },
  async ({ event, step }) => {
    const response = await step.run('orchestrate', async () => {
      return callOrchestrator(event.data); // thinking model
    });
    
    await step.run('execute-actions', async () => {
      return executeActions(response.actions);
    });
  }
);
```

### Event Schema

```typescript
interface IzzieEvent {
  id: string;
  type: string;
  source: 'telegram' | 'webhook' | 'schedule' | 'internal';
  timestamp: Date;
  data: unknown;
  metadata: {
    userId: string;
    personaContext?: 'work' | 'personal';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    correlationId?: string;
  };
}

// Event types
type EventType =
  | 'user/message'           // Direct user input
  | 'schedule/trigger'       // Cron-based
  | 'github/pull_request.*'  // GitHub webhooks
  | 'linear/issue.*'         // Linear webhooks
  | 'calendar/event.*'       // Calendar changes
  | 'email/received'         // Incoming email
  | 'izzie/escalate'         // Internal escalation
  | 'izzie/action.complete'  // Action completion
  | 'test/scenario';         // Test framework
```

### Model Selection Logic

```typescript
interface ModelConfig {
  provider: 'openrouter';
  model: string;
  maxTokens: number;
  temperature: number;
}

const modelTiers: Record<string, ModelConfig> = {
  thinking: {
    provider: 'openrouter',
    model: 'anthropic/claude-opus-4.5',
    maxTokens: 8192,
    temperature: 0.7,
  },
  standard: {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4',
    maxTokens: 4096,
    temperature: 0.5,
  },
  cheap: {
    provider: 'openrouter',
    model: 'mistralai/mistral-small',
    maxTokens: 2048,
    temperature: 0.3,
  },
};

function selectModel(task: TaskType): ModelConfig {
  switch (task) {
    case 'classification':
    case 'extraction':
    case 'summarization':
      return modelTiers.cheap;
    
    case 'scheduling':
    case 'notification':
    case 'drafting':
      return modelTiers.standard;
    
    case 'planning':
    case 'reasoning':
    case 'decision':
      return modelTiers.thinking;
    
    default:
      return modelTiers.standard;
  }
}
```

---

## Memory Layer Design

### Mem0 Configuration

```typescript
import { Memory } from 'mem0ai/oss';

const memoryConfig = {
  // Vector store (Neon pgvector)
  vectorStore: {
    provider: 'pgvector',
    config: {
      connectionString: process.env.NEON_DATABASE_URL,
      tableName: 'izzie_memories',
      embeddingDimension: 1536,
    },
  },
  
  // Graph store (Neo4j Aura)
  graphStore: {
    provider: 'neo4j',
    config: {
      url: process.env.NEO4J_URL,
      username: process.env.NEO4J_USERNAME,
      password: process.env.NEO4J_PASSWORD,
    },
  },
  
  // LLM for extraction (cheap model)
  llm: {
    provider: 'openrouter',
    model: 'mistralai/mistral-small',
  },
  
  // Embeddings
  embedder: {
    provider: 'openai',
    model: 'text-embedding-3-small',
  },
};

const memory = new Memory(memoryConfig);
```

### Memory Operations

```typescript
// Store interaction
async function storeInteraction(
  userId: string,
  interaction: Interaction,
  namespace: string
): Promise<void> {
  await memory.add(
    [
      { role: 'user', content: interaction.userMessage },
      { role: 'assistant', content: interaction.assistantResponse },
    ],
    {
      user_id: userId,
      metadata: {
        namespace,
        timestamp: interaction.timestamp,
        source: interaction.source,
      },
    }
  );
}

// Retrieve context
async function getRelevantContext(
  userId: string,
  query: string,
  namespace: string
): Promise<MemoryContext> {
  const results = await memory.search(query, {
    user_id: userId,
    limit: 10,
    rerank: true,
    metadata_filter: { namespace },
  });
  
  return {
    memories: results.results,
    relations: results.relations, // Graph relationships
  };
}

// Query relationships
async function getRelatedEntities(
  userId: string,
  entity: string
): Promise<Entity[]> {
  // Mem0's graph memory returns relationships automatically
  const results = await memory.search(`relationships with ${entity}`, {
    user_id: userId,
    limit: 20,
  });
  
  return results.relations.map(r => ({
    name: r.target,
    relationship: r.type,
    context: r.context,
  }));
}
```

### Memory Namespaces

```typescript
type MemoryNamespace =
  | 'work'           // Work-related context
  | 'personal'       // Personal context
  | 'preferences'    // User preferences (cross-context)
  | 'communication'  // Communication style patterns
  | 'entities';      // Known people, projects, etc.

// Namespace isolation
interface NamespaceConfig {
  namespace: MemoryNamespace;
  retentionDays: number;
  accessContexts: PersonaContext[];
}

const namespaceConfigs: NamespaceConfig[] = [
  { namespace: 'work', retentionDays: 365, accessContexts: ['work'] },
  { namespace: 'personal', retentionDays: 365, accessContexts: ['personal'] },
  { namespace: 'preferences', retentionDays: -1, accessContexts: ['work', 'personal'] },
  { namespace: 'communication', retentionDays: 90, accessContexts: ['work', 'personal'] },
  { namespace: 'entities', retentionDays: -1, accessContexts: ['work', 'personal'] },
];
```

---

## Integration Layer

### MCP Architecture

```typescript
interface MCPServer {
  name: string;
  transport: 'stdio' | 'http';
  tools: MCPTool[];
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

// Integration registry
const integrations: Record<string, MCPServer> = {
  google: {
    name: 'google-workspace',
    transport: 'http',
    tools: [
      { name: 'gmail_send', description: 'Send email', inputSchema: {...} },
      { name: 'gmail_read', description: 'Read emails', inputSchema: {...} },
      { name: 'calendar_create', description: 'Create event', inputSchema: {...} },
      { name: 'calendar_query', description: 'Query calendar', inputSchema: {...} },
    ],
  },
  github: {
    name: 'github',
    transport: 'stdio',
    tools: [
      { name: 'issues_list', description: 'List issues', inputSchema: {...} },
      { name: 'pr_list', description: 'List PRs', inputSchema: {...} },
      { name: 'pr_review', description: 'Review PR', inputSchema: {...} },
    ],
  },
  linear: {
    name: 'linear',
    transport: 'http',
    tools: [
      { name: 'issues_list', description: 'List issues', inputSchema: {...} },
      { name: 'issue_create', description: 'Create issue', inputSchema: {...} },
      { name: 'issue_update', description: 'Update issue', inputSchema: {...} },
    ],
  },
  slack: {
    name: 'slack',
    transport: 'http',
    tools: [
      { name: 'message_send', description: 'Send message', inputSchema: {...} },
      { name: 'channel_history', description: 'Get history', inputSchema: {...} },
    ],
  },
};
```

### OAuth Flow (Google Example)

```typescript
// lib/auth.ts - Better Auth configuration
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/calendar',
      ],
      // Store refresh tokens for offline access
      accessType: 'offline',
      prompt: 'consent',
    },
  },
  
  session: {
    // JWT sessions for serverless compatibility
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  // Plugin ecosystem for advanced features
  plugins: [
    // Add as needed: twoFactor(), organization(), etc.
  ],
});

// lib/auth-client.ts - Client-side auth
import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

// app/api/auth/[...all]/route.ts - API handler
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth.handler);
```

---

## Testing Architecture

### Autonomous Testing Framework

```typescript
interface TestPersona {
  id: string;
  name: string;
  behavior: BehaviorConfig;
  scenarios: TestScenario[];
}

interface TestScenario {
  id: string;
  description: string;
  setup: SetupStep[];
  interactions: InteractionStep[];
  assertions: Assertion[];
}

interface InteractionStep {
  type: 'message' | 'event' | 'delay';
  content?: string;
  event?: IzzieEvent;
  delayMs?: number;
}

interface Assertion {
  type: 'response_contains' | 'action_taken' | 'memory_stored' | 'model_called';
  expected: unknown;
  evaluator?: 'exact' | 'semantic' | 'llm';
}
```

### Test Execution

```typescript
// CLI test runner
async function runTestSuite(suite: TestSuite): Promise<TestResults> {
  const results: TestResult[] = [];
  
  for (const persona of suite.personas) {
    for (const scenario of persona.scenarios) {
      // Setup
      await setupTestEnvironment(scenario.setup);
      
      // Execute interactions
      const responses: Response[] = [];
      for (const step of scenario.interactions) {
        if (step.type === 'message') {
          const response = await sendTestMessage(persona.id, step.content!);
          responses.push(response);
        } else if (step.type === 'event') {
          await injectTestEvent(step.event!);
        } else if (step.type === 'delay') {
          await sleep(step.delayMs!);
        }
      }
      
      // Assert
      const assertions = await evaluateAssertions(
        scenario.assertions,
        responses,
        persona
      );
      
      results.push({
        scenarioId: scenario.id,
        passed: assertions.every(a => a.passed),
        assertions,
      });
    }
  }
  
  return { results, summary: summarizeResults(results) };
}

// LLM-based evaluation for judgment calls
async function evaluateSemanticAssertion(
  assertion: Assertion,
  actual: string
): Promise<AssertionResult> {
  const evaluation = await callModel({
    model: 'mistralai/mistral-small',
    messages: [
      {
        role: 'system',
        content: `You are evaluating whether an AI response meets expectations.
                  Return JSON: { "passed": boolean, "reason": string }`,
      },
      {
        role: 'user',
        content: `Expected: ${assertion.expected}\nActual: ${actual}`,
      },
    ],
  });
  
  return JSON.parse(evaluation);
}
```

### Model Testing

```typescript
interface ModelTest {
  id: string;
  model: string;
  prompt: string;
  expectedBehavior: string;
  maxLatencyMs: number;
  maxTokens: number;
}

async function runModelTests(tests: ModelTest[]): Promise<ModelTestResults> {
  const results: ModelTestResult[] = [];
  
  for (const test of tests) {
    const start = Date.now();
    
    const response = await callModel({
      model: test.model,
      messages: [{ role: 'user', content: test.prompt }],
      maxTokens: test.maxTokens,
    });
    
    const latency = Date.now() - start;
    
    const evaluation = await evaluateSemanticAssertion(
      { type: 'semantic', expected: test.expectedBehavior },
      response.content
    );
    
    results.push({
      testId: test.id,
      model: test.model,
      latencyMs: latency,
      latencyPassed: latency <= test.maxLatencyMs,
      behaviorPassed: evaluation.passed,
      response: response.content,
    });
  }
  
  return { results, summary: summarizeModelTests(results) };
}
```

---

## Security Considerations

### Principle of Least Privilege

```typescript
// Tool access matrix
const toolAccess: Record<OperatingMode, Record<PersonaContext, string[]>> = {
  assistant: {
    work: ['gmail_read', 'calendar_query', 'issues_list', 'pr_list', 'channel_history'],
    personal: ['calendar_query', 'gmail_read'],
  },
  proxy: {
    work: ['gmail_send', 'calendar_create', 'issue_create', 'message_send'],
    personal: ['gmail_send', 'calendar_create'],
  },
};

// Proxy mode requires explicit authorization
interface ProxyAuthorization {
  userId: string;
  actionClass: string;
  grantedAt: Date;
  expiresAt?: Date;
  scope: 'single' | 'standing';
}
```

### Audit Trail

```typescript
interface AuditEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  mode: OperatingMode;
  persona: PersonaContext;
  input: unknown;
  output: unknown;
  modelUsed: string;
  tokensUsed: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

// All actions logged
async function logAction(entry: Omit<AuditEntry, 'id'>): Promise<void> {
  await db.auditLog.create({ data: { ...entry, id: generateId() } });
}
```

### Token Security

```typescript
// OAuth tokens encrypted at rest
// Refresh tokens stored in secure environment
// Access tokens short-lived, refreshed automatically

interface TokenStorage {
  store(userId: string, tokens: OAuthTokens): Promise<void>;
  retrieve(userId: string): Promise<OAuthTokens | null>;
  refresh(userId: string): Promise<OAuthTokens>;
  revoke(userId: string): Promise<void>;
}
```

---

## Database Schema

```sql
-- Neon Postgres schema

-- Users and auth
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  preferences JSONB DEFAULT '{}'
);

-- OAuth tokens (encrypted)
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  provider TEXT NOT NULL,
  access_token_encrypted BYTEA NOT NULL,
  refresh_token_encrypted BYTEA NOT NULL,
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  UNIQUE(user_id, provider)
);

-- Proxy authorizations
CREATE TABLE proxy_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action_class TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('single', 'standing')),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- Audit log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  mode TEXT NOT NULL,
  persona TEXT NOT NULL,
  input JSONB,
  output JSONB,
  model_used TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  success BOOLEAN,
  error TEXT
);

-- Vector storage for Mem0 (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE izzie_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  namespace TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON izzie_memories USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON izzie_memories (user_id, namespace);
```

---

## Deployment Architecture

### Local Development

```bash
# Start all services
docker-compose up -d  # Neo4j, local Postgres

# Environment
cp .env.example .env.local
# Configure: OPENROUTER_API_KEY, NEON_DATABASE_URL, NEO4J_*, etc.

# Run
pnpm dev              # Next.js dev server
pnpm inngest:dev      # Inngest dev server
```

### Vercel Deployment

```typescript
// vercel.json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30  // Vercel Pro limit
    }
  },
  "crons": [
    {
      "path": "/api/cron/morning-digest",
      "schedule": "0 7 * * *"
    }
  ]
}
```

### Long-Running Tasks (Upstash)

When Vercel's 30-second limit is hit:

```typescript
import { Client } from '@upstash/qstash';

const qstash = new Client({ token: process.env.QSTASH_TOKEN });

// Offload to QStash for long-running tasks
async function scheduleLongTask(task: LongTask): Promise<void> {
  await qstash.publishJSON({
    url: `${process.env.VERCEL_URL}/api/workers/long-task`,
    body: task,
    retries: 3,
  });
}
```

---

## Migration Path

### Phase 1: Core Infrastructure
1. Next.js project setup with Auth.js
2. Neon database with schema
3. Neo4j Aura connection
4. Mem0 integration
5. Basic Inngest event loop

### Phase 2: Agent Framework
1. Model router via OpenRouter
2. Classifier agent (cheap model)
3. Orchestrator agent (thinking model)
4. Persona configuration

### Phase 3: Integrations
1. Google OAuth + Gmail/Calendar
2. Telegram bot interface
3. GitHub webhook integration
4. Linear webhook integration

### Phase 4: Testing Framework
1. Test persona definitions
2. CLI test runner
3. Model evaluation suite
4. CI/CD integration

### Phase 5: Production Hardening
1. Vercel deployment
2. Upstash for long-running tasks
3. Monitoring and alerting
4. Security audit

---

## Open Questions

1. **Telegram vs other interfaces:** Confirm Telegram as primary communication channel
2. **MCP server selection:** Build custom or use existing (mcp-ticketer, etc.)
3. **Mem0 Cloud migration trigger:** When to move from OSS to managed
4. **Multi-user support:** Is this single-user or will it support multiple users?

---

## Appendix: Directory Structure

```
izzie/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── telegram/webhook/route.ts
│   │   ├── github/webhook/route.ts
│   │   ├── linear/webhook/route.ts
│   │   ├── cron/
│   │   │   └── morning-digest/route.ts
│   │   └── workers/
│   │       └── long-task/route.ts
│   ├── (dashboard)/
│   │   ├── page.tsx
│   │   └── settings/page.tsx
│   └── layout.tsx
├── lib/
│   ├── agents/
│   │   ├── orchestrator.ts
│   │   ├── classifier.ts
│   │   ├── scheduler.ts
│   │   └── notifier.ts
│   ├── memory/
│   │   ├── client.ts
│   │   └── namespaces.ts
│   ├── integrations/
│   │   ├── google.ts
│   │   ├── github.ts
│   │   ├── linear.ts
│   │   └── slack.ts
│   ├── models/
│   │   ├── router.ts
│   │   └── tiers.ts
│   └── events/
│       └── inngest.ts
├── inngest/
│   ├── client.ts
│   └── functions/
│       ├── morning-digest.ts
│       ├── github-pr.ts
│       └── escalate.ts
├── tests/
│   ├── personas/
│   │   ├── busy-executive.ts
│   │   ├── forgetful-user.ts
│   │   └── adversarial.ts
│   ├── scenarios/
│   │   └── *.test.ts
│   └── runner.ts
├── prisma/
│   └── schema.prisma
├── docker-compose.yml
└── package.json
```

---

**Document maintained by:** Claude (Project Assistant)  
**Last updated:** January 2026
