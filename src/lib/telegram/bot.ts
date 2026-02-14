/**
 * Telegram Bot Client
 *
 * Singleton client for Telegram Bot API.
 * Provides message sending and webhook management.
 */

import type {
  TelegramApiResponse,
  TelegramMessage,
  SendMessageParams,
  EditMessageTextParams,
  SetWebhookParams,
  WebhookInfo,
} from './types';

const LOG_PREFIX = '[Telegram]';
const API_BASE_URL = 'https://api.telegram.org/bot';

/**
 * Telegram Bot API client
 */
export class TelegramBot {
  private token: string;

  constructor(token: string) {
    if (!token) {
      throw new Error(`${LOG_PREFIX} Bot token is required`);
    }
    this.token = token;
  }

  /**
   * Make API request to Telegram Bot API
   */
  private async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${API_BASE_URL}${this.token}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: params ? JSON.stringify(params) : undefined,
    });

    const data: TelegramApiResponse<T> = await response.json();

    if (!data.ok) {
      const errorMsg = `${LOG_PREFIX} API error: ${data.description || 'Unknown error'} (code: ${data.error_code})`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    return data.result as T;
  }

  /**
   * Send a text message to a chat
   */
  async sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
    return this.request<TelegramMessage>(
      'sendMessage',
      params as unknown as Record<string, unknown>
    );
  }

  /**
   * Send a simple text message (convenience method)
   */
  async send(
    chatId: number | string,
    text: string,
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2',
    messageThreadId?: number
  ): Promise<TelegramMessage> {
    return this.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      message_thread_id: messageThreadId,
    });
  }

  /**
   * Send a chat action (e.g., typing indicator)
   * The action will be automatically cancelled after 5 seconds, or when a message is sent
   */
  async sendChatAction(
    chatId: number | string,
    action: 'typing' | 'upload_photo' | 'record_video' | 'upload_voice' | 'upload_document' | 'choose_sticker' | 'find_location' | 'record_video_note' | 'upload_video_note',
    messageThreadId?: number
  ): Promise<boolean> {
    return this.request<boolean>('sendChatAction', {
      chat_id: chatId,
      action,
      message_thread_id: messageThreadId,
    });
  }

  /**
   * Edit the text of an existing message
   */
  async editMessageText(params: EditMessageTextParams): Promise<TelegramMessage | boolean> {
    return this.request<TelegramMessage | boolean>(
      'editMessageText',
      params as unknown as Record<string, unknown>
    );
  }

  /**
   * Edit an existing message text (convenience method)
   * @param chatId - Chat ID
   * @param messageId - Message ID to edit
   * @param text - New text content
   * @param parseMode - Optional parse mode
   */
  async edit(
    chatId: number | string,
    messageId: number | bigint,
    text: string,
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  ): Promise<TelegramMessage | boolean> {
    return this.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: parseMode,
    });
  }

  /**
   * Set webhook URL for receiving updates
   */
  async setWebhook(params: SetWebhookParams): Promise<boolean> {
    const result = await this.request<boolean>(
      'setWebhook',
      params as unknown as Record<string, unknown>
    );
    console.log(`${LOG_PREFIX} Webhook set to: ${params.url}`);
    return result;
  }

  /**
   * Remove webhook (switch to polling mode)
   */
  async deleteWebhook(dropPendingUpdates = false): Promise<boolean> {
    const result = await this.request<boolean>('deleteWebhook', {
      drop_pending_updates: dropPendingUpdates,
    });
    console.log(`${LOG_PREFIX} Webhook deleted`);
    return result;
  }

  /**
   * Get current webhook configuration
   */
  async getWebhookInfo(): Promise<WebhookInfo> {
    return this.request<WebhookInfo>('getWebhookInfo');
  }

  /**
   * Get basic information about the bot
   */
  async getMe(): Promise<{ id: number; is_bot: boolean; first_name: string; username?: string }> {
    return this.request('getMe');
  }
}

// Singleton instance
let botInstance: TelegramBot | null = null;

/**
 * Get or create Telegram bot singleton instance
 * Uses TELEGRAM_BOT_TOKEN environment variable
 * Returns null if token is not configured (graceful degradation)
 */
export function getTelegramBot(): TelegramBot | null {
  if (botInstance) {
    return botInstance;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.warn(`${LOG_PREFIX} TELEGRAM_BOT_TOKEN not configured - bot features disabled`);
    return null;
  }

  botInstance = new TelegramBot(token);
  console.log(`${LOG_PREFIX} Bot client initialized`);

  return botInstance;
}

/**
 * Reset bot instance (useful for testing)
 */
export function resetTelegramBot(): void {
  botInstance = null;
}
