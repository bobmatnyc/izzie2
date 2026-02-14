/**
 * OAuth Scope Checking Utilities
 *
 * Detects and warns users when they have insufficient permissions
 * for Google API operations. This is important for users who authenticated
 * before scope upgrades (e.g., having tasks.readonly instead of tasks).
 */

import { getGoogleTokens } from './index';

/**
 * Required scopes for full functionality
 * Maps feature names to the Google OAuth scopes they require
 */
export const REQUIRED_SCOPES = {
  // Tasks: Full read/write access (not readonly)
  tasks: 'https://www.googleapis.com/auth/tasks',
  tasksReadonly: 'https://www.googleapis.com/auth/tasks.readonly',

  // Gmail scopes
  gmailReadonly: 'https://www.googleapis.com/auth/gmail.readonly',
  gmailModify: 'https://www.googleapis.com/auth/gmail.modify',
  gmailSend: 'https://www.googleapis.com/auth/gmail.send',
  gmailSettings: 'https://www.googleapis.com/auth/gmail.settings.basic',

  // Calendar scopes
  calendar: 'https://www.googleapis.com/auth/calendar',
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',

  // Drive scopes
  driveReadonly: 'https://www.googleapis.com/auth/drive.readonly',

  // Contacts scopes
  contacts: 'https://www.googleapis.com/auth/contacts',
  contactsReadonly: 'https://www.googleapis.com/auth/contacts.readonly',

  // Chat scopes
  chatSpacesReadonly: 'https://www.googleapis.com/auth/chat.spaces.readonly',
  chatMessagesReadonly: 'https://www.googleapis.com/auth/chat.messages.readonly',
} as const;

/**
 * Scope check result for a specific feature
 */
export interface ScopeCheckResult {
  /** Whether user has full access (read/write) for tasks */
  hasTasksFullAccess: boolean;
  /** Whether user has tasks.readonly but not full tasks scope */
  hasTasksReadonlyOnly: boolean;
  /** Whether user has Gmail modify access */
  hasGmailModify: boolean;
  /** Whether user has Gmail send access */
  hasGmailSend: boolean;
  /** Whether user has Gmail settings access */
  hasGmailSettings: boolean;
  /** Whether user has Calendar access */
  hasCalendar: boolean;
  /** Whether user has Drive readonly access */
  hasDriveReadonly: boolean;
  /** Whether user has Contacts readonly access */
  hasContactsReadonly: boolean;
  /** Whether user has Contacts write access */
  hasContactsWriteAccess: boolean;
  /** List of missing scopes that would enable additional features */
  missingScopes: string[];
  /** Whether user needs to reconnect to get updated scopes */
  needsReconnect: boolean;
  /** Raw scope string from the account (for debugging) */
  rawScope: string | null;
}

/**
 * Parse scope string into array of individual scopes
 * Better Auth stores scopes as comma-separated string
 */
function parseScopeString(scopeString: string | null): string[] {
  if (!scopeString) return [];
  // Better Auth stores scopes comma-separated (not space-separated)
  return scopeString.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Check if user has a specific scope
 */
function hasScope(scopes: string[], requiredScope: string): boolean {
  return scopes.includes(requiredScope);
}

/**
 * Check user's OAuth scopes for a Google account
 *
 * @param userId - The user ID to check scopes for
 * @param accountId - Optional specific account ID
 * @returns Scope check result with detailed permission information
 */
export async function checkUserScopes(
  userId: string,
  accountId?: string
): Promise<ScopeCheckResult> {
  const tokens = await getGoogleTokens(userId, accountId);

  if (!tokens) {
    // No tokens found - user needs to connect Google account
    return {
      hasTasksFullAccess: false,
      hasTasksReadonlyOnly: false,
      hasGmailModify: false,
      hasGmailSend: false,
      hasGmailSettings: false,
      hasCalendar: false,
      hasDriveReadonly: false,
      hasContactsReadonly: false,
      hasContactsWriteAccess: false,
      missingScopes: Object.values(REQUIRED_SCOPES),
      needsReconnect: true,
      rawScope: null,
    };
  }

  const scopes = parseScopeString(tokens.scope);
  const missingScopes: string[] = [];

  // Check Tasks scopes
  const hasTasksFullAccess = hasScope(scopes, REQUIRED_SCOPES.tasks);
  const hasTasksReadonlyOnly =
    hasScope(scopes, REQUIRED_SCOPES.tasksReadonly) && !hasTasksFullAccess;

  // If user has readonly but not full access, they need to reconnect
  if (hasTasksReadonlyOnly) {
    missingScopes.push(REQUIRED_SCOPES.tasks);
  } else if (!hasTasksFullAccess) {
    missingScopes.push(REQUIRED_SCOPES.tasks);
  }

  // Check Gmail scopes
  const hasGmailModify = hasScope(scopes, REQUIRED_SCOPES.gmailModify);
  const hasGmailSend = hasScope(scopes, REQUIRED_SCOPES.gmailSend);
  const hasGmailSettings = hasScope(scopes, REQUIRED_SCOPES.gmailSettings);

  if (!hasGmailModify) {
    missingScopes.push(REQUIRED_SCOPES.gmailModify);
  }
  if (!hasGmailSend) {
    missingScopes.push(REQUIRED_SCOPES.gmailSend);
  }
  if (!hasGmailSettings) {
    missingScopes.push(REQUIRED_SCOPES.gmailSettings);
  }

  // Check Calendar scopes
  const hasCalendar = hasScope(scopes, REQUIRED_SCOPES.calendar);
  if (!hasCalendar) {
    missingScopes.push(REQUIRED_SCOPES.calendar);
  }

  // Check Drive scopes
  const hasDriveReadonly = hasScope(scopes, REQUIRED_SCOPES.driveReadonly);
  if (!hasDriveReadonly) {
    missingScopes.push(REQUIRED_SCOPES.driveReadonly);
  }

  // Check Contacts scopes
  const hasContactsReadonly = hasScope(scopes, REQUIRED_SCOPES.contactsReadonly);
  const hasContactsWriteAccess = hasScope(scopes, REQUIRED_SCOPES.contacts);
  if (!hasContactsReadonly) {
    missingScopes.push(REQUIRED_SCOPES.contactsReadonly);
  }
  if (!hasContactsWriteAccess) {
    missingScopes.push(REQUIRED_SCOPES.contacts);
  }

  // User needs reconnect if they have old/insufficient scopes
  // Specifically: tasks.readonly without tasks is the most common case
  const needsReconnect = hasTasksReadonlyOnly || missingScopes.length > 0;

  return {
    hasTasksFullAccess,
    hasTasksReadonlyOnly,
    hasGmailModify,
    hasGmailSend,
    hasGmailSettings,
    hasCalendar,
    hasDriveReadonly,
    hasContactsReadonly,
    hasContactsWriteAccess,
    missingScopes,
    needsReconnect,
    rawScope: tokens.scope,
  };
}

/**
 * Error message for insufficient task permissions
 * Used by chat tools to provide helpful guidance
 */
export const INSUFFICIENT_TASKS_SCOPE_ERROR =
  'Your Google account needs reconnection to enable task management. ' +
  'You currently have read-only access to tasks. ' +
  'Please go to Settings > Connections and click "Reconnect" on your Google account ' +
  'to grant the necessary permissions for creating, updating, and completing tasks.';

/**
 * Check if user has write access to Google Tasks
 * Quick helper for chat tools
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @returns true if user has full tasks access, false if readonly or missing
 */
export async function hasTasksWriteAccess(
  userId: string,
  accountId?: string
): Promise<boolean> {
  const result = await checkUserScopes(userId, accountId);
  return result.hasTasksFullAccess;
}

/**
 * Validate tasks write access and throw helpful error if insufficient
 * Use this at the start of any task write operation
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @throws Error with helpful reconnection message if scope is insufficient
 */
export async function requireTasksWriteAccess(
  userId: string,
  accountId?: string
): Promise<void> {
  const result = await checkUserScopes(userId, accountId);

  if (!result.hasTasksFullAccess) {
    throw new Error(INSUFFICIENT_TASKS_SCOPE_ERROR);
  }
}

/**
 * Error message for insufficient Gmail modify permissions
 * Used by chat tools to provide helpful guidance
 */
export const INSUFFICIENT_GMAIL_MODIFY_SCOPE_ERROR =
  'Your Google account needs reconnection to enable email management. ' +
  'You currently have limited email access. ' +
  'Please go to Settings > Connections and click "Reconnect" on your Google account ' +
  'to grant the necessary permissions for archiving, deleting, labeling, and modifying emails.';

/**
 * Error message for insufficient Gmail send permissions
 * Used by chat tools to provide helpful guidance
 */
export const INSUFFICIENT_GMAIL_SEND_SCOPE_ERROR =
  'Your Google account needs reconnection to enable sending emails. ' +
  'You currently do not have permission to send emails. ' +
  'Please go to Settings > Connections and click "Reconnect" on your Google account ' +
  'to grant the necessary permissions for sending emails and creating drafts.';

/**
 * Error message for insufficient Contacts permissions
 * Used by chat tools to provide helpful guidance
 */
export const INSUFFICIENT_CONTACTS_SCOPE_ERROR =
  'Your Google account needs reconnection to enable contacts access. ' +
  'You currently do not have permission to access your contacts. ' +
  'Please go to Settings > Connections and click "Reconnect" on your Google account ' +
  'to grant the necessary permissions for searching and viewing contacts.';

/**
 * Error message for insufficient Contacts write permissions
 * Used by chat tools to provide helpful guidance
 */
export const INSUFFICIENT_CONTACTS_WRITE_SCOPE_ERROR =
  'Your Google account needs reconnection to enable contacts management. ' +
  'You currently do not have permission to create or update contacts. ' +
  'Please go to Settings > Connections and click "Reconnect" on your Google account ' +
  'to grant the necessary permissions for creating and updating contacts.';

/**
 * Check if user has Gmail modify access
 * Quick helper for chat tools
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @returns true if user has gmail.modify access
 */
export async function hasGmailModifyAccess(
  userId: string,
  accountId?: string
): Promise<boolean> {
  const result = await checkUserScopes(userId, accountId);
  return result.hasGmailModify;
}

/**
 * Check if user has Gmail send access
 * Quick helper for chat tools
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @returns true if user has gmail.send access
 */
export async function hasGmailSendAccess(
  userId: string,
  accountId?: string
): Promise<boolean> {
  const result = await checkUserScopes(userId, accountId);
  return result.hasGmailSend;
}

/**
 * Error message for insufficient Gmail settings permissions
 * Used by chat tools to provide helpful guidance
 */
export const INSUFFICIENT_GMAIL_SETTINGS_SCOPE_ERROR =
  'Your Google account needs reconnection to enable Gmail filter management. ' +
  'You currently do not have permission to create, modify, or delete Gmail filters. ' +
  'Please go to Settings > Connections and click "Reconnect" on your Google account ' +
  'to grant the necessary permissions for managing Gmail filters and settings.';

/**
 * Check if user has Gmail settings access
 * Quick helper for chat tools
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @returns true if user has gmail.settings.basic access
 */
export async function hasGmailSettingsAccess(
  userId: string,
  accountId?: string
): Promise<boolean> {
  const result = await checkUserScopes(userId, accountId);
  return result.hasGmailSettings;
}

/**
 * Validate Gmail settings access and throw helpful error if insufficient
 * Use this at the start of any Gmail settings operation (create/modify/delete filters)
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @throws Error with helpful reconnection message if scope is insufficient
 */
export async function requireGmailSettingsAccess(
  userId: string,
  accountId?: string
): Promise<void> {
  const result = await checkUserScopes(userId, accountId);

  if (!result.hasGmailSettings) {
    throw new Error(INSUFFICIENT_GMAIL_SETTINGS_SCOPE_ERROR);
  }
}

/**
 * Check if user has Contacts readonly access
 * Quick helper for chat tools
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @returns true if user has contacts.readonly access
 */
export async function hasContactsAccess(
  userId: string,
  accountId?: string
): Promise<boolean> {
  const result = await checkUserScopes(userId, accountId);
  return result.hasContactsReadonly;
}

/**
 * Validate Gmail modify access and throw helpful error if insufficient
 * Use this at the start of any Gmail modify operation (archive, delete, label, move)
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @throws Error with helpful reconnection message if scope is insufficient
 */
export async function requireGmailModifyAccess(
  userId: string,
  accountId?: string
): Promise<void> {
  const result = await checkUserScopes(userId, accountId);

  if (!result.hasGmailModify) {
    throw new Error(INSUFFICIENT_GMAIL_MODIFY_SCOPE_ERROR);
  }
}

/**
 * Validate Gmail send access and throw helpful error if insufficient
 * Use this at the start of any Gmail send operation (send email, create draft)
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @throws Error with helpful reconnection message if scope is insufficient
 */
export async function requireGmailSendAccess(
  userId: string,
  accountId?: string
): Promise<void> {
  const result = await checkUserScopes(userId, accountId);

  if (!result.hasGmailSend) {
    throw new Error(INSUFFICIENT_GMAIL_SEND_SCOPE_ERROR);
  }
}

/**
 * Validate Contacts readonly access and throw helpful error if insufficient
 * Use this at the start of any Contacts operation
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @throws Error with helpful reconnection message if scope is insufficient
 */
export async function requireContactsAccess(
  userId: string,
  accountId?: string
): Promise<void> {
  const result = await checkUserScopes(userId, accountId);

  if (!result.hasContactsReadonly) {
    throw new Error(INSUFFICIENT_CONTACTS_SCOPE_ERROR);
  }
}

/**
 * Check if user has Contacts write access
 * Quick helper for chat tools
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @returns true if user has contacts write access
 */
export async function hasContactsWriteAccess(
  userId: string,
  accountId?: string
): Promise<boolean> {
  const result = await checkUserScopes(userId, accountId);
  return result.hasContactsWriteAccess;
}

/**
 * Validate Contacts write access and throw helpful error if insufficient
 * Use this at the start of any Contacts create/update operation
 *
 * @param userId - The user ID
 * @param accountId - Optional specific account ID
 * @throws Error with helpful reconnection message if scope is insufficient
 */
export async function requireContactsWriteAccess(
  userId: string,
  accountId?: string
): Promise<void> {
  const result = await checkUserScopes(userId, accountId);

  if (!result.hasContactsWriteAccess) {
    throw new Error(INSUFFICIENT_CONTACTS_WRITE_SCOPE_ERROR);
  }
}
