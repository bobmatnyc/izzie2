/**
 * Telegram Audit Logging
 *
 * Provides audit trail for security-relevant Telegram operations.
 */

const LOG_PREFIX = '[TelegramAudit]';

export interface AuditEntry {
  timestamp: Date;
  userId: string;
  chatId: string;
  action: 'link' | 'unlink' | 'message' | 'data_access';
  details?: string;
}

/**
 * Log an audit entry for Telegram operations
 *
 * @param entry - Audit entry without timestamp (added automatically)
 */
export async function logAudit(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
  const log = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  console.log(`${LOG_PREFIX} ${JSON.stringify(log)}`);
  // Future: store in database audit table
}
