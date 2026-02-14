/**
 * Send File to Telegram API
 * POST /api/files/:id/send - Send a Google Drive file to Telegram
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth';
import { getOAuth2Client } from '@/lib/google/auth';
import { dbClient } from '@/lib/db';
import { telegramLinks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getFileAttachmentService } from '@/lib/services/file-attachment.service';
import { z } from 'zod';

const LOG_PREFIX = '[Send File API]';

/**
 * Request schema for sending files
 */
const sendFileSchema = z.object({
  caption: z.string().optional(),
  replyToMessageId: z.number().optional(),
  messageThreadId: z.number().optional(),
});

interface RouteParams {
  params: Promise<{
    id: string; // Drive file ID
  }>;
}

/**
 * POST /api/files/:id/send
 * Send a Google Drive file to the user's Telegram chat
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id: driveFileId } = await params;

    console.log(`${LOG_PREFIX} Sending file ${driveFileId} for user ${userId}`);

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const validatedData = sendFileSchema.parse(body);

    // Get Telegram link for user
    const db = dbClient.getDb();
    const [telegramLink] = await db
      .select()
      .from(telegramLinks)
      .where(eq(telegramLinks.userId, userId))
      .limit(1);

    if (!telegramLink) {
      return NextResponse.json(
        {
          error: 'Telegram not linked',
          message: 'Please link your Telegram account first before sending files.',
        },
        { status: 400 }
      );
    }

    // Get user's OAuth2 client
    const oauth2Client = await getOAuth2Client(userId);
    if (!oauth2Client) {
      return NextResponse.json(
        {
          error: 'Google Drive not connected',
          message: 'Please connect your Google Drive account.',
        },
        { status: 400 }
      );
    }

    // Send file using FileAttachmentService
    const fileAttachmentService = getFileAttachmentService();

    const fileAttachment = await fileAttachmentService.sendFileToUser({
      userId,
      driveFileId,
      telegramChatId: telegramLink.telegramChatId,
      caption: validatedData.caption,
      replyToMessageId: validatedData.replyToMessageId,
      messageThreadId: validatedData.messageThreadId,
      driveAuth: oauth2Client,
    });

    console.log(
      `${LOG_PREFIX} Successfully sent file ${driveFileId} to Telegram (attachment ID: ${fileAttachment.id})`
    );

    return NextResponse.json(
      {
        success: true,
        message: 'File sent to Telegram successfully',
        attachmentId: fileAttachment.id,
        fileName: fileAttachment.fileName,
        fileSize: fileAttachment.fileSize,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to send file:`, error);

    // Handle authentication errors
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: error.message,
        },
        { status: error.statusCode }
      );
    }

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          message: 'Request body validation failed',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    // Handle specific error messages from service layer
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for common error types
    if (
      errorMessage.includes('File size') ||
      errorMessage.includes('exceeds') ||
      errorMessage.includes('limit')
    ) {
      return NextResponse.json(
        {
          error: 'File too large',
          message: errorMessage,
        },
        { status: 413 } // Payload Too Large
      );
    }

    if (
      errorMessage.includes('File type') ||
      errorMessage.includes('not supported') ||
      errorMessage.includes('blocked')
    ) {
      return NextResponse.json(
        {
          error: 'File type not supported',
          message: errorMessage,
        },
        { status: 415 } // Unsupported Media Type
      );
    }

    if (errorMessage.includes('Rate limit')) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: errorMessage,
        },
        { status: 429 } // Too Many Requests
      );
    }

    if (errorMessage.includes('not found') || errorMessage.includes('Not Found')) {
      return NextResponse.json(
        {
          error: 'File not found',
          message: 'The requested file could not be found in Google Drive.',
        },
        { status: 404 }
      );
    }

    // Generic error
    return NextResponse.json(
      {
        error: 'Failed to send file',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
