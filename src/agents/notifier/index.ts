/**
 * Notifier Agent
 * Handles proactive notifications via Telegram and other channels
 */

import { eq } from 'drizzle-orm';
import { dbClient, telegramLinks } from '@/lib/db';
import { getTelegramBot } from '@/lib/telegram/bot';
import type { ResearchOutput } from '@/agents/research/types';

const LOG_PREFIX = '[NotifierAgent]';

/**
 * Notification types supported by the agent
 */
export type NotificationType =
  | 'research_complete'
  | 'research_failed'
  | 'reminder'
  | 'digest'
  | 'alert';

/**
 * Base notification options
 */
export interface NotificationOptions {
  userId: string;
  type: NotificationType;
  title?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Research complete notification options
 */
export interface ResearchCompleteOptions {
  userId: string;
  taskId: string;
  topic: string;
  result: ResearchOutput;
  reportLink?: string;
}

/**
 * Research failed notification options
 */
export interface ResearchFailedOptions {
  userId: string;
  taskId: string;
  topic: string;
  error: string;
}

/**
 * Reminder notification options
 */
export interface ReminderOptions {
  userId: string;
  title: string;
  message: string;
  dueAt?: Date;
}

/**
 * Result from a notification attempt
 */
export interface NotificationResult {
  success: boolean;
  channel?: 'telegram' | 'email';
  messageId?: bigint;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * Notifier Agent
 * Sends proactive notifications to users via Telegram
 */
export class NotifierAgent {
  private bot = getTelegramBot();

  /**
   * Get user's Telegram chat_id from telegram_links table
   * Returns null if user has not linked their Telegram account
   */
  async getUserTelegramChatId(userId: string): Promise<bigint | null> {
    try {
      const db = dbClient.getDb();
      const links = await db
        .select({ telegramChatId: telegramLinks.telegramChatId })
        .from(telegramLinks)
        .where(eq(telegramLinks.userId, userId))
        .limit(1);

      if (links.length === 0) {
        console.warn(`${LOG_PREFIX} No Telegram link found for user ${userId}`);
        return null;
      }

      return links[0].telegramChatId;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error fetching Telegram link for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Send a notification to a user
   * Looks up Telegram chat_id and sends message
   * Silently skips if user has no linked Telegram account
   */
  async notify(options: NotificationOptions): Promise<NotificationResult> {
    const { userId, type, title, message } = options;

    const chatId = await this.getUserTelegramChatId(userId);

    if (!chatId) {
      console.warn(`${LOG_PREFIX} Skipping notification - no Telegram linked for user ${userId}`);
      return {
        success: false,
        skipped: true,
        reason: 'No Telegram account linked',
      };
    }

    try {
      const formattedMessage = this.formatNotification(type, title, message);
      const result = await this.bot.send(chatId.toString(), formattedMessage, 'HTML');

      console.log(`${LOG_PREFIX} Notification sent to user ${userId} (type: ${type})`);

      return {
        success: true,
        channel: 'telegram',
        messageId: result.message_id,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to send notification to user ${userId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send notification when research completes successfully
   * Formats research findings into a readable Telegram message
   */
  async notifyResearchComplete(options: ResearchCompleteOptions): Promise<NotificationResult> {
    const { userId, taskId, topic, result, reportLink } = options;

    const chatId = await this.getUserTelegramChatId(userId);

    if (!chatId) {
      console.warn(`${LOG_PREFIX} Skipping research notification - no Telegram linked for user ${userId}`);
      return {
        success: false,
        skipped: true,
        reason: 'No Telegram account linked',
      };
    }

    try {
      const message = this.formatResearchCompleteMessage(topic, result, reportLink);
      const telegramResult = await this.bot.send(chatId.toString(), message, 'HTML');

      console.log(`${LOG_PREFIX} Research complete notification sent to user ${userId} (task: ${taskId})`);

      return {
        success: true,
        channel: 'telegram',
        messageId: telegramResult.message_id,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to send research notification to user ${userId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send notification when research fails
   */
  async notifyResearchFailed(options: ResearchFailedOptions): Promise<NotificationResult> {
    const { userId, taskId, topic, error } = options;

    const chatId = await this.getUserTelegramChatId(userId);

    if (!chatId) {
      console.warn(`${LOG_PREFIX} Skipping research failed notification - no Telegram linked for user ${userId}`);
      return {
        success: false,
        skipped: true,
        reason: 'No Telegram account linked',
      };
    }

    try {
      const message = this.formatResearchFailedMessage(topic, error);
      const telegramResult = await this.bot.send(chatId.toString(), message, 'HTML');

      console.log(`${LOG_PREFIX} Research failed notification sent to user ${userId} (task: ${taskId})`);

      return {
        success: true,
        channel: 'telegram',
        messageId: telegramResult.message_id,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to send research failed notification to user ${userId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send a reminder notification
   */
  async notifyReminder(options: ReminderOptions): Promise<NotificationResult> {
    const { userId, title, message, dueAt } = options;

    const chatId = await this.getUserTelegramChatId(userId);

    if (!chatId) {
      console.warn(`${LOG_PREFIX} Skipping reminder notification - no Telegram linked for user ${userId}`);
      return {
        success: false,
        skipped: true,
        reason: 'No Telegram account linked',
      };
    }

    try {
      const formattedMessage = this.formatReminderMessage(title, message, dueAt);
      const telegramResult = await this.bot.send(chatId.toString(), formattedMessage, 'HTML');

      console.log(`${LOG_PREFIX} Reminder notification sent to user ${userId}`);

      return {
        success: true,
        channel: 'telegram',
        messageId: telegramResult.message_id,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to send reminder notification to user ${userId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Format a generic notification message
   */
  private formatNotification(type: NotificationType, title?: string, message?: string): string {
    const emoji = this.getNotificationEmoji(type);
    const typeLabel = this.getNotificationTypeLabel(type);

    let formatted = `${emoji} <b>${typeLabel}</b>`;

    if (title) {
      formatted += `\n\n<b>${this.escapeHtml(title)}</b>`;
    }

    if (message) {
      formatted += `\n\n${this.escapeHtml(message)}`;
    }

    return formatted;
  }

  /**
   * Format research complete message
   * Message format:
   * "Research Complete: [topic]
   *
   * Found [X] relevant results across [sources].
   *
   * Key findings:
   * - [Finding 1]
   * - [Finding 2]
   * ...
   *
   * View full report: [link]"
   */
  private formatResearchCompleteMessage(
    topic: string,
    result: ResearchOutput,
    reportLink?: string
  ): string {
    const findingsCount = result.findings.length;
    const sourcesCount = result.sources.length;

    // Start with header
    let message = `<b>Research Complete: ${this.escapeHtml(topic)}</b>\n\n`;

    // Summary stats
    message += `Found <b>${findingsCount}</b> relevant findings across <b>${sourcesCount}</b> sources.\n\n`;

    // Key findings (limit to top 5)
    if (result.findings.length > 0) {
      message += `<b>Key findings:</b>\n`;
      const topFindings = result.findings.slice(0, 5);
      for (const finding of topFindings) {
        // Truncate long claims
        const claim = finding.claim.length > 150
          ? finding.claim.substring(0, 147) + '...'
          : finding.claim;
        message += `- ${this.escapeHtml(claim)}\n`;
      }

      if (result.findings.length > 5) {
        message += `<i>...and ${result.findings.length - 5} more findings</i>\n`;
      }
    }

    // Report link
    if (reportLink) {
      message += `\n<a href="${reportLink}">View full report</a>`;
    }

    // Cost info (optional)
    if (result.totalCost > 0) {
      message += `\n\n<i>Research cost: $${result.totalCost.toFixed(4)}</i>`;
    }

    return message;
  }

  /**
   * Format research failed message
   */
  private formatResearchFailedMessage(topic: string, error: string): string {
    let message = `<b>Research Failed: ${this.escapeHtml(topic)}</b>\n\n`;
    message += `The research task could not be completed.\n\n`;
    message += `<b>Error:</b> ${this.escapeHtml(error)}`;
    return message;
  }

  /**
   * Format reminder message
   */
  private formatReminderMessage(title: string, message: string, dueAt?: Date): string {
    let formatted = `<b>Reminder: ${this.escapeHtml(title)}</b>\n\n`;
    formatted += this.escapeHtml(message);

    if (dueAt) {
      const dueStr = dueAt.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      formatted += `\n\n<i>Due: ${dueStr}</i>`;
    }

    return formatted;
  }

  /**
   * Get emoji for notification type
   */
  private getNotificationEmoji(type: NotificationType): string {
    const emojis: Record<NotificationType, string> = {
      research_complete: '\u{1F50D}', // magnifying glass
      research_failed: '\u{274C}', // cross mark
      reminder: '\u{23F0}', // alarm clock
      digest: '\u{1F4F0}', // newspaper
      alert: '\u{1F6A8}', // rotating light
    };
    return emojis[type] || '\u{1F514}'; // default bell
  }

  /**
   * Get human-readable label for notification type
   */
  private getNotificationTypeLabel(type: NotificationType): string {
    const labels: Record<NotificationType, string> = {
      research_complete: 'Research Complete',
      research_failed: 'Research Failed',
      reminder: 'Reminder',
      digest: 'Daily Digest',
      alert: 'Alert',
    };
    return labels[type] || 'Notification';
  }

  /**
   * Escape HTML characters for Telegram HTML parse mode
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
