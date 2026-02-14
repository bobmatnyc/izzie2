/**
 * Telegram File Service
 * Handles file downloads from Telegram Bot API
 */

import { getTelegramBot } from '@/lib/telegram/bot';

export interface TelegramFileInfo {
  fileId: string;
  fileUniqueId: string;
  fileSize: number;
  filePath?: string;
}

export interface TelegramFileMetadata {
  fileId: string;
  fileName: string;
  mimeType?: string;
  fileSize: number;
}

export interface SendDocumentOptions {
  chatId: bigint | string;
  document: Buffer | string; // Buffer or file_id
  fileName?: string;
  caption?: string;
  replyToMessageId?: number;
  messageThreadId?: number;
}

export class TelegramFileService {
  private readonly botToken: string;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
    }
    this.botToken = token;
  }

  /**
   * Get file information from Telegram
   */
  async getFileInfo(fileId: string): Promise<TelegramFileInfo> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Telegram API error: ${error}`);
      }

      const data = await response.json();

      if (!data.ok || !data.result) {
        throw new Error(`Failed to get file info: ${JSON.stringify(data)}`);
      }

      return {
        fileId: data.result.file_id,
        fileUniqueId: data.result.file_unique_id,
        fileSize: data.result.file_size || 0,
        filePath: data.result.file_path,
      };
    } catch (error) {
      console.error('[TelegramFileService] Failed to get file info:', error);
      throw new Error(`Failed to get file info: ${error}`);
    }
  }

  /**
   * Download file from Telegram
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    try {
      // First get file info to get the file_path
      const fileInfo = await this.getFileInfo(fileId);

      if (!fileInfo.filePath) {
        throw new Error('File path not available from Telegram');
      }

      // Download file using file_path
      const downloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${fileInfo.filePath}`;
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('[TelegramFileService] Failed to download file:', error);
      throw new Error(`Failed to download file: ${error}`);
    }
  }

  /**
   * Send document to Telegram chat
   */
  async sendDocument(options: SendDocumentOptions): Promise<void> {
    const bot = getTelegramBot();
    if (!bot) {
      throw new Error('Telegram bot not initialized');
    }

    try {
      const chatId = typeof options.chatId === 'bigint'
        ? options.chatId.toString()
        : options.chatId;

      // If document is a Buffer, we need to use multipart form data
      if (Buffer.isBuffer(options.document)) {
        const formData = new FormData();
        formData.append('chat_id', chatId);

        // Create blob from buffer by copying to a new ArrayBuffer
        const arrayBuffer = options.document.buffer.slice(
          options.document.byteOffset,
          options.document.byteOffset + options.document.byteLength
        ) as ArrayBuffer;
        const blob = new Blob([arrayBuffer]);
        formData.append('document', blob, options.fileName || 'file');

        if (options.caption) {
          formData.append('caption', options.caption);
        }
        if (options.replyToMessageId) {
          formData.append('reply_to_message_id', options.replyToMessageId.toString());
        }
        if (options.messageThreadId) {
          formData.append('message_thread_id', options.messageThreadId.toString());
        }

        const response = await fetch(
          `https://api.telegram.org/bot${this.botToken}/sendDocument`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Failed to send document: ${error}`);
        }
      } else {
        // If document is a file_id string, use simple bot.send
        let message = options.caption || '';
        if (options.fileName) {
          message = `📎 ${options.fileName}${message ? '\n' + message : ''}`;
        }
        await bot.send(chatId, message);
      }
    } catch (error) {
      console.error('[TelegramFileService] Failed to send document:', error);
      throw new Error(`Failed to send document: ${error}`);
    }
  }

  /**
   * Validate file size (Telegram limit is 50MB for bots)
   */
  validateFileSize(fileSize: number): { valid: boolean; error?: string } {
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB in bytes

    if (fileSize > MAX_SIZE) {
      return {
        valid: false,
        error: `File too large (${(fileSize / 1024 / 1024).toFixed(2)}MB). Maximum size is 50MB.`,
      };
    }

    return { valid: true };
  }
}

/**
 * Singleton instance
 */
let telegramFileServiceInstance: TelegramFileService | null = null;

export function getTelegramFileService(): TelegramFileService {
  if (!telegramFileServiceInstance) {
    telegramFileServiceInstance = new TelegramFileService();
  }
  return telegramFileServiceInstance;
}
