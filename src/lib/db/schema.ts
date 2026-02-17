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
  uniqueIndex,
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

    // Per-user encryption fields (POC - user-managed passphrases)
    encryptionKeyHash: text('encryption_key_hash'), // Hash of derived key for verification
    encryptionSalt: text('encryption_salt'), // Unique salt per user for key derivation
    passphraseHint: text('passphrase_hint'), // Optional hint user can set
    encryptionEnabled: boolean('encryption_enabled').default(false).notNull(),
    encryptionFailedAttempts: integer('encryption_failed_attempts').default(0).notNull(),
    encryptionLockedUntil: timestamp('encryption_locked_until'), // Account lock after failed attempts
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
 * Alert Preferences table - real-time alert configuration
 * Stores user preferences for urgent email alerts including VIP senders,
 * quiet hours, notification channels, and per-priority toggles
 */
export const alertPreferences = pgTable(
  'alert_preferences',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),

    // VIP Senders - email addresses that boost priority
    vipSenders: text('vip_senders')
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),

    // Custom urgent keywords (extends defaults)
    customUrgentKeywords: text('custom_urgent_keywords')
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),

    // Quiet Hours configuration
    quietHoursEnabled: boolean('quiet_hours_enabled')
      .default(true)
      .notNull(),
    quietHoursStart: text('quiet_hours_start')
      .default('22:00')
      .notNull(),
    quietHoursEnd: text('quiet_hours_end')
      .default('07:00')
      .notNull(),
    quietHoursTimezone: text('quiet_hours_timezone')
      .default('America/New_York')
      .notNull(),

    // Notification toggles
    telegramEnabled: boolean('telegram_enabled')
      .default(true)
      .notNull(),
    emailEnabled: boolean('email_enabled')
      .default(false)
      .notNull(),

    // Per-priority toggles
    notifyOnP0: boolean('notify_on_p0').default(true).notNull(),
    notifyOnP1: boolean('notify_on_p1').default(true).notNull(),
    notifyOnP2: boolean('notify_on_p2').default(false).notNull(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('alert_preferences_user_id_idx').on(table.userId),
  })
);

/**
 * Type exports for alert preferences
 */
export type AlertPreference = typeof alertPreferences.$inferSelect;
export type NewAlertPreference = typeof alertPreferences.$inferInsert;

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
 * Writing Styles table - learned writing patterns per user/recipient
 * Stores analyzed writing style data from sent emails
 */
export const writingStyles = pgTable(
  'writing_styles',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Pattern identifier: '__overall__' for general style, or email/domain pattern
    recipientPattern: text('recipient_pattern').notNull().default('__overall__'),

    // Formality analysis
    formality: text('formality').notNull().default('mixed'), // 'formal' | 'casual' | 'mixed'

    // Length metrics
    averageSentenceLength: integer('average_sentence_length').notNull().default(15),
    averageEmailLength: integer('average_email_length').notNull().default(100), // words

    // Common phrases (stored as JSON arrays)
    commonGreetings: jsonb('common_greetings').$type<string[]>().default([]),
    commonSignOffs: jsonb('common_sign_offs').$type<string[]>().default([]),

    // Timing patterns
    responseTimeHours: integer('response_time_hours').notNull().default(24),
    activeHours: jsonb('active_hours').$type<{ start: number; end: number }>().default({ start: 9, end: 17 }),

    // Analysis metadata
    emailsAnalyzed: integer('emails_analyzed').notNull().default(0),
    analyzedAt: timestamp('analyzed_at').defaultNow().notNull(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('writing_styles_user_id_idx').on(table.userId),
    recipientPatternIdx: index('writing_styles_recipient_pattern_idx').on(table.recipientPattern),
    userRecipientUnique: index('writing_styles_user_recipient_unique').on(
      table.userId,
      table.recipientPattern
    ),
  })
);

/**
 * Type exports for writing styles
 */
export type WritingStyleRecord = typeof writingStyles.$inferSelect;
export type NewWritingStyle = typeof writingStyles.$inferInsert;

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

/**
 * Account Metadata table - extends Better Auth accounts with multi-account support
 * Stores additional metadata for OAuth accounts without modifying the Better Auth schema
 * Supports multiple Google accounts per user with primary account designation
 */
export const accountMetadata = pgTable(
  'account_metadata',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    accountId: text('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // User-friendly labeling
    label: text('label').default('primary'), // 'personal', 'work', or custom label

    // Primary account designation (only one per user should be true)
    isPrimary: boolean('is_primary').default(false),

    // Cached account email for display (avoids extra API calls)
    accountEmail: text('account_email'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    accountIdIdx: index('account_metadata_account_id_idx').on(table.accountId),
    userIdIdx: index('account_metadata_user_id_idx').on(table.userId),
    // Ensure one metadata record per account
    accountIdUnique: index('account_metadata_account_id_unique').on(table.accountId),
  })
);

/**
 * Type exports for account metadata
 */
export type AccountMetadata = typeof accountMetadata.$inferSelect;
export type NewAccountMetadata = typeof accountMetadata.$inferInsert;

/**
 * Agent Framework tables for long-running background agents
 * Part of the Standardized Long-Running Agent Framework (#92)
 */

/**
 * Agent Runs table - tracks agent execution with progress
 * Provides full lifecycle tracking for background agent tasks
 */
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    agentName: text('agent_name').notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Status tracking
    status: text('status').default('pending').notNull(), // 'pending' | 'running' | 'completed' | 'failed'
    progress: integer('progress').default(0).notNull(),
    itemsProcessed: integer('items_processed').default(0).notNull(),
    itemsTotal: integer('items_total'),

    // Results
    output: jsonb('output').$type<Record<string, unknown>>(),
    errorMessage: text('error_message'),

    // Timestamps
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userStatusIdx: index('agent_runs_user_status_idx').on(table.userId, table.status),
    agentNameIdx: index('agent_runs_agent_name_idx').on(table.agentName),
    createdAtIdx: index('agent_runs_created_at_idx').on(table.createdAt),
  })
);

/**
 * Agent Cursors table - tracks incremental processing state
 * Enables resumable processing with cursor-based position tracking
 */
export const agentCursors = pgTable(
  'agent_cursors',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    agentName: text('agent_name').notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    source: text('source'), // 'email' | 'calendar' | 'tasks' | 'entities' | etc.

    // Cursor position tracking
    lastProcessedId: text('last_processed_id'),
    lastProcessedDate: timestamp('last_processed_date'),
    checkpoint: jsonb('checkpoint').$type<Record<string, unknown>>(),

    // Timestamps
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userAgentSourceUnique: uniqueIndex('agent_cursors_user_agent_source_unique').on(
      table.userId,
      table.agentName,
      table.source
    ),
    agentNameIdx: index('agent_cursors_agent_name_idx').on(table.agentName),
  })
);

/**
 * Type exports for agent framework tables
 */
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;

export type AgentCursor = typeof agentCursors.$inferSelect;
export type NewAgentCursor = typeof agentCursors.$inferInsert;

/**
 * Agent run status constants
 */
export const AGENT_RUN_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUS)[keyof typeof AGENT_RUN_STATUS];

/**
 * API Keys table for MCP server authentication
 * Allows users to create long-lived API keys for connecting Claude Desktop or claude-mpm
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(), // User-friendly name like "Claude Desktop"
    keyHash: text('key_hash').notNull(), // SHA-256 hash of the key (never store raw)
    keyPrefix: text('key_prefix').notNull(), // First 8 chars for identification "izz_abc1..."
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`ARRAY['mcp:read', 'mcp:write']::text[]`),
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at'), // null = never expires
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'), // null = active
  },
  (table) => ({
    userIdIdx: index('api_keys_user_id_idx').on(table.userId),
    keyPrefixIdx: index('api_keys_key_prefix_idx').on(table.keyPrefix),
    keyHashIdx: index('api_keys_key_hash_idx').on(table.keyHash),
  })
);

/**
 * Type exports for API keys
 */
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

/**
 * MCP Tool Embeddings table - vector embeddings for semantic tool discovery
 * Stores tool metadata and embeddings for similarity search
 * Part of Search-Based MCP Tool Discovery (Phase 1)
 */
export const mcpToolEmbeddings = pgTable(
  'mcp_tool_embeddings',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    serverId: text('server_id')
      .references(() => mcpServers.id, { onDelete: 'cascade' })
      .notNull(),

    // Tool identification
    toolName: text('tool_name').notNull(),
    description: text('description'),

    // Rich description for better embeddings
    enrichedDescription: text('enriched_description').notNull(),

    // Vector embedding (1536 dimensions for text-embedding-3-small)
    embedding: vector('embedding'),

    // Cache invalidation - hash of inputSchema to detect changes
    inputSchemaHash: text('input_schema_hash').notNull(),
    embeddingModel: text('embedding_model').notNull().default('text-embedding-3-small'),

    // Status
    enabled: boolean('enabled').notNull().default(true),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('mcp_tool_embeddings_user_id_idx').on(table.userId),
    serverIdIdx: index('mcp_tool_embeddings_server_id_idx').on(table.serverId),
    enabledIdx: index('mcp_tool_embeddings_enabled_idx').on(table.enabled),
    // Unique constraint: one embedding per user/server/tool combination
    userServerToolUnique: uniqueIndex('mcp_tool_embeddings_user_server_tool_unique').on(
      table.userId,
      table.serverId,
      table.toolName
    ),
  })
);

/**
 * Type exports for MCP tool embeddings
 */
export type McpToolEmbedding = typeof mcpToolEmbeddings.$inferSelect;
export type NewMcpToolEmbedding = typeof mcpToolEmbeddings.$inferInsert;

/**
 * Sent Reminders table - tracks calendar reminders already sent
 * Prevents duplicate alerts in serverless environment where in-memory state doesn't persist
 */
export const sentReminders = pgTable(
  'sent_reminders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    eventId: text('event_id').notNull(),
    reminderThreshold: integer('reminder_threshold').notNull(), // 60, 15, etc.
    sentAt: timestamp('sent_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueReminder: uniqueIndex('sent_reminders_unique').on(
      table.userId,
      table.eventId,
      table.reminderThreshold
    ),
    sentAtIdx: index('sent_reminders_sent_at_idx').on(table.sentAt),
  })
);

/**
 * Type exports for sent reminders
 */
export type SentReminder = typeof sentReminders.$inferSelect;
export type NewSentReminder = typeof sentReminders.$inferInsert;

/**
 * Training Sessions table - tracks ML training sessions with human-in-the-loop
 * Stores session configuration, budget, and progress metrics
 */
export const trainingSessions = pgTable(
  'training_sessions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Session status and mode
    status: text('status').notNull().default('collecting'), // 'collecting' | 'training' | 'paused' | 'complete'
    mode: text('mode').notNull().default('collect_feedback'), // 'collect_feedback' | 'auto_train'

    // Legacy budget tracking (in cents) - kept for backward compatibility
    budgetTotal: integer('budget_total').notNull().default(500), // $5 default
    budgetUsed: integer('budget_used').notNull().default(0),

    // Separate budget tracking (in cents)
    // Discovery budget: For processing emails/calendar to find entities
    discoveryBudgetTotal: integer('discovery_budget_total').notNull().default(500),
    discoveryBudgetUsed: integer('discovery_budget_used').notNull().default(0),
    // Training budget: For user feedback/RLHF
    trainingBudgetTotal: integer('training_budget_total').notNull().default(500),
    trainingBudgetUsed: integer('training_budget_used').notNull().default(0),

    // Configuration
    sampleSize: integer('sample_size').notNull().default(100),
    autoTrainThreshold: integer('auto_train_threshold').notNull().default(50),
    sampleTypes: text('sample_types')
      .array()
      .default(sql`ARRAY['entity']::text[]`)
      .notNull(),

    // Progress tracking
    samplesCollected: integer('samples_collected').notNull().default(0),
    feedbackReceived: integer('feedback_received').notNull().default(0),
    exceptionsCount: integer('exceptions_count').notNull().default(0),
    accuracy: real('accuracy').notNull().default(0), // 0-100

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    userIdIdx: index('training_sessions_user_id_idx').on(table.userId),
    statusIdx: index('training_sessions_status_idx').on(table.status),
    createdAtIdx: index('training_sessions_created_at_idx').on(table.createdAt),
  })
);

/**
 * Training Samples table - stores samples for user feedback
 * Each sample contains a prediction that needs human validation
 */
export const trainingSamples = pgTable(
  'training_samples',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    sessionId: text('session_id')
      .references(() => trainingSessions.id, { onDelete: 'cascade' })
      .notNull(),

    // Sample type and content
    type: text('type').notNull().default('entity'), // 'entity' | 'relationship' | 'classification'
    contentText: text('content_text').notNull(),
    contentContext: text('content_context'),
    sourceId: text('source_id'),
    sourceType: text('source_type'), // 'email' | 'calendar' | 'document'

    // Model prediction
    predictionLabel: text('prediction_label').notNull(),
    predictionConfidence: integer('prediction_confidence').notNull(), // 0-100
    predictionReasoning: text('prediction_reasoning'),

    // Identity flag - true if this entity represents the user themselves
    isIdentity: boolean('is_identity').default(false),

    // User feedback
    status: text('status').notNull().default('pending'), // 'pending' | 'reviewed' | 'skipped'
    feedbackIsCorrect: boolean('feedback_is_correct'),
    feedbackCorrectedLabel: text('feedback_corrected_label'),
    feedbackNotes: text('feedback_notes'),
    feedbackAt: timestamp('feedback_at'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    sessionIdIdx: index('training_samples_session_id_idx').on(table.sessionId),
    statusIdx: index('training_samples_status_idx').on(table.status),
    typeIdx: index('training_samples_type_idx').on(table.type),
    confidenceIdx: index('training_samples_confidence_idx').on(table.predictionConfidence),
  })
);

/**
 * Training Exceptions table - items requiring human review
 * Flags low confidence predictions, conflicts, and novel patterns
 */
export const trainingExceptions = pgTable(
  'training_exceptions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    sessionId: text('session_id')
      .references(() => trainingSessions.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Exception details
    type: text('type').notNull(), // 'low_confidence' | 'conflicting_labels' | 'novel_pattern' | 'error'
    severity: text('severity').notNull().default('medium'), // 'low' | 'medium' | 'high'
    reason: text('reason').notNull(),

    // Item reference
    itemSampleId: text('item_sample_id'),
    itemContent: text('item_content').notNull(),
    itemContext: text('item_context'),

    // Status tracking
    status: text('status').notNull().default('pending'), // 'pending' | 'reviewed' | 'dismissed'
    notifiedAt: timestamp('notified_at'),
    reviewedAt: timestamp('reviewed_at'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    sessionIdIdx: index('training_exceptions_session_id_idx').on(table.sessionId),
    userIdIdx: index('training_exceptions_user_id_idx').on(table.userId),
    statusIdx: index('training_exceptions_status_idx').on(table.status),
    severityIdx: index('training_exceptions_severity_idx').on(table.severity),
  })
);

/**
 * Type exports for training tables
 */
export type TrainingSession = typeof trainingSessions.$inferSelect;
export type NewTrainingSession = typeof trainingSessions.$inferInsert;

export type TrainingSample = typeof trainingSamples.$inferSelect;
export type NewTrainingSample = typeof trainingSamples.$inferInsert;

export type TrainingException = typeof trainingExceptions.$inferSelect;
export type NewTrainingException = typeof trainingExceptions.$inferInsert;

/**
 * Chat Messages table - stores all chat messages with embeddings for semantic search
 * Enables Izzie to recall past conversations and search conversation history
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .references(() => chatSessions.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),

    // Vector embedding (1536 dimensions for text-embedding-3-small)
    // Enables semantic search across conversation history
    embedding: vector('embedding'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),

    // Metadata (model used, tokens, etc.)
    metadata: jsonb('metadata').$type<{
      tokensUsed?: number;
      model?: string;
      [key: string]: unknown;
    }>(),
  },
  (table) => ({
    sessionIdIdx: index('chat_messages_session_id_idx').on(table.sessionId),
    userIdIdx: index('chat_messages_user_id_idx').on(table.userId),
    roleIdx: index('chat_messages_role_idx').on(table.role),
    createdAtIdx: index('chat_messages_created_at_idx').on(table.createdAt),
    // Vector index will be created via migration SQL:
    // CREATE INDEX ON chat_messages USING ivfflat (embedding vector_cosine_ops)
  })
);

/**
 * Type exports for chat messages
 */
export type ChatMessageRecord = typeof chatMessages.$inferSelect;
export type NewChatMessageRecord = typeof chatMessages.$inferInsert;

/**
 * Training Progress table - tracks which days have been processed
 * Enables autonomous training to process data day-by-day without repetition
 */
export const trainingProgress = pgTable(
  'training_progress',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sessionId: text('session_id')
      .references(() => trainingSessions.id, { onDelete: 'set null' }),

    // Source tracking
    sourceType: text('source_type').notNull(), // 'email' | 'calendar'
    processedDate: date('processed_date').notNull(), // The date that was processed

    // Results
    itemsFound: integer('items_found').notNull().default(0),

    // Timestamp
    processedAt: timestamp('processed_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('training_progress_user_id_idx').on(table.userId),
    sessionIdIdx: index('training_progress_session_id_idx').on(table.sessionId),
    sourceTypeIdx: index('training_progress_source_type_idx').on(table.sourceType),
    processedDateIdx: index('training_progress_processed_date_idx').on(table.processedDate),
    // Unique constraint: one record per user/source/date combination
    userSourceDateUnique: uniqueIndex('training_progress_user_source_date_unique').on(
      table.userId,
      table.sourceType,
      table.processedDate
    ),
  })
);

/**
 * Type exports for training progress
 */
export type TrainingProgressRecord = typeof trainingProgress.$inferSelect;
export type NewTrainingProgressRecord = typeof trainingProgress.$inferInsert;

/**
 * Source type constants for training progress
 */
export const TRAINING_SOURCE_TYPE = {
  EMAIL: 'email',
  CALENDAR: 'calendar',
} as const;

export type TrainingSourceType = (typeof TRAINING_SOURCE_TYPE)[keyof typeof TRAINING_SOURCE_TYPE];

/**
 * Invite Codes table - gate new user signups
 * Users must enter a valid invite code before creating an account
 */
export const inviteCodes = pgTable(
  'invite_codes',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: varchar('code', { length: 50 }).notNull().unique(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
    usedAt: timestamp('used_at'),
    expiresAt: timestamp('expires_at'),
    maxUses: integer('max_uses').notNull().default(1),
    useCount: integer('use_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    codeIdx: index('invite_codes_code_idx').on(table.code),
    createdByIdx: index('invite_codes_created_by_idx').on(table.createdBy),
  })
);

/**
 * Type exports for invite codes
 */
export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;

/**
 * LLM Usage table - tracks all LLM inference calls with detailed cost tracking
 * Provides granular tracking of token usage and costs by operation type
 */
export const llmUsage = pgTable(
  'llm_usage',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    operationType: text('operation_type').notNull(), // 'chat' | 'extraction' | 'training' | 'research' | 'agent' | 'telegram'
    model: text('model').notNull(), // e.g., 'claude-opus-4.5', 'anthropic/claude-sonnet-4'
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    costUsd: real('cost_usd').notNull(), // Calculated cost in USD
    metadata: jsonb('metadata').$type<Record<string, unknown>>(), // Optional extra data
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('llm_usage_user_id_idx').on(table.userId),
    operationTypeIdx: index('llm_usage_operation_type_idx').on(table.operationType),
    modelIdx: index('llm_usage_model_idx').on(table.model),
    createdAtIdx: index('llm_usage_created_at_idx').on(table.createdAt),
    userCreatedAtIdx: index('llm_usage_user_created_at_idx').on(table.userId, table.createdAt),
  })
);

/**
 * Type exports for LLM usage
 */
export type LlmUsage = typeof llmUsage.$inferSelect;
export type NewLlmUsage = typeof llmUsage.$inferInsert;

/**
 * Operation type constants for LLM usage
 */
export const LLM_OPERATION_TYPE = {
  CHAT: 'chat',
  EXTRACTION: 'extraction',
  TRAINING: 'training',
  RESEARCH: 'research',
  AGENT: 'agent',
  TELEGRAM: 'telegram',
} as const;

export type LlmOperationType = (typeof LLM_OPERATION_TYPE)[keyof typeof LLM_OPERATION_TYPE];

/**
 * User Identity table - represents the user themselves
 * Each user has ONE identity which can have multiple linked entities
 */
export const userIdentity = pgTable(
  'user_identity',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),

    // How the user wants to be called
    displayName: text('display_name'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('user_identity_user_id_idx').on(table.userId),
  })
);

/**
 * Identity Entities table - links entities to the user's identity
 * Stores email addresses, phone numbers, names, companies, titles that belong to the user
 */
export const identityEntities = pgTable(
  'identity_entities',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    identityId: text('identity_id')
      .references(() => userIdentity.id, { onDelete: 'cascade' })
      .notNull(),

    // Entity classification
    entityType: text('entity_type').notNull(), // 'email' | 'phone' | 'name' | 'company' | 'title'
    entityValue: text('entity_value').notNull(), // The actual value

    // Primary marker (e.g., primary email, primary name)
    isPrimary: boolean('is_primary').default(false).notNull(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('identity_entities_user_id_idx').on(table.userId),
    identityIdIdx: index('identity_entities_identity_id_idx').on(table.identityId),
    entityTypeIdx: index('identity_entities_entity_type_idx').on(table.entityType),
    // Unique constraint: one entity value per user/type combination
    userTypeValueUnique: uniqueIndex('identity_entities_user_type_value_unique').on(
      table.userId,
      table.entityType,
      table.entityValue
    ),
  })
);

/**
 * Type exports for user identity
 */
export type UserIdentity = typeof userIdentity.$inferSelect;
export type NewUserIdentity = typeof userIdentity.$inferInsert;

export type IdentityEntity = typeof identityEntities.$inferSelect;
export type NewIdentityEntity = typeof identityEntities.$inferInsert;

/**
 * Identity entity type constants
 */
export const IDENTITY_ENTITY_TYPE = {
  EMAIL: 'email',
  PHONE: 'phone',
  NAME: 'name',
  COMPANY: 'company',
  TITLE: 'title',
} as const;

export type IdentityEntityType = (typeof IDENTITY_ENTITY_TYPE)[keyof typeof IDENTITY_ENTITY_TYPE];

/**
 * Entity Aliases table - stores nicknames/aliases for entities
 * Helps with deduplication by recognizing different names for the same entity
 */
export const entityAliases = pgTable(
  'entity_aliases',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    entityType: text('entity_type').notNull(), // 'person' | 'company' | 'project' | 'tool' | 'topic' | 'location' | 'action_item'
    entityValue: text('entity_value').notNull(), // Normalized entity value (canonical name)
    alias: text('alias').notNull(), // The alias/nickname for this entity
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('entity_aliases_user_id_idx').on(table.userId),
    entityTypeIdx: index('entity_aliases_entity_type_idx').on(table.entityType),
    entityValueIdx: index('entity_aliases_entity_value_idx').on(table.entityValue),
    aliasIdx: index('entity_aliases_alias_idx').on(table.alias),
    userTypeAliasUnique: uniqueIndex('entity_aliases_user_type_alias_unique').on(
      table.userId,
      table.entityType,
      table.alias
    ),
  })
);

/**
 * Type exports for entity aliases
 */
export type EntityAlias = typeof entityAliases.$inferSelect;
export type NewEntityAlias = typeof entityAliases.$inferInsert;

/**
 * Entity type constants for aliases
 */
export const ENTITY_ALIAS_TYPE = {
  PERSON: 'person',
  COMPANY: 'company',
  PROJECT: 'project',
  TOOL: 'tool',
  TOPIC: 'topic',
  LOCATION: 'location',
  ACTION_ITEM: 'action_item',
} as const;

export type EntityAliasType = (typeof ENTITY_ALIAS_TYPE)[keyof typeof ENTITY_ALIAS_TYPE];

/**
 * Merge Suggestions table - human-in-the-loop entity resolution
 * Stores potential entity merges for user review before creating SAME_AS relationships
 */
export const mergeSuggestions = pgTable(
  'merge_suggestions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    entity1Type: text('entity1_type').notNull(),
    entity1Value: text('entity1_value').notNull(),
    entity2Type: text('entity2_type').notNull(),
    entity2Value: text('entity2_value').notNull(),
    confidence: real('confidence').notNull(),
    matchReason: text('match_reason').notNull(),
    status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'rejected' | 'auto_applied'
    reviewedAt: timestamp('reviewed_at'),
    appliedAt: timestamp('applied_at'), // When merge was actually applied
    appliedBy: text('applied_by'), // 'system_auto' | userId
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('merge_suggestions_user_id_idx').on(table.userId),
    statusIdx: index('merge_suggestions_status_idx').on(table.status),
    confidenceIdx: index('merge_suggestions_confidence_idx').on(table.confidence),
    createdAtIdx: index('merge_suggestions_created_at_idx').on(table.createdAt),
  })
);

/**
 * Type exports for merge suggestions
 */
export type MergeSuggestion = typeof mergeSuggestions.$inferSelect;
export type NewMergeSuggestion = typeof mergeSuggestions.$inferInsert;

/**
 * Merge suggestion status constants
 */
export const MERGE_SUGGESTION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  AUTO_APPLIED: 'auto_applied',
} as const;

export type MergeSuggestionStatus = (typeof MERGE_SUGGESTION_STATUS)[keyof typeof MERGE_SUGGESTION_STATUS];

/**
 * File Attachments table - tracks bidirectional file transfers
 * Stores metadata for files transferred between Telegram and Google Drive
 */
export const fileAttachments = pgTable(
  'file_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Transfer direction
    direction: text('direction').notNull(), // 'inbound' | 'outbound'

    // File metadata
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(), // in bytes

    // Google Drive references
    driveFileId: text('drive_file_id'),
    driveFolderId: text('drive_folder_id'), // Parent folder ID in Drive
    driveWebViewLink: text('drive_web_view_link'),

    // Telegram references
    telegramFileId: text('telegram_file_id'),
    telegramChatId: bigint('telegram_chat_id', { mode: 'bigint' }),
    telegramMessageId: integer('telegram_message_id'),

    // Session linking
    chatSessionId: uuid('chat_session_id').references(() => chatSessions.id),

    // Status tracking
    status: text('status').notNull().default('pending'), // 'pending' | 'processing' | 'completed' | 'failed'
    errorMessage: text('error_message'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),

    // Additional metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => ({
    userIdIdx: index('file_attachments_user_id_idx').on(table.userId),
    directionIdx: index('file_attachments_direction_idx').on(table.direction),
    statusIdx: index('file_attachments_status_idx').on(table.status),
    chatSessionIdIdx: index('file_attachments_chat_session_id_idx').on(table.chatSessionId),
    telegramChatIdIdx: index('file_attachments_telegram_chat_id_idx').on(table.telegramChatId),
    telegramFileIdIdx: index('file_attachments_telegram_file_id_idx').on(table.telegramFileId),
    driveFileIdIdx: index('file_attachments_drive_file_id_idx').on(table.driveFileId),
    createdAtIdx: index('file_attachments_created_at_idx').on(table.createdAt),
  })
);

/**
 * Type exports for file attachments
 */
export type FileAttachment = typeof fileAttachments.$inferSelect;
export type NewFileAttachment = typeof fileAttachments.$inferInsert;

/**
 * File attachment status constants
 */
export const FILE_ATTACHMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type FileAttachmentStatus = (typeof FILE_ATTACHMENT_STATUS)[keyof typeof FILE_ATTACHMENT_STATUS];

/**
 * File attachment direction constants
 */
export const FILE_ATTACHMENT_DIRECTION = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
} as const;

export type FileAttachmentDirection = (typeof FILE_ATTACHMENT_DIRECTION)[keyof typeof FILE_ATTACHMENT_DIRECTION];

/**
 * User Settings table
 * Stores per-user API keys (encrypted) and budget configurations
 * Part of BYOK (Bring Your Own Key) feature
 */
export const userSettings = pgTable(
  'user_settings',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Encrypted OpenRouter API key (AES-256-GCM)
    encryptedApiKey: text('encrypted_api_key'),
    apiKeyIv: text('api_key_iv'), // Initialization vector for AES-GCM
    apiKeyTag: text('api_key_tag'), // Authentication tag for AES-GCM
    apiKeySalt: text('api_key_salt'), // Salt for key derivation
    apiKeyLastFour: text('api_key_last_four'), // Last 4 chars for display (e.g., "...sk-1234")

    // Budget settings
    dailyBudgetCents: integer('daily_budget_cents'), // Daily spending limit in cents (null = unlimited)
    budgetResetHour: integer('budget_reset_hour').default(0), // Hour to reset budget (0-23, UTC by default)
    timezone: text('timezone').default('UTC'), // User's timezone for budget reset

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('user_settings_user_id_idx').on(table.userId),
    userIdUnique: uniqueIndex('user_settings_user_id_unique').on(table.userId),
  })
);

/**
 * Type exports for user settings
 */
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
