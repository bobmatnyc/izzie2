/**
 * Notification Message Templates
 * Formats alerts for different channels (Telegram, etc.)
 */

import { AlertLevel, ClassifiedAlert } from './types';

/**
 * Format a P0 urgent alert for Telegram
 */
export function formatP0Alert(alert: ClassifiedAlert): string {
  const lines: string[] = [];

  lines.push(`🔴 *URGENT*: ${escapeMarkdown(alert.title)}`);
  lines.push('');
  lines.push(escapeMarkdown(alert.body));

  if (alert.signals.length > 0) {
    lines.push('');
    lines.push(`_${alert.signals.join(' • ')}_`);
  }

  return lines.join('\n');
}

/**
 * Format a P1 important alert for Telegram
 */
export function formatP1Alert(alert: ClassifiedAlert): string {
  const lines: string[] = [];

  lines.push(`🟠 *${escapeMarkdown(alert.title)}*`);
  lines.push('');
  lines.push(escapeMarkdown(alert.body));

  if (alert.signals.length > 0) {
    lines.push('');
    lines.push(`_${alert.signals.join(' • ')}_`);
  }

  return lines.join('\n');
}

/**
 * Format a P2 informational alert for Telegram
 */
export function formatP2Alert(alert: ClassifiedAlert): string {
  const lines: string[] = [];

  lines.push(`🟡 ${escapeMarkdown(alert.title)}`);
  lines.push(escapeMarkdown(alert.body));

  return lines.join('\n');
}

/**
 * Format a batch of P2 alerts into a digest for Telegram
 */
export function formatP2Batch(alerts: ClassifiedAlert[]): string {
  if (alerts.length === 0) {
    return '';
  }

  if (alerts.length === 1) {
    return formatP2Alert(alerts[0]);
  }

  const lines: string[] = [];
  lines.push(`🟡 *${alerts.length} updates*`);
  lines.push('');

  // Group by source
  const emailAlerts = alerts.filter((a) => a.source === 'email');
  const calendarAlerts = alerts.filter((a) => a.source === 'calendar');
  const taskAlerts = alerts.filter((a) => a.source === 'task');

  if (emailAlerts.length > 0) {
    lines.push(`📧 *Emails (${emailAlerts.length})*`);
    emailAlerts.slice(0, 5).forEach((alert) => {
      const subject = alert.metadata?.subject || alert.title;
      const from = alert.metadata?.from?.split('@')[0] || 'Unknown';
      lines.push(`• ${escapeMarkdown(from)}: ${escapeMarkdown(String(subject).slice(0, 40))}`);
    });
    if (emailAlerts.length > 5) {
      lines.push(`  _...and ${emailAlerts.length - 5} more_`);
    }
    lines.push('');
  }

  if (calendarAlerts.length > 0) {
    lines.push(`📅 *Calendar (${calendarAlerts.length})*`);
    calendarAlerts.slice(0, 5).forEach((alert) => {
      lines.push(`• ${escapeMarkdown(alert.title)}`);
    });
    if (calendarAlerts.length > 5) {
      lines.push(`  _...and ${calendarAlerts.length - 5} more_`);
    }
    lines.push('');
  }

  if (taskAlerts.length > 0) {
    lines.push(`✅ *Tasks (${taskAlerts.length})*`);
    taskAlerts.slice(0, 5).forEach((alert) => {
      lines.push(`• ${escapeMarkdown(alert.title)}`);
    });
    if (taskAlerts.length > 5) {
      lines.push(`  _...and ${taskAlerts.length - 5} more_`);
    }
  }

  return lines.join('\n');
}

/**
 * Format any alert based on its level
 */
export function formatAlert(alert: ClassifiedAlert): string {
  switch (alert.level) {
    case AlertLevel.P0_URGENT:
      return formatP0Alert(alert);
    case AlertLevel.P1_IMPORTANT:
      return formatP1Alert(alert);
    case AlertLevel.P2_INFO:
      return formatP2Alert(alert);
    case AlertLevel.P3_SILENT:
      // P3 alerts don't get formatted for sending
      return '';
  }
}

/**
 * Format a quiet hours queued notification
 */
export function formatQueuedNotice(queuedCount: number): string {
  return `💤 ${queuedCount} notification${queuedCount > 1 ? 's' : ''} queued during quiet hours. Will deliver at end of quiet hours.`;
}

/**
 * Escape special Markdown characters for Telegram
 */
function escapeMarkdown(text: string): string {
  // Telegram MarkdownV2 special characters
  return text
    .replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
    .replace(/\n/g, '\n'); // Preserve newlines
}

/**
 * Format timestamp for display
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
