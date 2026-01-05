# Izzie 2.0 Architecture Analysis

**Research Date:** January 5, 2026
**Source Document:** `/docs/architecture/izzie-architecture.md`
**Status:** Architecture Locked (v1.0)

---

## 1. Project Overview

### What is Izzie2?

Izzie is a **personal AI assistant that unifies communication and scheduling management** across multiple platforms including:
- Email (Gmail)
- Calendar (Google Calendar)
- Team collaboration (Slack)
- SMS messaging
- Developer tools (GitHub, Linear)

### Problem Statement

Modern professionals juggle multiple communication channels, calendars, and task management systems, leading to:
- **Context switching overhead** between platforms
- **Missed notifications** and delayed responses
- **Calendar conflicts** and scheduling inefficiencies
- **Information fragmentation** across different tools
- **Manual triage** of incoming communications

### Solution Approach

Izzie operates as an **intelligent proxy layer** that:
1. **Monitors** all connected channels via webhooks and polling
2. **Classifies** incoming events using cost-efficient models
3. **Reasons** about complex decisions using frontier models (Opus 4.5)
4. **Acts** autonomously or with user approval depending on mode
5. **Learns** user preferences and patterns through memory systems
6. **Proactively surfaces** important information via scheduled digests

### Operating Modes

**Assistant Mode:**
- Izzie acts as a distinct persona
- Clear attribution: "I scheduled the meeting..."
- Can express uncertainty and ask questions
- Lower trust requirements

**Proxy Mode:**
- Izzie acts **as the user** - sends communications on their behalf
- No attribution: messages appear directly from user
- Requires explicit authorization per action or action class
- High confidence threshold (0.9+) required
- Complete audit trail maintained

---

## 2. Core Components

### 2.1 Ingress Layer
**Purpose:** Entry points for all external events and user input

**Components:**
- **Telegram Bot:** Primary user interface for direct commands
- **Webhooks:** Receives events from GitHub, Linear, Google Calendar, Slack
- **API Routes:** REST endpoints for custom integrations

### 2.2 Event Bus (Inngest)
**Purpose:** Durable, serverless-friendly event orchestration

**Capabilities:**
- **Scheduled Triggers:** Cron-based proactive actions (morning digest, reminders)
- **Webhook Triggers:** React to external service events
- **Internal Triggers:** Chain agent actions and escalations
- **Durable Execution:** Handles retries, failures, and long-running tasks

**Key Features:**
- Function composition and chaining
- Built-in retry logic
- Step-based execution with granular error handling
- Perfect fit for serverless constraints (30s Vercel limit)

### 2.3 Agent Dispatch Layer
**Purpose:** Intelligent routing and model selection

**Event Router Responsibilities:**
1. **Event Classification:** Uses cheap model (Mistral) to categorize incoming events
2. **Agent Selection:** Routes to appropriate agent based on task complexity
3. **Persona Selection:** Determines work vs. personal context
4. **Mode Determination:** Assistant vs. proxy mode based on action type

### 2.4 Agent Layer (Four-Tier Architecture)

#### Orchestrator Agent (Opus 4.5)
- **Role:** Complex reasoning, planning, decision-making
- **Model:** Claude Opus 4.5 with extended thinking
- **Triggers:** User requests, escalations from other agents
- **Responsibilities:**
  - Multi-step planning
  - Ambiguous request clarification
  - Trade-off analysis
  - Strategic decision-making

#### Classifier Agent (Mistral Small)
- **Role:** Event triage and routing
- **Model:** Mistral Small (cost-optimized)
- **Triggers:** All incoming events
- **Responsibilities:**
  - Event type classification
  - Priority assignment
  - Routing decisions
  - Simple extractions

#### Scheduler Agent (Mistral/Sonnet)
- **Role:** Calendar and time-based operations
- **Model:** Mistral or Claude Sonnet 4
- **Triggers:** Calendar webhooks, time-based events
- **Responsibilities:**
  - Meeting scheduling
  - Conflict detection
  - Reminder management
  - Availability queries

#### Notifier Agent (Mistral)
- **Role:** Communication drafting and summarization
- **Model:** Mistral Small
- **Triggers:** Scheduled digests, threshold-based alerts
- **Responsibilities:**
  - Email/message drafting
  - Activity summaries
  - Alert generation
  - Digest compilation

### 2.5 Memory Layer (Mem0)
**Purpose:** Hybrid vector + graph knowledge storage

**Architecture:**
- **Vector Store:** Neon PostgreSQL with pgvector extension
- **Graph Store:** Neo4j Aura Free tier
- **Hybrid Queries:** Combines semantic similarity with relationship traversal

**Capabilities:**
- **Semantic Search:** Find similar past interactions
- **Entity Relationships:** Map people ↔ projects ↔ topics
- **Temporal Connections:** Track how relationships evolve
- **Namespace Isolation:** Separate work/personal/preferences

**Memory Namespaces:**
1. `work` - Work-related context (365-day retention)
2. `personal` - Personal context (365-day retention)
3. `preferences` - Cross-context user preferences (permanent)
4. `communication` - Style patterns (90-day retention)
5. `entities` - Known people, projects, organizations (permanent)

### 2.6 Integration Layer (MCP)
**Purpose:** Unified tool interface for external services

**Connected Services:**
- **Google Workspace:** Gmail, Calendar (OAuth 2.0)
- **GitHub:** Issues, PRs, reviews (App installation)
- **Linear:** Issue tracking (API token)
- **Slack:** Messaging, channel history (Bot token)
- **SMS:** Twilio integration (if required)

**Transport Types:**
- `stdio`: Local process-based integrations (GitHub MCP)
- `http`: Remote API-based integrations (Google, Linear, Slack)

---

## 3. Tech Stack

### Core Framework
| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **Next.js 14+ (App Router)** | Full-stack framework | Serverless-native, TypeScript-first, Vercel deployment |
| **TypeScript** | Language | Type safety, toolchain alignment |
| **Vercel** | Hosting platform | Native Next.js support, edge functions, serverless |

### AI/ML Infrastructure
| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **OpenRouter** | LLM Gateway | Model switching, unified API, cost optimization |
| **Claude Opus 4.5** | Reasoning model | Extended thinking, complex planning |
| **Claude Sonnet 4** | Standard tasks | Balanced cost/performance |
| **Mistral Small** | Cheap operations | Classification, extraction, drafting |
| **OpenAI Embeddings** | Vector embeddings | text-embedding-3-small model |

### Memory & Storage
| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **Mem0 (OSS)** | Memory framework | TypeScript SDK, hybrid vector+graph |
| **Neon Postgres** | Primary database | Serverless Postgres, pgvector support |
| **Neo4j Aura Free** | Graph database | Relationship queries, entity mapping |
| **Upstash (Redis/QStash)** | Cache & queue | Long-running tasks beyond Vercel limits |

### Authentication & Security
| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **Better Auth** | Auth framework | TypeScript-first, plugin ecosystem, full DB control |
| **OAuth 2.0** | Social login | Google Workspace integration |
| **JWT Sessions** | Session management | Serverless compatibility |

### Event Processing
| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **Inngest** | Durable functions | Event-driven, serverless-friendly, built-in retries |
| **Vercel Crons** | Scheduled jobs | Native platform support |

### Integrations
| Technology | Purpose | Status |
|------------|---------|---------|
| **MCP Protocol** | Tool interface | Standard for LLM integrations |
| **Telegram Bot API** | User interface | Under consideration |
| **Twilio** | SMS gateway | If SMS required |

---

## 4. Key Features

### 4.1 Intelligent Event Processing
- **Automatic Classification:** All incoming events classified by cheap model
- **Smart Routing:** Events routed to appropriate agent based on complexity
- **Cost Optimization:** 3-tier model selection (cheap/standard/thinking)
- **Durable Execution:** Retry logic and error recovery via Inngest

### 4.2 Proactive Scheduling
- **Morning Digests:** Daily summary of overnight activity (7am cron)
- **Conflict Detection:** Automatic calendar conflict identification
- **Meeting Coordination:** Multi-party scheduling with availability checking
- **Reminder Management:** Context-aware reminders based on priorities

### 4.3 Hybrid Memory System
- **Semantic Search:** Find relevant past interactions using embeddings
- **Relationship Queries:** Traverse entity graphs (people, projects, topics)
- **Preference Learning:** Adapts to user communication style and preferences
- **Context Isolation:** Separate work/personal memory namespaces

### 4.4 Multi-Channel Communication
- **Unified Inbox:** Aggregate notifications across platforms
- **Priority Filtering:** Surface only important communications
- **Draft Generation:** AI-assisted email and message composition
- **Style Matching:** Mimics user's communication patterns in proxy mode

### 4.5 Dual Operating Modes
- **Assistant Mode:** Clear AI attribution, conversational interface
- **Proxy Mode:** Acts as user with explicit authorization
- **Confidence Thresholds:** High confidence (0.9+) required for proxy actions
- **Audit Trail:** Complete logging of all actions taken

### 4.6 Autonomous Testing Framework
- **Test Personas:** Synthetic users with defined behavior patterns
  - Busy Executive (terse, high urgency)
  - Forgetful User (contradictory instructions)
  - Adversarial Tester (edge cases, ambiguity)
  - New User (cold start, onboarding)
- **LLM-Based Evaluation:** Semantic assertion checking
- **CI/CD Integration:** Automated test execution in pipeline

---

## 5. Dependencies & Integrations

### External APIs

#### Google Workspace (OAuth 2.0)
- **Gmail API:** Read/send emails, thread management
- **Calendar API:** Event CRUD, availability queries, conflict detection
- **Scopes Required:**
  - `gmail.modify`: Read and send emails
  - `calendar`: Full calendar access
- **Access Type:** Offline (requires refresh tokens)

#### GitHub (GitHub App)
- **Issues API:** List, create, update issues
- **Pull Requests API:** List PRs, review status
- **Webhooks:** PR opened/merged, issue updates
- **Authentication:** App installation token

#### Linear (API Token)
- **Issues API:** Create/update/query issues
- **Projects API:** Project status and hierarchy
- **Webhooks:** Issue state changes, assignments
- **Authentication:** Personal or workspace API token

#### Slack (Bot Token)
- **Messages API:** Send messages, read history
- **Channels API:** Channel membership, history
- **Events API:** Real-time event subscriptions
- **Authentication:** Bot OAuth token

#### Telegram (Bot API)
- **Send/receive messages:** User interface
- **Webhooks:** Real-time message delivery
- **Authentication:** Bot token

#### Twilio (Optional - SMS)
- **SMS API:** Send/receive SMS
- **Authentication:** Account SID + Auth Token

### Infrastructure Dependencies

#### Neon Postgres
- **Purpose:** Primary database, vector storage
- **Features:** Serverless, auto-scaling, pgvector extension
- **Schema:** Users, sessions, OAuth tokens, audit logs, memories

#### Neo4j Aura Free
- **Purpose:** Knowledge graph backend for Mem0
- **Features:** Relationship queries, graph traversal
- **Data Model:** Entity nodes, relationship edges

#### Upstash
- **QStash:** Job queue for long-running tasks (>30s)
- **Redis:** Caching and session storage
- **Purpose:** Overcome Vercel's 30-second function timeout

#### OpenRouter
- **Purpose:** LLM gateway and model switching
- **Models:** Claude Opus 4.5, Sonnet 4, Mistral Small
- **Features:** Unified API, automatic fallback, usage tracking

---

## 6. Suggested POC Progression

### POC 1: Event Classification & Routing (Foundation)
**Hypothesis:** A cheap classification model can accurately triage events and route to appropriate agents, reducing costs by 80% vs. using Opus for everything.

**Scope:**
- Set up Next.js + Inngest + OpenRouter
- Implement 3-tier model routing (cheap/standard/thinking)
- Create classifier agent with Mistral Small
- Test with synthetic events (GitHub PR, calendar conflict, user message)
- Measure: classification accuracy, cost per event, latency

**Success Criteria:**
- ≥90% classification accuracy
- <$0.01 per event average cost
- <2s end-to-end latency

**Builds Toward:** Core routing infrastructure that all other agents depend on

---

### POC 2: Memory-Augmented Conversations (Intelligence)
**Hypothesis:** Hybrid vector + graph memory enables both semantic search and relationship queries, providing superior context vs. vector-only approaches.

**Scope:**
- Integrate Mem0 with Neon pgvector + Neo4j Aura
- Implement memory namespaces (work/personal/preferences)
- Store sample interactions and entity relationships
- Query memory in orchestrator agent responses
- Test semantic search vs. relationship traversal

**Success Criteria:**
- Retrieve relevant context in <500ms
- Relationship queries return connected entities (e.g., "John's projects")
- Memory improves response quality (measured via LLM judge)

**Builds Toward:** Persistent learning and context awareness across sessions

**Depends On:** POC 1 (need agent framework to test memory integration)

---

### POC 3: OAuth + Calendar Integration (Real-World Value)
**Hypothesis:** Autonomous calendar management (scheduling, conflict detection, reminders) provides immediate user value and validates the assistant's utility.

**Scope:**
- Implement Better Auth with Google OAuth
- Connect to Google Calendar API
- Create scheduler agent (conflict detection, availability queries)
- Build Telegram bot for user commands
- Test: "Schedule coffee with John next week when we're both free"

**Success Criteria:**
- OAuth flow works end-to-end
- Successfully detect calendar conflicts
- Find mutual availability slots
- Create calendar events via assistant commands

**Builds Toward:** First real-world integration that users can experience daily

**Depends On:** POC 1 (routing), POC 2 (memory for preferences like "mornings only")

---

### POC 4: Proxy Mode with Authorization (Trust)
**Hypothesis:** Users will trust the assistant to act on their behalf (send emails, create issues) if authorization is explicit and actions have high confidence.

**Scope:**
- Implement proxy mode authorization system
- Build confidence threshold checking (0.9+ for proxy actions)
- Add audit logging for all actions
- Test: "Send email to Sarah saying I'll be 10 minutes late"
- Measure: action accuracy, false positive rate, user trust metrics

**Success Criteria:**
- 0 false positives (no wrong emails sent)
- ≥95% action accuracy (emails sent match intent)
- Complete audit trail of all proxy actions

**Builds Toward:** Autonomous actions that save users significant time

**Depends On:** POC 1 (routing), POC 2 (memory), POC 3 (real integrations to act on)

---

### POC 5: Proactive Event Loop (Autonomy)
**Hypothesis:** Scheduled digests and proactive monitoring provide value without user prompts, making the assistant feel "always-on" and attentive.

**Scope:**
- Implement morning digest function (7am daily via Inngest cron)
- Aggregate overnight activity (GitHub PRs, Linear updates, emails)
- Classify importance and surface top 3 items
- Send digest via Telegram
- Test with synthetic data, then real account

**Success Criteria:**
- Digests deliver on schedule (99% reliability)
- Relevance: ≥80% of surfaced items rated as "important" by user
- Action rate: ≥50% of digests lead to user action

**Builds Toward:** The proactive, autonomous assistant vision

**Depends On:** POC 1 (routing), POC 2 (memory), POC 3 (integrations), POC 4 (actions)

---

## 7. One-Line Description

**GitHub Description (350 char max):**

> Izzie: AI personal assistant unifying email, calendar, Slack, GitHub, and Linear. Event-driven architecture with tiered LLM routing (Opus 4.5 for reasoning, Mistral for ops). Hybrid vector+graph memory. Operates as distinct assistant or transparent user proxy with explicit auth.

**Alternative (Shorter, 260 chars):**

> AI assistant unifying communication & scheduling across email, calendar, Slack, GitHub, Linear. Event-driven with tiered LLMs (Opus/Mistral), hybrid memory (pgvector+Neo4j). Dual mode: distinct persona or user proxy.

---

## 8. Architecture Highlights & Considerations

### Strengths

1. **Cost-Optimized Model Routing:** 3-tier approach (cheap/standard/thinking) reduces costs by routing 80%+ of operations to cheaper models
2. **Serverless-First Design:** Vercel + Inngest + Neon are all serverless-native, enabling true pay-per-use scaling
3. **Hybrid Memory:** Vector + graph solves both similarity and relationship query problems
4. **Model Agnostic:** OpenRouter enables easy model switching as the landscape evolves
5. **Durable Execution:** Inngest provides retry logic and step-based execution critical for reliability
6. **Security by Design:** Proxy mode requires explicit authorization, complete audit trail, high confidence thresholds
7. **Testing as First-Class Citizen:** Autonomous testing with synthetic personas built into architecture

### Considerations & Risks

1. **Vercel Function Timeout:** 30s limit (Pro tier) may be tight for complex orchestrations
   - **Mitigation:** Upstash QStash for long-running tasks
   - **Risk:** Adds complexity and potential failure points

2. **Neo4j Free Tier Limits:** Aura Free has storage and query limits
   - **Mitigation:** Path to Mem0 Cloud when usage grows
   - **Risk:** Migration complexity if graph data structure changes

3. **OAuth Token Management:** Refresh token rotation and revocation requires careful handling
   - **Mitigation:** Better Auth handles this, but encryption at rest is manual
   - **Risk:** Security incident if tokens leaked

4. **Proxy Mode Safety:** Acting as user is high-risk if confidence scoring fails
   - **Mitigation:** High threshold (0.9+), explicit authorization, audit trail
   - **Risk:** Reputation damage if assistant sends wrong message

5. **Multi-User Support Unclear:** Architecture document doesn't specify single vs. multi-tenant
   - **Consideration:** Current schema supports multiple users, but persona context may need per-user configuration
   - **Decision Point:** Clarify before POC 3 (OAuth integration)

6. **MCP Integration Choice:** Custom vs. existing MCP servers (mcp-ticketer, etc.)
   - **Consideration:** Custom gives full control, existing saves time
   - **Decision Point:** When building first integration (POC 3)

---

## 9. Technical Debt & Improvement Opportunities

### Not Yet Decided

1. **Telegram vs. Other UI:** Telegram Bot API under consideration, but could use web dashboard, mobile app, or other chat interfaces
2. **SMS Integration:** Twilio mentioned but not locked - may not be needed
3. **MCP Server Choice:** Build custom or use existing servers like mcp-ticketer
4. **Multi-User Support:** Architecture supports it, but not explicitly called out
5. **Mem0 OSS → Cloud Migration Trigger:** No clear criteria for when to migrate

### Potential Enhancements

1. **Voice Interface:** No mention of voice input/output (Telegram supports voice messages)
2. **Mobile App:** Web-based only via Next.js - could add React Native mobile app
3. **Collaboration Features:** Single-user focused - could add shared contexts for teams
4. **Plugin System:** Extensibility for community-contributed integrations
5. **Local-First Option:** All services are cloud-based - no offline mode

---

## 10. Next Steps for Implementation

### Immediate (Week 1-2)
1. **Repository Setup:**
   - Initialize Next.js 14 project with App Router
   - Configure TypeScript, ESLint, Prettier
   - Set up directory structure per architecture doc

2. **Development Environment:**
   - Docker Compose for local Neo4j
   - Neon database provisioning (free tier)
   - OpenRouter API key setup
   - Create `.env.local` template

3. **POC 1 Foundation:**
   - Install Inngest SDK
   - Create basic event schema
   - Implement model router with tier selection
   - Build classifier agent skeleton

### Short-Term (Week 3-4)
1. **POC 1 Completion:**
   - Synthetic event generators
   - Classification accuracy measurement
   - Cost tracking per event
   - Latency benchmarks

2. **POC 2 Planning:**
   - Mem0 SDK integration
   - Schema design for memory namespaces
   - Sample data generation script

### Medium-Term (Month 2)
1. **POC 2-3 Execution:**
   - Memory integration
   - Better Auth setup
   - Google OAuth flow
   - Calendar API integration
   - Telegram bot

### Long-Term (Month 3+)
1. **POC 4-5 Execution:**
   - Proxy mode implementation
   - Authorization system
   - Proactive event loop
   - Production deployment

---

## 11. Research Metadata

**Analysis Completed:** January 5, 2026
**Source Document Version:** 1.0 (Locked)
**Architecture Status:** Finalized, ready for implementation
**Technology Stack:** Locked (Next.js, Mem0, Better Auth, Inngest, OpenRouter, Neon, Neo4j)
**Open Decisions:** 4 (Telegram UI, SMS, MCP servers, multi-user)

**Recommended First Action:** Begin POC 1 (Event Classification & Routing) to validate cost/performance assumptions and establish foundation for all subsequent features.

---

*Research conducted by: AI Research Agent*
*Document saved to: `/docs/research/izzie2-architecture-analysis-2026-01-05.md`*
