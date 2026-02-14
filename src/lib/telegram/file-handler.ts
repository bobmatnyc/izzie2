/**
 * Telegram File Handler
 * Handles incoming file messages from Telegram webhook
 */

import { getFileAttachmentService } from '@/lib/services/file-attachment.service';
import { getGoogleTokens } from '@/lib/auth';
import { getOAuth2Client } from '@/lib/google/auth';
import { getTelegramBot } from './bot';
import type { TelegramDocument, TelegramPhotoSize } from './types';

const LOG_PREFIX = '[TelegramFileHandler]';

/**
 * Process document message (file upload from user)
 */
export async function handleDocumentMessage(
  userId: string,
  chatId: bigint,
  messageId: number,
  document: TelegramDocument
): Promise<void> {
  const bot = getTelegramBot();
  if (!bot) {
    console.error(`${LOG_PREFIX} Bot not initialized`);
    return;
  }

  try {
    console.log(`${LOG_PREFIX} Processing document: ${document.file_name || 'unknown'}`);

    // Get user's Google OAuth tokens
    const tokens = await getGoogleTokens(userId);
    if (!tokens || !tokens.accessToken || !tokens.refreshToken) {
      await bot.send(
        chatId.toString(),
        '⚠️ Unable to upload file: Google Drive not connected. Please link your Google account at izzie.ai/settings.'
      );
      return;
    }

    // Create OAuth2 client with tokens
    const oauth2Client = await getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.accessTokenExpiresAt?.getTime(),
    });

    // Check rate limit
    const fileAttachmentService = getFileAttachmentService();
    const rateLimit = await fileAttachmentService.checkRateLimit(userId);
    if (!rateLimit.allowed) {
      await bot.send(
        chatId.toString(),
        `⚠️ Rate limit exceeded. You can upload up to 10 files per hour. Remaining: ${rateLimit.remaining}. Please try again later.`
      );
      return;
    }

    // Send processing message
    await bot.send(chatId.toString(), '⏳ Uploading file to Google Drive...');

    // Process file transfer
    const result = await fileAttachmentService.receiveFileFromUser({
      userId,
      telegramFileId: document.file_id,
      telegramChatId: chatId,
      telegramMessageId: messageId,
      fileName: document.file_name || 'file',
      mimeType: document.mime_type,
      fileSize: document.file_size || 0,
      driveAuth: oauth2Client,
    });

    // Send success message with Drive link
    if (result.driveWebViewLink) {
      await bot.send(
        chatId.toString(),
        `✅ File uploaded successfully!\n\n📎 ${result.fileName}\n🔗 [View in Drive](${result.driveWebViewLink})`
      );
    } else {
      await bot.send(
        chatId.toString(),
        `✅ File uploaded successfully to Google Drive: ${result.fileName}`
      );
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing document:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // Send user-friendly error message
    if (errorMessage.includes('File type not supported')) {
      await bot.send(chatId.toString(), `❌ ${errorMessage}`);
    } else if (errorMessage.includes('File too large')) {
      await bot.send(chatId.toString(), `❌ ${errorMessage}`);
    } else if (errorMessage.includes('Rate limit')) {
      await bot.send(chatId.toString(), `❌ ${errorMessage}`);
    } else {
      await bot.send(
        chatId.toString(),
        '❌ Failed to upload file. Please try again or contact support if the problem persists.'
      );
    }
  }
}

/**
 * Process photo message
 */
export async function handlePhotoMessage(
  userId: string,
  chatId: bigint,
  messageId: number,
  photos: TelegramPhotoSize[]
): Promise<void> {
  const bot = getTelegramBot();
  if (!bot) {
    console.error(`${LOG_PREFIX} Bot not initialized`);
    return;
  }

  try {
    // Get largest photo size
    const largestPhoto = photos.reduce((prev, current) =>
      current.file_size && prev.file_size && current.file_size > prev.file_size
        ? current
        : prev
    );

    console.log(`${LOG_PREFIX} Processing photo: ${largestPhoto.file_id}`);

    // Get user's Google OAuth tokens
    const tokens = await getGoogleTokens(userId);
    if (!tokens || !tokens.accessToken || !tokens.refreshToken) {
      await bot.send(
        chatId.toString(),
        '⚠️ Unable to upload photo: Google Drive not connected. Please link your Google account at izzie.ai/settings.'
      );
      return;
    }

    // Create OAuth2 client with tokens
    const oauth2Client = await getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.accessTokenExpiresAt?.getTime(),
    });

    // Check rate limit
    const fileAttachmentService = getFileAttachmentService();
    const rateLimit = await fileAttachmentService.checkRateLimit(userId);
    if (!rateLimit.allowed) {
      await bot.send(
        chatId.toString(),
        `⚠️ Rate limit exceeded. You can upload up to 10 files per hour. Remaining: ${rateLimit.remaining}. Please try again later.`
      );
      return;
    }

    // Send processing message
    await bot.send(chatId.toString(), '⏳ Uploading photo to Google Drive...');

    // Generate filename based on timestamp
    const fileName = `telegram_photo_${Date.now()}.jpg`;

    // Process file transfer
    const result = await fileAttachmentService.receiveFileFromUser({
      userId,
      telegramFileId: largestPhoto.file_id,
      telegramChatId: chatId,
      telegramMessageId: messageId,
      fileName,
      mimeType: 'image/jpeg',
      fileSize: largestPhoto.file_size || 0,
      driveAuth: oauth2Client,
    });

    // Send success message with Drive link
    if (result.driveWebViewLink) {
      await bot.send(
        chatId.toString(),
        `✅ Photo uploaded successfully!\n\n📷 ${result.fileName}\n🔗 [View in Drive](${result.driveWebViewLink})`
      );
    } else {
      await bot.send(
        chatId.toString(),
        `✅ Photo uploaded successfully to Google Drive: ${result.fileName}`
      );
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing photo:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // Send user-friendly error message
    if (errorMessage.includes('File too large')) {
      await bot.send(chatId.toString(), `❌ ${errorMessage}`);
    } else if (errorMessage.includes('Rate limit')) {
      await bot.send(chatId.toString(), `❌ ${errorMessage}`);
    } else {
      await bot.send(
        chatId.toString(),
        '❌ Failed to upload photo. Please try again or contact support if the problem persists.'
      );
    }
  }
}
