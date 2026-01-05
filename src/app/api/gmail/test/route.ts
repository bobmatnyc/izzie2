/**
 * Gmail Test API Endpoint
 * Tests Gmail connection and returns sample emails
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceAccountAuth, validateAuth } from '@/lib/google/auth';
import { getGmailService } from '@/lib/google/gmail';

/**
 * GET /api/gmail/test
 * Test Gmail connection and return sample data
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userEmail = searchParams.get('userEmail') || undefined;
    const maxResults = parseInt(searchParams.get('maxResults') || '5', 10);
    const folder = (searchParams.get('folder') || 'inbox') as 'inbox' | 'sent' | 'all';

    console.log('[Gmail Test] Starting connection test...');

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

    console.log('[Gmail Test] Authentication successful');

    // Step 2: Initialize Gmail service
    const gmailService = await getGmailService(auth);

    // Step 3: Get user profile
    const profile = await gmailService['gmail'].users.getProfile({ userId: 'me' });
    console.log('[Gmail Test] Profile retrieved:', profile.data.emailAddress);

    // Step 4: Fetch sample emails
    console.log(`[Gmail Test] Fetching ${maxResults} emails from ${folder}...`);
    const emailBatch = await gmailService.fetchEmails({
      folder,
      maxResults,
    });

    // Step 5: Get labels
    const labels = await gmailService.getLabels();

    // Calculate statistics
    const stats = {
      totalEmails: emailBatch.emails.length,
      sentEmails: emailBatch.emails.filter((e) => e.isSent).length,
      inboxEmails: emailBatch.emails.filter((e) => e.labels.includes('INBOX')).length,
      withAttachments: emailBatch.emails.filter((e) => e.hasAttachments).length,
    };

    // Format emails for response (limit data size)
    const formattedEmails = emailBatch.emails.map((email) => ({
      id: email.id,
      threadId: email.threadId,
      from: email.from,
      to: email.to.slice(0, 3), // Limit recipients
      subject: email.subject,
      snippet: email.snippet,
      date: email.date.toISOString(),
      isSent: email.isSent,
      hasAttachments: email.hasAttachments,
      labels: email.labels,
      bodyPreview: email.body.substring(0, 200) + '...', // First 200 chars
    }));

    return NextResponse.json({
      success: true,
      connection: {
        authenticated: true,
        emailAddress: profile.data.emailAddress,
        messagesTotal: profile.data.messagesTotal,
        threadsTotal: profile.data.threadsTotal,
      },
      stats,
      labels: {
        total: labels.length,
        system: labels.filter((l) => l.type === 'system').length,
        user: labels.filter((l) => l.type === 'user').length,
        samples: labels.slice(0, 10).map((l) => ({ id: l.id, name: l.name, type: l.type })),
      },
      emails: formattedEmails,
      pagination: {
        hasMore: !!emailBatch.nextPageToken,
        nextPageToken: emailBatch.nextPageToken,
        resultSizeEstimate: emailBatch.resultSizeEstimate,
      },
    });
  } catch (error) {
    console.error('[Gmail Test] Test failed:', error);

    // Provide helpful error messages
    let errorMessage = 'Unknown error occurred';
    let errorDetails = '';

    if (error instanceof Error) {
      errorMessage = error.message;

      // Check for common errors
      if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
        errorDetails = 'Service account key file not found. Check GOOGLE_SERVICE_ACCOUNT_KEY_PATH';
      } else if (errorMessage.includes('invalid_grant')) {
        errorDetails = 'Invalid service account credentials or domain-wide delegation not configured';
      } else if (errorMessage.includes('insufficient permissions')) {
        errorDetails = 'Service account lacks required Gmail API permissions';
      } else if (errorMessage.includes('domain-wide delegation')) {
        errorDetails = 'Domain-wide delegation not configured in Google Workspace Admin';
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
          step3: 'For Gmail access, configure domain-wide delegation in Google Workspace Admin',
          step4: 'For personal Gmail, use OAuth 2.0 flow instead of service account',
        },
      },
      { status: 500 }
    );
  }
}
