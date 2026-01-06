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
  index,
  customType,
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
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: text('name'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
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
    userId: uuid('user_id')
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
    userId: uuid('user_id')
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
    userId: uuid('user_id')
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
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    accountId: text('account_id').notNull(), // Provider's user ID
    providerId: text('provider_id').notNull(), // e.g., 'google'
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    expiresAt: timestamp('expires_at'),
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
 */
export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
    userId: uuid('user_id')
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
    userId: uuid('user_id')
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
    userId: uuid('user_id')
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
    userId: uuid('user_id')
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
    userId: uuid('user_id')
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
