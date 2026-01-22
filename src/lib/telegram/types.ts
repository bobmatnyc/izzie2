/**
 * Telegram Bot API Types
 *
 * Type definitions for Telegram Bot API webhook updates and messages.
 * Based on Telegram Bot API: https://core.telegram.org/bots/api
 */

/**
 * Telegram user object
 *
 * Note: id is bigint to handle large Telegram user IDs that exceed MAX_SAFE_INTEGER
 */
export interface TelegramUser {
  id: bigint;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/**
 * Telegram chat types
 */
export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel';

/**
 * Telegram chat object
 *
 * Note: id is bigint to handle large Telegram chat IDs that exceed MAX_SAFE_INTEGER
 */
export interface TelegramChat {
  id: bigint;
  type: TelegramChatType;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

/**
 * Telegram message entity (formatting, mentions, etc.)
 */
export interface TelegramMessageEntity {
  type:
    | 'mention'
    | 'hashtag'
    | 'cashtag'
    | 'bot_command'
    | 'url'
    | 'email'
    | 'phone_number'
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strikethrough'
    | 'spoiler'
    | 'code'
    | 'pre'
    | 'text_link'
    | 'text_mention';
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
  language?: string;
}

/**
 * Telegram message object
 *
 * Note: message_id is bigint to handle large Telegram message IDs that exceed MAX_SAFE_INTEGER
 */
export interface TelegramMessage {
  message_id: bigint;
  message_thread_id?: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  date: number;
  chat: TelegramChat;
  forward_from?: TelegramUser;
  forward_from_chat?: TelegramChat;
  forward_date?: number;
  reply_to_message?: TelegramMessage;
  text?: string;
  entities?: TelegramMessageEntity[];
  caption?: string;
  caption_entities?: TelegramMessageEntity[];
}

/**
 * Telegram callback query (from inline keyboards)
 */
export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  inline_message_id?: string;
  chat_instance: string;
  data?: string;
}

/**
 * Telegram webhook update object
 *
 * Note: update_id is bigint to handle large Telegram update IDs that exceed MAX_SAFE_INTEGER
 */
export interface TelegramUpdate {
  update_id: bigint;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/**
 * Telegram API response wrapper
 */
export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Send message request parameters
 */
export interface SendMessageParams {
  chat_id: number | string;
  message_thread_id?: number;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  entities?: TelegramMessageEntity[];
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
  reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove;
}

/**
 * Inline keyboard button
 */
export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

/**
 * Inline keyboard markup
 */
export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

/**
 * Reply keyboard button
 */
export interface KeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
}

/**
 * Reply keyboard markup
 */
export interface ReplyKeyboardMarkup {
  keyboard: KeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  selective?: boolean;
}

/**
 * Remove reply keyboard
 */
export interface ReplyKeyboardRemove {
  remove_keyboard: true;
  selective?: boolean;
}

/**
 * Set webhook request parameters
 */
export interface SetWebhookParams {
  url: string;
  certificate?: string;
  ip_address?: string;
  max_connections?: number;
  allowed_updates?: string[];
  drop_pending_updates?: boolean;
  secret_token?: string;
}

/**
 * Webhook info response
 */
export interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
  allowed_updates?: string[];
}
