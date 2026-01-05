/**
 * Proxy Mode Types for POC-4
 * Type definitions for authorization system and proxy actions
 */

/**
 * Operating modes for the AI assistant
 */
export type OperatingMode = 'assistant' | 'proxy';

/**
 * Context/persona for the assistant
 */
export type PersonaContext = 'work' | 'personal';

/**
 * Authorization scope types
 */
export type AuthorizationScope = 'single' | 'session' | 'standing' | 'conditional';

/**
 * Grant method for authorization
 */
export type GrantMethod = 'explicit_consent' | 'implicit_learning' | 'bulk_grant';

/**
 * Proxy action classes
 * These represent categories of actions the AI can perform
 */
export type ProxyActionClass =
  | 'send_email'
  | 'create_calendar_event'
  | 'update_calendar_event'
  | 'delete_calendar_event'
  | 'create_github_issue'
  | 'update_github_issue'
  | 'post_slack_message'
  | 'create_task'
  | 'update_task';

/**
 * Action types (broader categories)
 */
export type ActionType = 'email' | 'calendar' | 'github' | 'slack' | 'task';

/**
 * Conditions for conditional authorizations
 */
export interface AuthorizationConditions {
  /** Maximum actions per day */
  maxActionsPerDay?: number;

  /** Maximum actions per week */
  maxActionsPerWeek?: number;

  /** Allowed hours for actions (24-hour format) */
  allowedHours?: {
    start: number; // 0-23
    end: number; // 0-23
  };

  /** Minimum confidence threshold (0.0-1.0) */
  requireConfidenceThreshold?: number;

  /** Whitelist of allowed email recipients */
  allowedRecipients?: string[];

  /** Whitelist of allowed calendar IDs */
  allowedCalendars?: string[];
}

/**
 * Parameters for granting authorization
 */
export interface GrantAuthorizationParams {
  userId: string;
  actionClass: ProxyActionClass;
  actionType: ActionType;
  scope: AuthorizationScope;
  expiresAt?: Date;
  conditions?: AuthorizationConditions;
  grantMethod: GrantMethod;
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for checking authorization
 */
export interface CheckAuthorizationParams {
  userId: string;
  actionClass: ProxyActionClass;
  confidence?: number; // 0.0-1.0
  metadata?: Record<string, unknown>;
}

/**
 * Result of authorization check
 */
export interface CheckAuthorizationResult {
  authorized: boolean;
  authorizationId?: string;
  scope?: AuthorizationScope;
  reason?: string;
}

/**
 * Parameters for logging proxy actions
 */
export interface LogProxyActionParams {
  userId: string;
  authorizationId?: string;
  action: string;
  actionClass: ProxyActionClass;
  mode: OperatingMode;
  persona: PersonaContext;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  modelUsed?: string;
  confidence?: number; // 0.0-1.0
  tokensUsed?: number;
  latencyMs?: number;
  success: boolean;
  error?: string;
  userConfirmed?: boolean;
}

/**
 * Proxy action request
 */
export interface ProxyActionRequest {
  mode: OperatingMode;
  action: ProxyActionClass;
  authorization: 'per-action' | 'class-authorized' | 'standing';
  confidence: number; // 0.0-1.0
  metadata?: Record<string, unknown>;
}

/**
 * Audit log query options
 */
export interface AuditLogQueryOptions {
  limit?: number;
  offset?: number;
  actionClass?: ProxyActionClass;
  mode?: OperatingMode;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Tool access matrix
 */
export const TOOL_ACCESS_MATRIX: Record<OperatingMode, Record<PersonaContext, string[]>> = {
  assistant: {
    work: ['gmail_read', 'calendar_query', 'issues_list', 'pr_list'],
    personal: ['calendar_query', 'gmail_read'],
  },
  proxy: {
    work: ['gmail_send', 'calendar_create', 'issue_create', 'message_send'],
    personal: ['gmail_send', 'calendar_create'],
  },
};

/**
 * Confidence thresholds for different actions
 */
export const CONFIDENCE_THRESHOLDS = {
  PROXY_MODE_MINIMUM: 0.9, // Minimum confidence for any proxy action
  EMAIL_SEND: 0.95, // Higher threshold for sending emails
  CALENDAR_CREATE: 0.9, // Standard for calendar operations
  ISSUE_CREATE: 0.9, // Standard for issue creation
  MESSAGE_POST: 0.95, // Higher threshold for messaging
} as const;

/**
 * Actions that require user confirmation
 */
export const REQUIRES_CONFIRMATION: ProxyActionClass[] = [
  'send_email',
  'post_slack_message',
  'delete_calendar_event',
];
