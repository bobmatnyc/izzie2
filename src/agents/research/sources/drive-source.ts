/**
 * Drive Source for Research Agent
 * Searches Google Drive files using DriveService
 */

import { DriveService } from '@/lib/google/drive';
import type { Auth } from 'googleapis';
import type { ResearchSourceResult } from '../types';
import type { DriveFile, DriveFileContent } from '@/lib/google/types';

const MAX_RESULTS_DEFAULT = 5;

export interface DriveSearchOptions {
  maxResults?: number;
  includeSharedDrives?: boolean;
  mimeTypes?: string[]; // Filter by specific MIME types
}

/**
 * Search Drive files by query keywords
 * Returns top results with unified ResearchSourceResult format
 */
export async function searchDriveFiles(
  auth: Auth.GoogleAuth | Auth.OAuth2Client,
  query: string,
  options: DriveSearchOptions = {}
): Promise<ResearchSourceResult[]> {
  const {
    maxResults = MAX_RESULTS_DEFAULT,
    includeSharedDrives = false,
  } = options;

  const driveService = new DriveService(auth);

  try {
    // Use Drive's built-in search which searches name and content
    const batch = await driveService.searchFiles({
      query,
      maxResults,
      includeSharedDrives,
      orderBy: 'relevance',
    });

    // Convert to unified format
    const results: ResearchSourceResult[] = batch.files
      .slice(0, maxResults)
      .map((file) => driveFileToResearchResult(file));

    console.log(
      `[DriveSource] Found ${results.length} files matching "${query}"`
    );

    return results;
  } catch (error) {
    console.error('[DriveSource] Failed to search Drive:', error);
    return [];
  }
}

/**
 * Get content from a Drive file for analysis
 */
export async function getDriveFileContent(
  auth: Auth.GoogleAuth | Auth.OAuth2Client,
  fileId: string
): Promise<DriveFileContent | null> {
  const driveService = new DriveService(auth);

  try {
    const content = await driveService.getFileContent(fileId);
    return content;
  } catch (error) {
    console.error(`[DriveSource] Failed to get content for ${fileId}:`, error);
    return null;
  }
}

/**
 * Convert DriveFile to ResearchSourceResult
 */
function driveFileToResearchResult(file: DriveFile): ResearchSourceResult {
  const ownerName =
    file.owners.length > 0
      ? file.owners[0].displayName || file.owners[0].emailAddress
      : 'Unknown';
  const dateStr = file.modifiedTime.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const fileType = getFileTypeLabel(file.mimeType);

  return {
    sourceType: 'drive',
    title: file.name,
    snippet: file.description || `${fileType} modified ${dateStr}`,
    link: file.id,
    reference: `${fileType} by ${ownerName}, modified ${dateStr}`,
    date: file.modifiedTime,
    metadata: {
      mimeType: file.mimeType,
      size: file.size,
      owners: file.owners,
      webViewLink: file.webViewLink,
      shared: file.shared,
      starred: file.starred,
    },
  };
}

/**
 * Get human-readable file type label
 */
function getFileTypeLabel(mimeType: string): string {
  const mimeTypeLabels: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.folder': 'Folder',
    'application/vnd.google-apps.form': 'Google Form',
    'application/pdf': 'PDF',
    'text/plain': 'Text File',
    'application/json': 'JSON File',
    'image/png': 'PNG Image',
    'image/jpeg': 'JPEG Image',
  };

  return mimeTypeLabels[mimeType] || 'File';
}
