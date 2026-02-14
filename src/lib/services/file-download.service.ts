/**
 * File Download Service
 *
 * Downloads files from Google Drive with automatic format conversion for Google Workspace files.
 * Validates file sizes against Telegram's 50MB limit for outbound transfers.
 */

import { DriveService } from '@/lib/google/drive';
import type { Auth } from 'googleapis';

const LOG_PREFIX = '[FileDownloadService]';
const TELEGRAM_FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB in bytes

/**
 * Downloaded file data with metadata
 */
export interface DownloadedFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Service for downloading files from Google Drive
 */
export class FileDownloadService {
  private driveService: DriveService;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.driveService = new DriveService(auth);
  }

  /**
   * Download a file from Google Drive with automatic format conversion
   *
   * @param driveFileId - Google Drive file ID
   * @returns Downloaded file as buffer with metadata
   * @throws Error if file exceeds Telegram size limit or download fails
   */
  async downloadFile(driveFileId: string): Promise<DownloadedFile> {
    try {
      console.log(`${LOG_PREFIX} Downloading file ${driveFileId}`);

      // Get file metadata and content using DriveService
      const fileContent = await this.driveService.getFileContent(driveFileId);
      const file = fileContent.file;

      // Convert content to Buffer if it's a string
      let buffer: Buffer;
      if (typeof fileContent.content === 'string') {
        buffer = Buffer.from(fileContent.content, fileContent.encoding as BufferEncoding);
      } else {
        buffer = fileContent.content;
      }

      const fileSize = buffer.length;

      // Validate file size against Telegram's 50MB limit
      if (fileSize > TELEGRAM_FILE_SIZE_LIMIT) {
        const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
        const limitMB = (TELEGRAM_FILE_SIZE_LIMIT / 1024 / 1024).toFixed(0);
        throw new Error(
          `File size ${sizeMB}MB exceeds Telegram limit of ${limitMB}MB. ` +
          `Please use a smaller file or share a Drive link instead.`
        );
      }

      console.log(
        `${LOG_PREFIX} Downloaded ${file.name} (${(fileSize / 1024).toFixed(2)} KB, ${fileContent.mimeType})`
      );

      return {
        buffer,
        fileName: file.name,
        mimeType: fileContent.mimeType,
        fileSize,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to download file ${driveFileId}:`, error);

      // Re-throw with more context
      if (error instanceof Error) {
        throw new Error(`Failed to download file: ${error.message}`);
      }
      throw new Error('Failed to download file from Google Drive');
    }
  }

  /**
   * Check if a file can be downloaded (size validation without actually downloading)
   *
   * @param driveFileId - Google Drive file ID
   * @returns True if file is within size limit, false otherwise
   */
  async canDownload(driveFileId: string): Promise<{ canDownload: boolean; reason?: string }> {
    try {
      const file = await this.driveService.getFile(driveFileId);

      // If size is available in metadata, check it
      if (file.size !== undefined) {
        if (file.size > TELEGRAM_FILE_SIZE_LIMIT) {
          const sizeMB = (file.size / 1024 / 1024).toFixed(2);
          const limitMB = (TELEGRAM_FILE_SIZE_LIMIT / 1024 / 1024).toFixed(0);
          return {
            canDownload: false,
            reason: `File size ${sizeMB}MB exceeds Telegram limit of ${limitMB}MB`,
          };
        }
      }

      return { canDownload: true };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to check file ${driveFileId}:`, error);
      return {
        canDownload: false,
        reason: error instanceof Error ? error.message : 'Failed to check file',
      };
    }
  }
}

/**
 * Factory function to create FileDownloadService with user authentication
 */
export function createFileDownloadService(
  auth: Auth.GoogleAuth | Auth.OAuth2Client
): FileDownloadService {
  return new FileDownloadService(auth);
}
