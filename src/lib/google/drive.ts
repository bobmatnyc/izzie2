/**
 * Google Drive Service
 * Handles file listing, search, content extraction, and incremental sync
 */

import { google, drive_v3, Auth } from 'googleapis';
import { getServiceAccountAuth } from './auth';
import type {
  DriveFile,
  DriveUser,
  DrivePermission,
  DriveListOptions,
  DriveSearchOptions,
  DriveFileBatch,
  DriveFileContent,
  DriveChangeToken,
  DriveChange,
} from './types';

const MAX_RESULTS_DEFAULT = 100;
const MAX_RESULTS_LIMIT = 1000;
const RATE_LIMIT_DELAY_MS = 100; // Delay between requests to respect rate limits

// MIME type mappings for Google Workspace files
const GOOGLE_MIME_TYPES = {
  DOCUMENT: 'application/vnd.google-apps.document',
  SPREADSHEET: 'application/vnd.google-apps.spreadsheet',
  PRESENTATION: 'application/vnd.google-apps.presentation',
  FOLDER: 'application/vnd.google-apps.folder',
  FORM: 'application/vnd.google-apps.form',
  DRAWING: 'application/vnd.google-apps.drawing',
} as const;

// Export formats for Google Workspace files
const EXPORT_MIME_TYPES = {
  [GOOGLE_MIME_TYPES.DOCUMENT]: 'text/plain',
  [GOOGLE_MIME_TYPES.SPREADSHEET]: 'text/csv',
  [GOOGLE_MIME_TYPES.PRESENTATION]: 'text/plain',
} as const;

export class DriveService {
  private drive: drive_v3.Drive;
  private auth: Auth.GoogleAuth | Auth.OAuth2Client;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.auth = auth;
    this.drive = google.drive({ version: 'v3', auth: auth as Auth.OAuth2Client });
  }

  /**
   * List files with pagination and filtering
   */
  async listFiles(options: DriveListOptions = {}): Promise<DriveFileBatch> {
    const {
      query,
      maxResults = MAX_RESULTS_DEFAULT,
      pageToken,
      orderBy = 'modifiedTime desc',
      spaces = 'drive',
      fields,
      includeItemsFromAllDrives = false,
      supportsAllDrives = false,
    } = options;

    try {
      // Build fields string for optimal response
      const fieldsParam =
        fields ||
        'nextPageToken, incompleteSearch, files(id, name, mimeType, size, createdTime, modifiedTime, owners, parents, webViewLink, webContentLink, thumbnailLink, iconLink, description, starred, trashed, shared, capabilities, permissions)';

      const response = await this.drive.files.list({
        pageSize: Math.min(maxResults, MAX_RESULTS_LIMIT),
        pageToken,
        q: query,
        orderBy,
        spaces,
        fields: fieldsParam,
        includeItemsFromAllDrives,
        supportsAllDrives,
      });

      const files = (response.data.files || []).map((file) => this.parseFile(file));

      return {
        files,
        nextPageToken: response.data.nextPageToken || undefined,
        incompleteSearch: response.data.incompleteSearch || false,
      };
    } catch (error) {
      console.error('[Drive] Failed to list files:', error);
      throw new Error(`Failed to list files: ${error}`);
    }
  }

  /**
   * Search for files by name or content
   */
  async searchFiles(options: DriveSearchOptions): Promise<DriveFileBatch> {
    const { query, maxResults = MAX_RESULTS_DEFAULT, orderBy, includeSharedDrives = false } = options;

    // Build search query
    const searchQuery = `fullText contains '${query}' or name contains '${query}'`;

    return this.listFiles({
      query: searchQuery,
      maxResults,
      orderBy,
      includeItemsFromAllDrives: includeSharedDrives,
      supportsAllDrives: includeSharedDrives,
    });
  }

  /**
   * Get a single file's metadata by ID
   */
  async getFile(fileId: string): Promise<DriveFile> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields:
          'id, name, mimeType, size, createdTime, modifiedTime, owners, parents, webViewLink, webContentLink, thumbnailLink, iconLink, description, starred, trashed, shared, capabilities, permissions',
        supportsAllDrives: true,
      });

      return this.parseFile(response.data);
    } catch (error) {
      console.error(`[Drive] Failed to get file ${fileId}:`, error);
      throw new Error(`Failed to get file ${fileId}: ${error}`);
    }
  }

  /**
   * Get file content with automatic format handling
   */
  async getFileContent(fileId: string): Promise<DriveFileContent> {
    try {
      // First, get file metadata to determine MIME type
      const file = await this.getFile(fileId);

      let content: Buffer | string;
      let mimeType: string;
      let encoding: string | undefined;

      // Check if it's a Google Workspace file that needs export
      if (this.isGoogleWorkspaceFile(file.mimeType)) {
        const exportMimeType = this.getExportMimeType(file.mimeType);
        const response = await this.drive.files.export(
          {
            fileId,
            mimeType: exportMimeType,
          },
          { responseType: 'text' }
        );

        content = response.data as string;
        mimeType = exportMimeType;
        encoding = 'utf-8';
      } else {
        // Regular file download
        const response = await this.drive.files.get(
          {
            fileId,
            alt: 'media',
            supportsAllDrives: true,
          },
          { responseType: 'arraybuffer' }
        );

        content = Buffer.from(response.data as ArrayBuffer);
        mimeType = file.mimeType;

        // Convert to string if it's a text-based file
        if (this.isTextMimeType(mimeType)) {
          content = content.toString('utf-8');
          encoding = 'utf-8';
        }
      }

      return {
        file,
        content,
        mimeType,
        encoding,
      };
    } catch (error) {
      console.error(`[Drive] Failed to get file content ${fileId}:`, error);
      throw new Error(`Failed to get file content ${fileId}: ${error}`);
    }
  }

  /**
   * Get start page token for change tracking
   */
  async getStartPageToken(): Promise<DriveChangeToken> {
    try {
      const response = await this.drive.changes.getStartPageToken({
        supportsAllDrives: true,
      });

      return {
        token: response.data.startPageToken || '',
      };
    } catch (error) {
      console.error('[Drive] Failed to get start page token:', error);
      throw new Error(`Failed to get start page token: ${error}`);
    }
  }

  /**
   * List changes since a given page token (for incremental sync)
   */
  async listChanges(pageToken: string): Promise<{
    changes: DriveChange[];
    newStartPageToken?: string;
    nextPageToken?: string;
  }> {
    try {
      const response = await this.drive.changes.list({
        pageToken,
        pageSize: MAX_RESULTS_DEFAULT,
        fields: 'newStartPageToken, nextPageToken, changes(changeType, time, removed, fileId, file)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const changes = (response.data.changes || []).map((change) => this.parseChange(change));

      return {
        changes,
        newStartPageToken: response.data.newStartPageToken || undefined,
        nextPageToken: response.data.nextPageToken || undefined,
      };
    } catch (error) {
      console.error('[Drive] Failed to list changes:', error);
      throw new Error(`Failed to list changes: ${error}`);
    }
  }

  /**
   * Batch fetch multiple files
   */
  async batchFetch(fileIds: string[]): Promise<DriveFile[]> {
    const files: DriveFile[] = [];

    for (const fileId of fileIds) {
      try {
        const file = await this.getFile(fileId);
        files.push(file);
        await this.sleep(RATE_LIMIT_DELAY_MS);
      } catch (error) {
        console.error(`[Drive] Failed to fetch file ${fileId} in batch:`, error);
        // Continue with other files
      }
    }

    return files;
  }

  /**
   * Parse Drive API file into DriveFile type
   */
  private parseFile(file: drive_v3.Schema$File): DriveFile {
    const owners: DriveUser[] = (file.owners || []).map((owner) => ({
      displayName: owner.displayName || '',
      emailAddress: owner.emailAddress || '',
      photoLink: owner.photoLink || undefined,
      permissionId: owner.permissionId || undefined,
    }));

    const permissions: DrivePermission[] | undefined = file.permissions?.map((perm) => ({
      id: perm.id || '',
      type: (perm.type as DrivePermission['type']) || 'user',
      role: (perm.role as DrivePermission['role']) || 'reader',
      emailAddress: perm.emailAddress || undefined,
      displayName: perm.displayName || undefined,
      deleted: perm.deleted || false,
    }));

    return {
      id: file.id || '',
      name: file.name || '',
      mimeType: file.mimeType || '',
      size: file.size ? parseInt(file.size, 10) : undefined,
      createdTime: new Date(file.createdTime || Date.now()),
      modifiedTime: new Date(file.modifiedTime || Date.now()),
      owners,
      permissions,
      parents: file.parents || undefined,
      webViewLink: file.webViewLink || undefined,
      webContentLink: file.webContentLink || undefined,
      thumbnailLink: file.thumbnailLink || undefined,
      iconLink: file.iconLink || undefined,
      description: file.description || undefined,
      starred: file.starred || false,
      trashed: file.trashed || false,
      shared: file.shared || false,
      capabilities: {
        canEdit: file.capabilities?.canEdit,
        canComment: file.capabilities?.canComment,
        canShare: file.capabilities?.canShare,
        canCopy: file.capabilities?.canCopy,
        canDownload: file.capabilities?.canDownload,
      },
    };
  }

  /**
   * Parse Drive API change into DriveChange type
   */
  private parseChange(change: drive_v3.Schema$Change): DriveChange {
    return {
      changeType: (change.changeType as 'file' | 'drive') || 'file',
      time: new Date(change.time || Date.now()),
      removed: change.removed || false,
      file: change.file ? this.parseFile(change.file) : undefined,
      fileId: change.fileId || '',
      // Note: changeId is not in the Schema$Change type, but could be added if needed
    };
  }

  /**
   * Check if MIME type is a Google Workspace file
   */
  private isGoogleWorkspaceFile(mimeType: string): boolean {
    return Object.values(GOOGLE_MIME_TYPES).includes(
      mimeType as (typeof GOOGLE_MIME_TYPES)[keyof typeof GOOGLE_MIME_TYPES]
    );
  }

  /**
   * Get export MIME type for Google Workspace files
   */
  private getExportMimeType(mimeType: string): string {
    const exportType =
      EXPORT_MIME_TYPES[mimeType as keyof typeof EXPORT_MIME_TYPES] || 'text/plain';
    return exportType;
  }

  /**
   * Check if MIME type is text-based
   */
  private isTextMimeType(mimeType: string): boolean {
    return (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'application/javascript'
    );
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function with user impersonation support
 */
export async function getServiceAccountDrive(userEmail: string): Promise<DriveService> {
  const auth = await getServiceAccountAuth(userEmail);
  return new DriveService(auth);
}

/**
 * Singleton instance
 */
let driveServiceInstance: DriveService | null = null;

export async function getDriveService(
  auth?: Auth.GoogleAuth | Auth.OAuth2Client
): Promise<DriveService> {
  if (!driveServiceInstance || auth) {
    if (!auth) {
      throw new Error('Auth required to initialize Drive service');
    }
    driveServiceInstance = new DriveService(auth);
  }
  return driveServiceInstance;
}
