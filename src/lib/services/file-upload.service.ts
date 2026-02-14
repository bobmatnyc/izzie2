/**
 * File Upload Service
 * Handles file uploads to Google Drive with folder management
 */

import { google, drive_v3 } from 'googleapis';
import { Auth } from 'googleapis';
import { Readable } from 'stream';

export interface UploadOptions {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  parentFolderId?: string;
}

export interface UploadResult {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  webViewLink?: string;
  webContentLink?: string;
  parentFolderId?: string;
}

const IZZIE_FOLDER_NAME = 'izzie';
const ATTACHMENTS_FOLDER_NAME = 'attachments';

export class FileUploadService {
  private drive: drive_v3.Drive;

  constructor(auth: Auth.OAuth2Client) {
    this.drive = google.drive({ version: 'v3', auth });
  }

  /**
   * Upload file to Google Drive in izzie/attachments folder
   */
  async uploadFile(options: UploadOptions): Promise<UploadResult> {
    try {
      // Ensure attachments folder exists
      const attachmentsFolderId = await this.ensureAttachmentsFolder();

      // Create readable stream from buffer
      const bufferStream = new Readable();
      bufferStream.push(options.buffer);
      bufferStream.push(null);

      // Upload file to attachments folder
      const fileMetadata: drive_v3.Schema$File = {
        name: options.fileName,
        parents: [attachmentsFolderId],
      };

      const media = {
        mimeType: options.mimeType,
        body: bufferStream,
      };

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, mimeType, size, webViewLink, webContentLink, parents',
      });

      const file = response.data;

      return {
        fileId: file.id!,
        fileName: file.name!,
        mimeType: file.mimeType!,
        size: parseInt(file.size || '0', 10),
        webViewLink: file.webViewLink || undefined,
        webContentLink: file.webContentLink || undefined,
        parentFolderId: file.parents?.[0],
      };
    } catch (error) {
      console.error('[FileUploadService] Failed to upload file:', error);
      throw new Error(`Failed to upload file: ${error}`);
    }
  }

  /**
   * Ensure izzie/attachments folder structure exists
   * Returns the attachments folder ID
   */
  private async ensureAttachmentsFolder(): Promise<string> {
    try {
      // Find or create "izzie" folder in root
      const izzieFolderId = await this.findOrCreateFolder(IZZIE_FOLDER_NAME);

      // Find or create "attachments" folder inside "izzie"
      const attachmentsFolderId = await this.findOrCreateFolder(
        ATTACHMENTS_FOLDER_NAME,
        izzieFolderId
      );

      return attachmentsFolderId;
    } catch (error) {
      console.error('[FileUploadService] Failed to ensure attachments folder:', error);
      throw new Error(`Failed to ensure attachments folder: ${error}`);
    }
  }

  /**
   * Find or create a folder by name
   */
  private async findOrCreateFolder(
    folderName: string,
    parentFolderId?: string
  ): Promise<string> {
    try {
      // Search for existing folder
      const query = [
        `name='${folderName}'`,
        `mimeType='application/vnd.google-apps.folder'`,
        'trashed=false',
        parentFolderId ? `'${parentFolderId}' in parents` : undefined,
      ]
        .filter(Boolean)
        .join(' and ');

      const searchResponse = await this.drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      // If folder exists, return its ID
      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        return searchResponse.data.files[0].id!;
      }

      // Folder doesn't exist, create it
      const fileMetadata: drive_v3.Schema$File = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : undefined,
      };

      const createResponse = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
      });

      return createResponse.data.id!;
    } catch (error) {
      console.error(`[FileUploadService] Failed to find or create folder ${folderName}:`, error);
      throw new Error(`Failed to find or create folder: ${error}`);
    }
  }

  /**
   * Validate file size for Drive upload (100MB limit)
   */
  validateFileSize(fileSize: number): { valid: boolean; error?: string } {
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB in bytes

    if (fileSize > MAX_SIZE) {
      return {
        valid: false,
        error: `File too large (${(fileSize / 1024 / 1024).toFixed(2)}MB). Maximum size is 100MB.`,
      };
    }

    return { valid: true };
  }

  /**
   * Get folder ID for izzie/attachments (without creating)
   */
  async getAttachmentsFolderId(): Promise<string | null> {
    try {
      // Find "izzie" folder
      const izzieQuery = [
        `name='${IZZIE_FOLDER_NAME}'`,
        `mimeType='application/vnd.google-apps.folder'`,
        'trashed=false',
      ].join(' and ');

      const izzieResponse = await this.drive.files.list({
        q: izzieQuery,
        fields: 'files(id)',
        spaces: 'drive',
      });

      if (!izzieResponse.data.files || izzieResponse.data.files.length === 0) {
        return null;
      }

      const izzieFolderId = izzieResponse.data.files[0].id!;

      // Find "attachments" folder inside "izzie"
      const attachmentsQuery = [
        `name='${ATTACHMENTS_FOLDER_NAME}'`,
        `mimeType='application/vnd.google-apps.folder'`,
        'trashed=false',
        `'${izzieFolderId}' in parents`,
      ].join(' and ');

      const attachmentsResponse = await this.drive.files.list({
        q: attachmentsQuery,
        fields: 'files(id)',
        spaces: 'drive',
      });

      if (!attachmentsResponse.data.files || attachmentsResponse.data.files.length === 0) {
        return null;
      }

      return attachmentsResponse.data.files[0].id!;
    } catch (error) {
      console.error('[FileUploadService] Failed to get attachments folder ID:', error);
      return null;
    }
  }
}

/**
 * Factory function to create service with OAuth2 client
 */
export function createFileUploadService(auth: Auth.OAuth2Client): FileUploadService {
  return new FileUploadService(auth);
}
