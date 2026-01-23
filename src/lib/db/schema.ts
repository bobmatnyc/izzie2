/**
 * Database Schema for Neon Postgres with pgvector
 *
 * This schema defines tables for:
 * - Memory entries with vector embeddings (1536 dimensions)
 * - Users for session context
 * - Conversations for tracking
 *
 * Uses pgvector extension for semantic search capabilities.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  varchar,
  bigint,
  index,
  customType,
  date,
  real,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Custom vector type for pgvector extension
 * Drizzle doesn't have built-in vector support, so we define it as a custom type
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns vectors as strings like "[0.1,0.2,0.3]"
    return JSON.parse(value.replace(/[\[\]]/g, (m) => (m === '[' ? '[' : ']')));
  },
});

/**
 * Users table
 * Tracks users and their preferences
 */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    name: text('name'),
    image: text('image'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index('users_email_idx').on(table.email),
  })
);

/**
 * Conversations table
 * Tracks conversation sessions
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('conversations_user_id_idx').on(table.userId),
    createdAtIdx: index('conversations_created_at_idx').on(table.createdAt),
  })
);

/**
 * Memory entries table with vector embeddings
 * Stores semantic memory with pgvector for similarity search
 *
 * Vector dimension: 1536 (OpenAI text-embedding-3-small)
 */
export const memoryEntries = pgTable(
  'memory_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'cascade',
    }),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Content and metadata
    content: text('content').notNull(),
    summary: text('summary'),
    metadata: jsonb('metadata').$type<{
      source?: string;
      type?: string;
      tags?: string[];
      entities?: Record<string, unknown>;
      [key: string]: unknown;
    }>(),

    // Vector embedding (1536 dimensions for text-embedding-3-small)
    // Using pgvector extension - stored as vector type
    embedding: vector('embedding'),

    // Importance and relevance scoring
    importance: integer('importance').default(5), // 1-10 scale
    accessCount: integer('access_count').default(0),
    lastAccessedAt: timestamp('last_accessed_at'),

    // Soft delete support
    isDeleted: boolean('is_deleted').default(false),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Regular indexes
    userIdIdx: index('memory_entries_user_id_idx').on(table.userId),
    conversationIdIdx: index('memory_entries_conversation_id_idx').on(
      table.conversationId
    ),
    createdAtIdx: index('memory_entries_created_at_idx').on(table.createdAt),
    importanceIdx: index('memory_entries_importance_idx').on(table.importance),

    // Vector index for similarity search using IVFFlat
    // This will be created via migration SQL (not supported by Drizzle schema yet)
    // See migration file for: CREATE INDEX ON memory_entries USING ivfflat (embedding vector_cosine_ops)
  })
);

/**
 * Better Auth tables for authentication
 */

/**
 * Sessions table - stores user sessions
 * Used by Better Auth for session management
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
    tokenIdx: index('sessions_token_idx').on(table.token),
    expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
  })
);

/**
 * Accounts table - stores OAuth provider accounts
 * Links users to their OAuth providers (Google, etc.)
 * Note: ID is text, not UUID, because Better Auth generates its own IDs (base62 format)
 */
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    accountId: text('account_id').notNull(), // Provider's user ID
    providerId: text('provider_id').notNull(), // e.g., 'google'
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'), // For email/password auth
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('accounts_user_id_idx').on(table.userId),
    providerIdx: index('accounts_provider_idx').on(
      table.providerId,
      table.accountId
    ),
  })
);

/**
 * Verifications table - stores email verification tokens
 * Used for email verification and password reset flows
 * Note: ID is text, not UUID, because Better Auth generates its own IDs
 */
export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(), // Email or phone
    value: text('value').notNull(), // Verification token
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    identifierIdx: index('verifications_identifier_idx').on(table.identifier),
  })
);

/**
 * Type exports for TypeScript
 */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type MemoryEntry = typeof memoryEntries.$inferSelect;
export type NewMemoryEntry = typeof memoryEntries.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;

/**
 * Proxy Authorization tables for POC-4
 */

/**
 * Proxy authorizations - user consent for AI to act on their behalf
 */
export const proxyAuthorizations = pgTable(
  'proxy_authorizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Action classification
    actionClass: text('action_class').notNull(), // 'send_email', 'create_calendar_event', etc.
    actionType: text('action_type').notNull(), // 'email', 'calendar', 'github', 'slack', etc.

    // Authorization scope
    scope: text('scope').notNull(), // 'single', 'session', 'standing', 'conditional'

    // Time constraints
    grantedAt: timestamp('granted_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'), // NULL = no expiration (standing auth)
    revokedAt: timestamp('revoked_at'), // User can revoke

    // Conditions (stored as JSONB for flexibility)
    conditions: jsonb('conditions').$type<{
      maxActionsPerDay?: number;
      maxActionsPerWeek?: number;
      allowedHours?: { start: number; end: number }; // 9-17 = business hours
      requireConfidenceThreshold?: number; // 0.0-1.0
      allowedRecipients?: string[]; // Email whitelist
      allowedCalendars?: string[]; // Calendar IDs
    }>(),

    // Metadata
    grantMethod: text('grant_method').notNull(), // 'explicit_consent', 'implicit_learning', 'bulk_grant'
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('proxy_authorizations_user_id_idx').on(table.userId),
    actionClassIdx: index('proxy_authorizations_action_class_idx').on(table.actionClass),
    scopeIdx: index('proxy_authorizations_scope_idx').on(table.scope),
    activeAuthIdx: index('proxy_authorizations_active_idx').on(
      table.userId,
      table.actionClass,
      table.revokedAt // NULL = active
    ),
  })
);

/**
 * Proxy audit log - tracks all proxy actions
 */
export const proxyAuditLog = pgTable(
  'proxy_audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Who and what
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    authorizationId: uuid('authorization_id')
      .references(() => proxyAuthorizations.id, { onDelete: 'set null' }),

    // Action details
    action: text('action').notNull(), // 'send_email', 'create_event', etc.
    actionClass: text('action_class').notNull(),
    mode: text('mode').notNull(), // 'assistant' or 'proxy'
    persona: text('persona').notNull(), // 'work' or 'personal'

    // Input/output
    input: jsonb('input').$type<Record<string, unknown>>(),
    output: jsonb('output').$type<Record<string, unknown>>(),

    // AI model details
    modelUsed: text('model_used'),
    confidence: integer('confidence'), // 0-100 (stored as percentage)
    tokensUsed: integer('tokens_used'),
    latencyMs: integer('latency_ms'),

    // Result
    success: boolean('success').notNull(),
    error: text('error'),

    // User confirmation (for high-risk actions)
    userConfirmed: boolean('user_confirmed').default(false),
    confirmedAt: timestamp('confirmed_at'),

    // Timestamp
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('proxy_audit_log_user_id_idx').on(table.userId),
    actionIdx: index('proxy_audit_log_action_idx').on(table.action),
    timestampIdx: index('proxy_audit_log_timestamp_idx').on(table.timestamp),
    successIdx: index('proxy_audit_log_success_idx').on(table.success),
  })
);

/**
 * Authorization templates - pre-defined auth bundles
 */
export const authorizationTemplates = pgTable(
  'authorization_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(), // 'work_assistant', 'personal_basic', etc.
    description: text('description'),

    // Bundled authorizations
    authorizations: jsonb('authorizations').$type<
      Array<{
        actionClass: string;
        scope: 'single' | 'session' | 'standing' | 'conditional';
        conditions?: Record<string, unknown>;
      }>
    >(),

    // Template metadata
    isDefault: boolean('is_default').default(false),
    isActive: boolean('is_active').default(true),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  }
);

/**
 * User authorization preferences - which templates are active
 */
export const userAuthorizationPreferences = pgTable(
  'user_authorization_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    templateId: uuid('template_id')
      .references(() => authorizationTemplates.id, { onDelete: 'cascade' })
      .notNull(),

    isActive: boolean('is_active').default(true),
    activatedAt: timestamp('activated_at').defaultNow().notNull(),
    deactivatedAt: timestamp('deactivated_at'),
  },
  (table) => ({
    userIdIdx: index('user_auth_prefs_user_id_idx').on(table.userId),
    templateIdIdx: index('user_auth_prefs_template_id_idx').on(table.templateId),
    userTemplateUnique: index('user_auth_prefs_unique').on(table.userId, table.templateId),
  })
);

/**
 * Consent history table - tracks all consent changes (POC-4 Phase 2)
 * Provides full audit trail of authorization modifications
 */
export const consentHistory = pgTable(
  'consent_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    authorizationId: uuid('authorization_id')
      .references(() => proxyAuthorizations.id, { onDelete: 'cascade' })
      .notNull(),

    // Change tracking
    changeType: text('change_type').notNull(), // 'granted', 'modified', 'revoked', 'expired'
    previousState: jsonb('previous_state').$type<Record<string, unknown>>(),
    newState: jsonb('new_state').$type<Record<string, unknown>>(),

    // Metadata
    changedBy: text('changed_by'), // 'user', 'system', 'admin'
    reason: text('reason'), // Optional reason for change

    // Timestamp
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('consent_history_user_id_idx').on(table.userId),
    authIdIdx: index('consent_history_auth_id_idx').on(table.authorizationId),
    timestampIdx: index('consent_history_timestamp_idx').on(table.timestamp),
    changeTypeIdx: index('consent_history_change_type_idx').on(table.changeType),
  })
);

/**
 * Proxy rollbacks table - tracks rollback operations (POC-4 Phase 2)
 * Enables undoing proxy actions with full audit trail
 */
export const proxyRollbacks = pgTable(
  'proxy_rollbacks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    auditEntryId: uuid('audit_entry_id')
      .references(() => proxyAuditLog.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Rollback strategy
    strategy: text('strategy').notNull(), // 'direct_undo', 'compensating', 'manual', 'not_supported'
    status: text('status').notNull(), // 'pending', 'in_progress', 'completed', 'failed'

    // Captured state for rollback
    rollbackData: jsonb('rollback_data').$type<{
      originalInput?: Record<string, unknown>;
      originalOutput?: Record<string, unknown>;
      undoActions?: Array<{ action: string; params: unknown }>;
      [key: string]: unknown;
    }>(),

    // Result tracking
    errorMessage: text('error_message'),
    completedAt: timestamp('completed_at'),

    // Rollback window (TTL)
    expiresAt: timestamp('expires_at').notNull(), // Default 24h from creation

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    auditEntryIdx: index('proxy_rollbacks_audit_entry_idx').on(table.auditEntryId),
    userIdIdx: index('proxy_rollbacks_user_id_idx').on(table.userId),
    statusIdx: index('proxy_rollbacks_status_idx').on(table.status),
    expiresAtIdx: index('proxy_rollbacks_expires_at_idx').on(table.expiresAt),
  })
);

/**
 * Extraction Progress Tracking (POC-5)
 * Tracks data extraction progress for emails, calendar, and drive
 */
export const extractionProgress = pgTable(
  'extraction_progress',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    source: text('source').notNull(), // 'email' | 'calendar' | 'drive'
    status: text('status').notNull().default('idle'), // 'idle' | 'running' | 'paused' | 'completed' | 'error'

    // Watermarks - track extraction boundaries
    oldestDateExtracted: timestamp('oldest_date_extracted'),
    newestDateExtracted: timestamp('newest_date_extracted'),

    // Progress counters
    totalItems: integer('total_items').default(0),
    processedItems: integer('processed_items').default(0),
    failedItems: integer('failed_items').default(0),

    // Chunk configuration
    chunkSizeDays: integer('chunk_size_days').default(7),
    currentChunkStart: timestamp('current_chunk_start'),
    currentChunkEnd: timestamp('current_chunk_end'),

    // Stats
    entitiesExtracted: integer('entities_extracted').default(0),
    totalCost: integer('total_cost').default(0), // Cost in cents

    // Timestamps
    lastRunAt: timestamp('last_run_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('extraction_progress_user_id_idx').on(table.userId),
    sourceIdx: index('extraction_progress_source_idx').on(table.source),
    statusIdx: index('extraction_progress_status_idx').on(table.status),
    userSourceUnique: index('extraction_progress_user_source_unique').on(
      table.userId,
      table.source
    ),
  })
);

/**
 * Type exports for extraction progress
 */
export type ExtractionProgress = typeof extractionProgress.$inferSelect;
export type NewExtractionProgress = typeof extractionProgress.$inferInsert;

/**
 * Chat Sessions table (POC-6)
 * Tracks chat sessions with compression and current task management
 */
export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title'),

    // Memory layers
    currentTask: jsonb('current_task').$type<{
      goal: string;
      context: string;
      blockers: string[];
      progress: string;
      nextSteps: string[];
      updatedAt: string; // ISO timestamp
    } | null>(),
    compressedHistory: text('compressed_history'),
    recentMessages: jsonb('recent_messages')
      .$type<
        Array<{
          id: string;
          role: 'user' | 'assistant';
          content: string;
          timestamp: string; // ISO timestamp
          metadata?: {
            tokensUsed?: number;
            model?: string;
          };
        }>
      >()
      .default([])
      .notNull(),
    archivedMessages: jsonb('archived_messages').$type<
      Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
        metadata?: {
          tokensUsed?: number;
          model?: string;
        };
      }>
    >(),

    // Metadata
    messageCount: integer('message_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('chat_sessions_user_id_idx').on(table.userId),
    createdAtIdx: index('chat_sessions_created_at_idx').on(table.createdAt),
    updatedAtIdx: index('chat_sessions_updated_at_idx').on(table.updatedAt),
  })
);

/**
 * Type exports for chat sessions
 */
export type ChatSessionRecord = typeof chatSessions.$inferSelect;
export type NewChatSessionRecord = typeof chatSessions.$inferInsert;

/**
 * MCP Server Configuration tables (POC-7)
 * Stores user-configured MCP servers and tool permissions
 */

/**
 * MCP Servers table - user-configured MCP servers
 * Supports stdio, SSE, and HTTP transports
 */
export const mcpServers = pgTable(
  'mcp_servers',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description'),
    transport: text('transport').notNull(), // 'stdio' | 'sse' | 'http'

    // For stdio transport
    command: text('command'),
    args: jsonb('args').$type<string[]>(),
    env: jsonb('env').$type<Record<string, string>>(),

    // For SSE/HTTP transport
    url: text('url'),
    headers: jsonb('headers').$type<Record<string, string>>(),

    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('mcp_servers_user_id_idx').on(table.userId),
    enabledIdx: index('mcp_servers_enabled_idx').on(table.enabled),
  })
);

/**
 * MCP Tool Permissions table - tracks "Always Allow" settings
 * Enables user to auto-approve specific tool invocations
 */
export const mcpToolPermissions = pgTable(
  'mcp_tool_permissions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    serverId: text('server_id')
      .references(() => mcpServers.id, { onDelete: 'cascade' })
      .notNull(),
    toolName: text('tool_name').notNull(),
    alwaysAllow: boolean('always_allow').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('mcp_tool_permissions_user_id_idx').on(table.userId),
    serverIdIdx: index('mcp_tool_permissions_server_id_idx').on(table.serverId),
    userServerToolUnique: index('mcp_tool_permissions_unique').on(
      table.userId,
      table.serverId,
      table.toolName
    ),
  })
);

/**
 * MCP Tool Audit Log table - tracks all MCP tool executions
 * Provides observability and debugging for MCP operations
 */
export const mcpToolAuditLog = pgTable(
  'mcp_tool_audit_log',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    serverId: text('server_id').notNull(),
    toolName: text('tool_name').notNull(),
    arguments: jsonb('arguments').$type<Record<string, unknown>>(),
    result: jsonb('result').$type<unknown>(),
    error: text('error'),
    duration: integer('duration'), // milliseconds
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('mcp_tool_audit_log_user_id_idx').on(table.userId),
    serverIdIdx: index('mcp_tool_audit_log_server_id_idx').on(table.serverId),
    toolNameIdx: index('mcp_tool_audit_log_tool_name_idx').on(table.toolName),
    createdAtIdx: index('mcp_tool_audit_log_created_at_idx').on(table.createdAt),
  })
);

/**
 * Type exports for MCP tables
 */
export type McpServer = typeof mcpServers.$inferSelect;
export type NewMcpServer = typeof mcpServers.$inferInsert;

export type McpToolPermission = typeof mcpToolPermissions.$inferSelect;
export type NewMcpToolPermission = typeof mcpToolPermissions.$inferInsert;

export type McpToolAuditEntry = typeof mcpToolAuditLog.$inferSelect;
export type NewMcpToolAuditEntry = typeof mcpToolAuditLog.$inferInsert;

/**
 * Agent Framework tables (POC-8 - Research Agent)
 * Tracks agent tasks, research sources, and findings
 */

/**
 * Agent Tasks table - tracks all agent executions
 * Provides full lifecycle tracking with progress, costs, and budgets
 */
export const agentTasks = pgTable(
  'agent_tasks',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    agentType: text('agent_type').notNull(), // 'research', 'classifier', 'scheduler', etc.
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sessionId: text('session_id'), // Optional link to chat session

    // Task status and execution
    status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'failed' | 'paused'
    input: jsonb('input').$type<Record<string, unknown>>().notNull(),
    output: jsonb('output').$type<Record<string, unknown>>(),
    error: text('error'),

    // Progress tracking
    progress: integer('progress').default(0).notNull(), // 0-100
    currentStep: text('current_step'),
    stepsCompleted: integer('steps_completed').default(0).notNull(),
    totalSteps: integer('total_steps').default(0).notNull(),

    // Cost tracking
    tokensUsed: integer('tokens_used').default(0).notNull(),
    totalCost: integer('total_cost').default(0).notNull(), // Cost in cents
    budgetLimit: integer('budget_limit'), // Budget limit in cents

    // Hierarchy support (for sub-tasks)
    parentTaskId: text('parent_task_id').references((): any => agentTasks.id, {
      onDelete: 'cascade',
    }),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('agent_tasks_user_id_idx').on(table.userId),
    agentTypeIdx: index('agent_tasks_agent_type_idx').on(table.agentType),
    statusIdx: index('agent_tasks_status_idx').on(table.status),
    sessionIdIdx: index('agent_tasks_session_id_idx').on(table.sessionId),
    parentTaskIdIdx: index('agent_tasks_parent_task_id_idx').on(table.parentTaskId),
    createdAtIdx: index('agent_tasks_created_at_idx').on(table.createdAt),
  })
);

/**
 * Research Sources table - tracks source URLs and content for research tasks
 * Supports caching and credibility scoring
 */
export const researchSources = pgTable(
  'research_sources',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    taskId: text('task_id')
      .references(() => agentTasks.id, { onDelete: 'cascade' })
      .notNull(),

    // Source identification
    url: text('url').notNull(),
    title: text('title'),
    content: text('content'),
    contentType: text('content_type'), // 'html', 'pdf', 'json', etc.

    // Scoring and quality
    relevanceScore: integer('relevance_score'), // 0-100
    credibilityScore: integer('credibility_score'), // 0-100

    // Fetch status
    fetchStatus: text('fetch_status').default('pending').notNull(), // 'pending' | 'fetched' | 'failed'
    fetchError: text('fetch_error'),
    fetchedAt: timestamp('fetched_at'),

    // Cache TTL
    expiresAt: timestamp('expires_at'), // For cache invalidation

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    taskIdIdx: index('research_sources_task_id_idx').on(table.taskId),
    urlIdx: index('research_sources_url_idx').on(table.url),
    fetchStatusIdx: index('research_sources_fetch_status_idx').on(table.fetchStatus),
    expiresAtIdx: index('research_sources_expires_at_idx').on(table.expiresAt),
  })
);

/**
 * Research Findings table - stores extracted claims and evidence
 * Supports semantic search via embeddings
 */
export const researchFindings = pgTable(
  'research_findings',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    taskId: text('task_id')
      .references(() => agentTasks.id, { onDelete: 'cascade' })
      .notNull(),
    sourceId: text('source_id').references(() => researchSources.id, {
      onDelete: 'set null',
    }),

    // Finding content
    claim: text('claim').notNull(),
    evidence: text('evidence'),
    confidence: integer('confidence').notNull(), // 0-100
    citation: text('citation'), // Formatted citation
    quote: text('quote'), // Direct quote from source

    // Semantic search support (1536 dimensions for text-embedding-3-small)
    embedding: vector('embedding'),

    // Timestamp
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    taskIdIdx: index('research_findings_task_id_idx').on(table.taskId),
    sourceIdIdx: index('research_findings_source_id_idx').on(table.sourceId),
    confidenceIdx: index('research_findings_confidence_idx').on(table.confidence),
    createdAtIdx: index('research_findings_created_at_idx').on(table.createdAt),
    // Vector index will be created via migration SQL (not supported by Drizzle schema yet)
    // CREATE INDEX ON research_findings USING ivfflat (embedding vector_cosine_ops)
  })
);

/**
 * Type exports for agent framework tables
 */
export type AgentTask = typeof agentTasks.$inferSelect;
export type NewAgentTask = typeof agentTasks.$inferInsert;

export type ResearchSource = typeof researchSources.$inferSelect;
export type NewResearchSource = typeof researchSources.$inferInsert;

export type ResearchFinding = typeof researchFindings.$inferSelect;
export type NewResearchFinding = typeof researchFindings.$inferInsert;

/**
 * Type exports for proxy authorization
 */
export type ProxyAuthorization = typeof proxyAuthorizations.$inferSelect;
export type NewProxyAuthorization = typeof proxyAuthorizations.$inferInsert;

export type ProxyAuditEntry = typeof proxyAuditLog.$inferSelect;
export type NewProxyAuditEntry = typeof proxyAuditLog.$inferInsert;

export type AuthorizationTemplate = typeof authorizationTemplates.$inferSelect;
export type NewAuthorizationTemplate = typeof authorizationTemplates.$inferInsert;

export type UserAuthorizationPreference = typeof userAuthorizationPreferences.$inferSelect;
export type NewUserAuthorizationPreference = typeof userAuthorizationPreferences.$inferInsert;

export type ConsentHistory = typeof consentHistory.$inferSelect;
export type NewConsentHistory = typeof consentHistory.$inferInsert;

export type ProxyRollback = typeof proxyRollbacks.$inferSelect;
export type NewProxyRollback = typeof proxyRollbacks.$inferInsert;

/**
 * Telegram Integration tables
 * Links Telegram accounts to users and maps chat sessions
 */

/**
 * Telegram Links table - links Telegram accounts to users
 * Each user can have one Telegram account linked
 */
export const telegramLinks = pgTable(
  'telegram_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    telegramChatId: bigint('telegram_chat_id', { mode: 'bigint' }).notNull().unique(),
    telegramUsername: text('telegram_username'),
    linkedAt: timestamp('linked_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('telegram_links_user_id_idx').on(table.userId),
    telegramChatIdIdx: index('telegram_links_telegram_chat_id_idx').on(table.telegramChatId),
  })
);

/**
 * Telegram Link Codes table - temporary codes for linking accounts
 * Codes expire after a short time and can only be used once
 */
export const telegramLinkCodes = pgTable(
  'telegram_link_codes',
  {
    code: varchar('code', { length: 6 }).primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    used: boolean('used').default(false).notNull(),
  },
  (table) => ({
    userIdIdx: index('telegram_link_codes_user_id_idx').on(table.userId),
    expiresAtIdx: index('telegram_link_codes_expires_at_idx').on(table.expiresAt),
  })
);

/**
 * Telegram Sessions table - maps Telegram chats to izzie sessions
 * Links a Telegram conversation to a chat session for context continuity
 */
export const telegramSessions = pgTable(
  'telegram_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    telegramChatId: bigint('telegram_chat_id', { mode: 'bigint' }).notNull().unique(),
    chatSessionId: uuid('chat_session_id')
      .references(() => chatSessions.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    telegramChatIdIdx: index('telegram_sessions_telegram_chat_id_idx').on(table.telegramChatId),
    chatSessionIdIdx: index('telegram_sessions_chat_session_id_idx').on(table.chatSessionId),
  })
);

/**
 * Type exports for Telegram tables
 */
export type TelegramLink = typeof telegramLinks.$inferSelect;
export type NewTelegramLink = typeof telegramLinks.$inferInsert;

export type TelegramLinkCode = typeof telegramLinkCodes.$inferSelect;
export type NewTelegramLinkCode = typeof telegramLinkCodes.$inferInsert;

export type TelegramSession = typeof telegramSessions.$inferSelect;
export type NewTelegramSession = typeof telegramSessions.$inferInsert;

/**
 * Digest tables for scheduled digest delivery
 * User preferences for digest timing and delivery channels
 */

/**
 * Digest Preferences table - user digest settings
 * Each user can configure their preferred digest schedule
 */
export const digestPreferences = pgTable(
  'digest_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    enabled: boolean('enabled').default(true).notNull(),
    morningTime: text('morning_time').default('08:00:00').notNull(), // TIME stored as text
    eveningTime: text('evening_time').default('18:00:00').notNull(), // TIME stored as text
    timezone: text('timezone').default('UTC').notNull(),
    channels: text('channels').array().default(sql`ARRAY['email']::text[]`).notNull(),
    minRelevanceScore: text('min_relevance_score').default('0.50').notNull(), // NUMERIC(3,2) stored as text
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('digest_preferences_user_id_idx').on(table.userId),
    enabledIdx: index('digest_preferences_enabled_idx').on(table.enabled),
  })
);

/**
 * Digest Records table - digest tracking
 * Tracks generated and delivered digests for history and debugging
 */
export const digestRecords = pgTable(
  'digest_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    digestType: text('digest_type').notNull(), // 'morning' | 'evening' | 'weekly' etc.
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
    deliveredAt: timestamp('delivered_at'),
    deliveryChannel: text('delivery_channel').notNull(), // 'email' | 'telegram' | 'push' etc.
    itemCount: integer('item_count').default(0).notNull(),
    content: jsonb('content').$type<{
      items?: Array<{
        id: string;
        title: string;
        summary: string;
        relevanceScore: number;
        source?: string;
      }>;
      metadata?: Record<string, unknown>;
    }>(),
    error: text('error'),
  },
  (table) => ({
    userIdIdx: index('digest_records_user_id_idx').on(table.userId),
    digestTypeIdx: index('digest_records_digest_type_idx').on(table.digestType),
    generatedAtIdx: index('digest_records_generated_at_idx').on(table.generatedAt),
    userGeneratedIdx: index('digest_records_user_generated_idx').on(
      table.userId,
      table.generatedAt
    ),
  })
);

/**
 * Type exports for digest tables
 */
export type DigestPreference = typeof digestPreferences.$inferSelect;
export type NewDigestPreference = typeof digestPreferences.$inferInsert;

export type DigestRecord = typeof digestRecords.$inferSelect;
export type NewDigestRecord = typeof digestRecords.$inferInsert;

/**
 * User Preferences table - writing style customization
 * Stores user preferences for AI writing style, tone, and custom instructions
 */
export const userPreferences = pgTable(
  'user_preferences',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),

    // Writing style preferences
    writingStyle: text('writing_style').default('professional').notNull(), // 'casual' | 'formal' | 'professional'
    tone: text('tone').default('friendly').notNull(), // 'friendly' | 'neutral' | 'assertive'

    // Custom instructions for AI interactions
    customInstructions: text('custom_instructions'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('user_preferences_user_id_idx').on(table.userId),
  })
);

/**
 * Type exports for user preferences
 */
export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;

/**
 * Usage Tracking table
 * Tracks token usage and costs per user, model, and source
 */
export const usageTracking = pgTable(
  'usage_tracking',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    conversationId: text('conversation_id'),
    date: date('date').notNull(),
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    costUsd: real('cost_usd').notNull().default(0),
    source: text('source'), // 'chat', 'telegram', 'extraction', 'research'
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIdx: index('usage_tracking_user_id_idx').on(table.userId),
    dateIdx: index('usage_tracking_date_idx').on(table.date),
    modelIdx: index('usage_tracking_model_idx').on(table.model),
    sourceIdx: index('usage_tracking_source_idx').on(table.source),
    userDateIdx: index('usage_tracking_user_date_idx').on(table.userId, table.date),
  })
);

/**
 * Type exports for usage tracking
 */
export type UsageTrackingRecord = typeof usageTracking.$inferSelect;
export type NewUsageTrackingRecord = typeof usageTracking.$inferInsert;

/**
 * Enum-like constants for writing style options
 * Use these for type-safe references in application code
 */
export const WRITING_STYLES = {
  CASUAL: 'casual',
  FORMAL: 'formal',
  PROFESSIONAL: 'professional',
} as const;

export const TONES = {
  FRIENDLY: 'friendly',
  NEUTRAL: 'neutral',
  ASSERTIVE: 'assertive',
} as const;

export type WritingStyle = (typeof WRITING_STYLES)[keyof typeof WRITING_STYLES];
export type Tone = (typeof TONES)[keyof typeof TONES];
