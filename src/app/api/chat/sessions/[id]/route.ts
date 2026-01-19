/**
 * Individual Chat Session API
 * GET /api/chat/sessions/[id] - Get session details
 * DELETE /api/chat/sessions/[id] - Delete session
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getSessionManager, getSessionStorage } from '@/lib/chat/session';

const LOG_PREFIX = '[Session API]';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/chat/sessions/[id]
 * Get detailed session information
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id: sessionId } = await params;

    console.log(`${LOG_PREFIX} Fetching session ${sessionId} for user ${userId}`);

    // Get session
    const storage = getSessionStorage();
    const chatSession = await storage.getSession(sessionId);

    if (!chatSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Verify ownership
    if (chatSession.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Format response
    const response = {
      id: chatSession.id,
      title: chatSession.title || 'Untitled Chat',
      currentTask: chatSession.currentTask,
      messageCount: chatSession.messageCount,
      recentMessages: chatSession.recentMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
      })),
      hasCompressedHistory: !!chatSession.compressedHistory,
      compressedHistoryLength: chatSession.compressedHistory?.length || 0,
      archivedMessageCount: chatSession.archivedMessages?.length || 0,
      createdAt: chatSession.createdAt.toISOString(),
      updatedAt: chatSession.updatedAt.toISOString(),
    };

    console.log(`${LOG_PREFIX} Returning session ${sessionId}`);

    return NextResponse.json({ session: response });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching session:`, error);
    return NextResponse.json(
      {
        error: 'Failed to fetch session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/sessions/[id]
 * Delete a session
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { id: sessionId } = await params;

    console.log(`${LOG_PREFIX} Deleting session ${sessionId} for user ${userId}`);

    // Verify ownership before deleting
    const sessionManager = getSessionManager();
    const belongsToUser = await sessionManager.sessionBelongsToUser(sessionId, userId);

    if (!belongsToUser) {
      return NextResponse.json(
        { error: 'Session not found or unauthorized' },
        { status: 404 }
      );
    }

    // Delete session
    await sessionManager.deleteSession(sessionId);

    console.log(`${LOG_PREFIX} Deleted session ${sessionId}`);

    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error deleting session:`, error);
    return NextResponse.json(
      {
        error: 'Failed to delete session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
