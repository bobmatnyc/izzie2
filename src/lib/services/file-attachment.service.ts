/**
 * File Attachment Service
 * Orchestrates file transfers between Telegram and Google Drive
 */

import { dbClient } from '@/lib/db';
import { fileAttachments, FILE_ATTACHMENT_STATUS, FILE_ATTACHMENT_DIRECTION } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getTelegramFileService, type TelegramFileMetadata } from './telegram-file.service';
import { createFileUploadService } from './file-upload.service';
import { createFileDownloadService } from './file-download.service';
import { Auth } from 'googleapis';
import type { FileAttachment } from '@/lib/db/schema';

// File type validation
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Archives
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/gzip',
  'application/x-tar',
];

const BLOCKED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.app',
  '.deb',
  '.rpm',
  '.dmg',
  '.pkg',
  '.msi',
  '.scr',
  '.com',
  '.pif',
  '.vbs',
  '.js',
  '.jar',
];

export interface ReceiveFileOptions {
  userId: string;
  telegramFileId: string;
  telegramChatId: bigint;
  telegramMessageId?: number;
  fileName: string;
  mimeType?: string;
  fileSize: number;
  driveAuth: Auth.OAuth2Client;
}

export interface SendFileOptions {
  userId: string;
  driveFileId: string;
  telegramChatId: bigint;
  caption?: string;
  replyToMessageId?: number;
  messageThreadId?: number;
  driveAuth: Auth.OAuth2Client;
}

export class FileAttachmentService {
  /**
   * Receive file from user (Telegram -> Drive)
   */
  async receiveFileFromUser(options: ReceiveFileOptions): Promise<FileAttachment> {
    const db = dbClient.getDb();
    const telegramFileService = getTelegramFileService();
    const fileUploadService = createFileUploadService(options.driveAuth);

    // Validate file type
    const fileTypeValidation = this.validateFileType(options.fileName, options.mimeType);
    if (!fileTypeValidation.valid) {
      throw new Error(fileTypeValidation.error);
    }

    // Validate file size for Drive (100MB limit)
    const fileSizeValidation = fileUploadService.validateFileSize(options.fileSize);
    if (!fileSizeValidation.valid) {
      throw new Error(fileSizeValidation.error);
    }

    // Create pending record
    const [record] = await db
      .insert(fileAttachments)
      .values({
        userId: options.userId,
        direction: FILE_ATTACHMENT_DIRECTION.INBOUND,
        fileName: options.fileName,
        mimeType: options.mimeType || 'application/octet-stream',
        fileSize: options.fileSize,
        telegramFileId: options.telegramFileId,
        telegramChatId: options.telegramChatId,
        telegramMessageId: options.telegramMessageId,
        status: FILE_ATTACHMENT_STATUS.PENDING,
      })
      .returning();

    try {
      // Update status to processing
      await db
        .update(fileAttachments)
        .set({ status: FILE_ATTACHMENT_STATUS.PROCESSING })
        .where(eq(fileAttachments.id, record.id));

      // Download file from Telegram
      console.log(`[FileAttachment] Downloading file ${options.telegramFileId} from Telegram`);
      const fileBuffer = await telegramFileService.downloadFile(options.telegramFileId);

      // Upload to Google Drive
      console.log(`[FileAttachment] Uploading file ${options.fileName} to Drive`);
      const uploadResult = await fileUploadService.uploadFile({
        fileName: options.fileName,
        mimeType: options.mimeType || 'application/octet-stream',
        buffer: fileBuffer,
      });

      // Update record with Drive info and mark as completed
      const [completedRecord] = await db
        .update(fileAttachments)
        .set({
          status: FILE_ATTACHMENT_STATUS.COMPLETED,
          driveFileId: uploadResult.fileId,
          driveFolderId: uploadResult.parentFolderId,
          driveWebViewLink: uploadResult.webViewLink,
          completedAt: new Date(),
        })
        .where(eq(fileAttachments.id, record.id))
        .returning();

      console.log(
        `[FileAttachment] Successfully transferred file ${options.fileName} to Drive (${uploadResult.fileId})`
      );

      return completedRecord;
    } catch (error) {
      // Update record with error
      const errorMessage = error instanceof Error ? error.message : String(error);
      await db
        .update(fileAttachments)
        .set({
          status: FILE_ATTACHMENT_STATUS.FAILED,
          errorMessage,
        })
        .where(eq(fileAttachments.id, record.id));

      console.error('[FileAttachment] Failed to transfer file:', error);
      throw error;
    }
  }

  /**
   * Send file to user (Drive -> Telegram)
   * Downloads file from Google Drive and sends to Telegram chat
   */
  async sendFileToUser(options: SendFileOptions): Promise<FileAttachment> {
    const db = dbClient.getDb();
    const telegramFileService = getTelegramFileService();
    const fileDownloadService = createFileDownloadService(options.driveAuth);

    // Check rate limit
    const rateLimit = await this.checkRateLimit(options.userId);
    if (!rateLimit.allowed) {
      throw new Error(
        'Rate limit exceeded. You can transfer up to 10 files per hour. Please try again later.'
      );
    }

    // Create pending record
    const [record] = await db
      .insert(fileAttachments)
      .values({
        userId: options.userId,
        direction: FILE_ATTACHMENT_DIRECTION.OUTBOUND,
        fileName: '', // Will be filled after download
        mimeType: '', // Will be filled after download
        fileSize: 0, // Will be filled after download
        driveFileId: options.driveFileId,
        telegramChatId: options.telegramChatId,
        status: FILE_ATTACHMENT_STATUS.PENDING,
      })
      .returning();

    try {
      // Update status to processing
      await db
        .update(fileAttachments)
        .set({ status: FILE_ATTACHMENT_STATUS.PROCESSING })
        .where(eq(fileAttachments.id, record.id));

      // Download file from Google Drive
      console.log(`[FileAttachment] Downloading file ${options.driveFileId} from Drive`);
      const downloadedFile = await fileDownloadService.downloadFile(options.driveFileId);

      // Validate file type
      const fileTypeValidation = this.validateFileType(
        downloadedFile.fileName,
        downloadedFile.mimeType
      );
      if (!fileTypeValidation.valid) {
        throw new Error(fileTypeValidation.error);
      }

      // Validate file size for Telegram
      const fileSizeValidation = telegramFileService.validateFileSize(downloadedFile.fileSize);
      if (!fileSizeValidation.valid) {
        throw new Error(fileSizeValidation.error);
      }

      // Update record with file metadata
      await db
        .update(fileAttachments)
        .set({
          fileName: downloadedFile.fileName,
          mimeType: downloadedFile.mimeType,
          fileSize: downloadedFile.fileSize,
        })
        .where(eq(fileAttachments.id, record.id));

      // Send upload action to Telegram (shows "uploading document..." indicator)
      await telegramFileService.sendDocument({
        chatId: options.telegramChatId,
        document: downloadedFile.buffer,
        fileName: downloadedFile.fileName,
        caption: options.caption,
        replyToMessageId: options.replyToMessageId,
        messageThreadId: options.messageThreadId,
      });

      // Update record as completed
      const [completedRecord] = await db
        .update(fileAttachments)
        .set({
          status: FILE_ATTACHMENT_STATUS.COMPLETED,
          completedAt: new Date(),
        })
        .where(eq(fileAttachments.id, record.id))
        .returning();

      console.log(
        `[FileAttachment] Successfully sent file ${downloadedFile.fileName} to Telegram chat ${options.telegramChatId}`
      );

      return completedRecord;
    } catch (error) {
      // Update record with error
      const errorMessage = error instanceof Error ? error.message : String(error);
      await db
        .update(fileAttachments)
        .set({
          status: FILE_ATTACHMENT_STATUS.FAILED,
          errorMessage,
        })
        .where(eq(fileAttachments.id, record.id));

      console.error('[FileAttachment] Failed to send file:', error);
      throw error;
    }
  }

  /**
   * Validate file type and extension
   */
  private validateFileType(
    fileName: string,
    mimeType?: string
  ): { valid: boolean; error?: string } {
    // Check blocked extensions
    const lowerFileName = fileName.toLowerCase();
    for (const ext of BLOCKED_EXTENSIONS) {
      if (lowerFileName.endsWith(ext)) {
        return {
          valid: false,
          error: `File type not supported: ${ext} files are blocked for security reasons.`,
        };
      }
    }

    // Check MIME type if provided
    if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType)) {
      return {
        valid: false,
        error: `File type not supported: ${mimeType}. Supported types: documents, images, archives.`,
      };
    }

    return { valid: true };
  }

  /**
   * Get file attachment by ID
   */
  async getFileAttachment(id: string): Promise<FileAttachment | null> {
    const db = dbClient.getDb();
    const [record] = await db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.id, id))
      .limit(1);

    return record || null;
  }

  /**
   * Get file attachments for user
   */
  async getUserFileAttachments(
    userId: string,
    direction?: 'inbound' | 'outbound',
    limit: number = 50
  ): Promise<FileAttachment[]> {
    const db = dbClient.getDb();

    const baseQuery = db.select().from(fileAttachments);

    const whereConditions = direction
      ? and(eq(fileAttachments.userId, userId), eq(fileAttachments.direction, direction))
      : eq(fileAttachments.userId, userId);

    const records = await baseQuery
      .where(whereConditions)
      .orderBy(fileAttachments.createdAt)
      .limit(limit);

    return records;
  }

  /**
   * Get rate limit info for user (10 transfers per hour)
   */
  async checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
    const db = dbClient.getDb();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const records = await db
      .select()
      .from(fileAttachments)
      .where(
        and(
          eq(fileAttachments.userId, userId),
          eq(fileAttachments.status, FILE_ATTACHMENT_STATUS.COMPLETED)
        )
      );

    const recentTransfers = records.filter(
      (r) => r.completedAt && r.completedAt >= oneHourAgo
    );

    const limit = 10;
    const remaining = Math.max(0, limit - recentTransfers.length);

    return {
      allowed: recentTransfers.length < limit,
      remaining,
    };
  }
}

/**
 * Singleton instance
 */
let fileAttachmentServiceInstance: FileAttachmentService | null = null;

export function getFileAttachmentService(): FileAttachmentService {
  if (!fileAttachmentServiceInstance) {
    fileAttachmentServiceInstance = new FileAttachmentService();
  }
  return fileAttachmentServiceInstance;
}
