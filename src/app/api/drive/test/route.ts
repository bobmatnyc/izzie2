/**
 * Google Drive Test API Endpoint
 * Tests Drive connection and returns sample files
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceAccountAuth, validateAuth } from '@/lib/google/auth';
import { getDriveService } from '@/lib/google/drive';

/**
 * GET /api/drive/test
 * Test Drive connection and return sample data
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userEmail = searchParams.get('userEmail') || undefined;
    const maxResults = parseInt(searchParams.get('maxResults') || '10', 10);
    const query = searchParams.get('query') || undefined;

    console.log('[Drive Test] Starting connection test...');

    // Step 1: Test authentication
    const auth = await getServiceAccountAuth(userEmail);
    const isValid = await validateAuth(auth);

    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed',
          details: 'Service account credentials are invalid or insufficient permissions',
        },
        { status: 401 }
      );
    }

    console.log('[Drive Test] Authentication successful');

    // Step 2: Initialize Drive service
    const driveService = await getDriveService(auth);

    // Step 3: Get Drive about info (storage quota, user)
    const about = await driveService['drive'].about.get({
      fields: 'user, storageQuota',
    });

    console.log('[Drive Test] About info retrieved:', about.data.user?.emailAddress);

    // Step 4: List files
    console.log(`[Drive Test] Fetching ${maxResults} files...`);
    const fileBatch = await driveService.listFiles({
      maxResults,
      query,
      orderBy: 'modifiedTime desc',
    });

    // Step 5: Get change token for future syncing
    const changeToken = await driveService.getStartPageToken();

    // Calculate statistics
    const stats = {
      totalFiles: fileBatch.files.length,
      googleDocs: fileBatch.files.filter((f) =>
        f.mimeType.includes('vnd.google-apps.document')
      ).length,
      googleSheets: fileBatch.files.filter((f) =>
        f.mimeType.includes('vnd.google-apps.spreadsheet')
      ).length,
      googleSlides: fileBatch.files.filter((f) =>
        f.mimeType.includes('vnd.google-apps.presentation')
      ).length,
      pdfs: fileBatch.files.filter((f) => f.mimeType === 'application/pdf').length,
      folders: fileBatch.files.filter((f) =>
        f.mimeType.includes('vnd.google-apps.folder')
      ).length,
      sharedFiles: fileBatch.files.filter((f) => f.shared).length,
      starredFiles: fileBatch.files.filter((f) => f.starred).length,
    };

    // Format files for response (limit data size)
    const formattedFiles = fileBatch.files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      createdTime: file.createdTime.toISOString(),
      modifiedTime: file.modifiedTime.toISOString(),
      owners: file.owners.map((owner) => ({
        name: owner.displayName,
        email: owner.emailAddress,
      })),
      webViewLink: file.webViewLink,
      thumbnailLink: file.thumbnailLink,
      shared: file.shared,
      starred: file.starred,
      capabilities: file.capabilities,
    }));

    // Test content extraction on first file if available
    let contentSample;
    if (fileBatch.files.length > 0) {
      const firstFile = fileBatch.files[0];
      // Only try to get content for files that are likely to be small and text-based
      const isTextFile =
        firstFile.mimeType.includes('vnd.google-apps.document') ||
        firstFile.mimeType.includes('text/') ||
        firstFile.mimeType === 'application/json';

      const isSmallFile = !firstFile.size || firstFile.size < 1024 * 1024; // < 1MB

      if (isTextFile && isSmallFile) {
        try {
          console.log(`[Drive Test] Testing content extraction on: ${firstFile.name}`);
          const fileContent = await driveService.getFileContent(firstFile.id);
          const contentPreview =
            typeof fileContent.content === 'string'
              ? fileContent.content.substring(0, 500)
              : `<Binary content, ${fileContent.content.length} bytes>`;

          contentSample = {
            fileName: firstFile.name,
            mimeType: fileContent.mimeType,
            encoding: fileContent.encoding,
            preview: contentPreview,
            size: typeof fileContent.content === 'string' ? fileContent.content.length : fileContent.content.length,
          };
        } catch (error) {
          console.error('[Drive Test] Content extraction failed:', error);
          contentSample = {
            fileName: firstFile.name,
            error: 'Content extraction failed',
            details: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      } else {
        contentSample = {
          fileName: firstFile.name,
          skipped: true,
          reason: isTextFile ? 'File too large' : 'Not a text file',
        };
      }
    }

    return NextResponse.json({
      success: true,
      connection: {
        authenticated: true,
        emailAddress: about.data.user?.emailAddress,
        storageQuota: {
          limit: about.data.storageQuota?.limit,
          usage: about.data.storageQuota?.usage,
          usageInDrive: about.data.storageQuota?.usageInDrive,
          usageInDriveTrash: about.data.storageQuota?.usageInDriveTrash,
        },
      },
      stats,
      files: formattedFiles,
      pagination: {
        hasMore: !!fileBatch.nextPageToken,
        nextPageToken: fileBatch.nextPageToken,
        incompleteSearch: fileBatch.incompleteSearch,
      },
      sync: {
        startPageToken: changeToken.token,
        message: 'Use this token for incremental sync via Changes API',
      },
      contentSample,
    });
  } catch (error) {
    console.error('[Drive Test] Test failed:', error);

    // Provide helpful error messages
    let errorMessage = 'Unknown error occurred';
    let errorDetails = '';

    if (error instanceof Error) {
      errorMessage = error.message;

      // Check for common errors
      if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
        errorDetails = 'Service account key file not found. Check GOOGLE_SERVICE_ACCOUNT_KEY_PATH';
      } else if (errorMessage.includes('invalid_grant')) {
        errorDetails =
          'Invalid service account credentials or domain-wide delegation not configured';
      } else if (errorMessage.includes('insufficient permissions')) {
        errorDetails = 'Service account lacks required Drive API permissions';
      } else if (errorMessage.includes('domain-wide delegation')) {
        errorDetails = 'Domain-wide delegation not configured in Google Workspace Admin';
      } else if (errorMessage.includes('accessNotConfigured')) {
        errorDetails = 'Drive API not enabled in Google Cloud Console';
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: errorDetails,
        troubleshooting: {
          step1: 'Verify service account key file exists at .credentials/google-service-account.json',
          step2: 'Check GOOGLE_SERVICE_ACCOUNT_KEY_PATH environment variable',
          step3: 'Ensure Drive API is enabled in Google Cloud Console',
          step4: 'For Workspace files, configure domain-wide delegation in Google Workspace Admin',
          step5: 'Verify drive.readonly scope is authorized for the service account',
        },
      },
      { status: 500 }
    );
  }
}
