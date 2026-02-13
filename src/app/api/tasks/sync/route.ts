/**
 * Google Tasks Sync API Endpoint
 * Triggers task synchronization from Google Tasks
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth';
import { fetchAllTasks } from '@/lib/google/tasks';
import { inngest } from '@/lib/events';
import type { TaskContentExtractedPayload } from '@/lib/events/types';

// In-memory sync status (in production, use Redis or database)
let syncStatus: {
  isRunning: boolean;
  tasksProcessed: number;
  eventsSent: number;
  lastSync?: Date;
  error?: string;
} = {
  isRunning: false,
  tasksProcessed: 0,
  eventsSent: 0,
};

/**
 * POST /api/tasks/sync
 * Start task synchronization
 */
export async function POST(request: NextRequest) {
  try {
    // Check if sync is already running
    if (syncStatus.isRunning) {
      return NextResponse.json(
        {
          error: 'Sync already in progress',
          status: syncStatus,
        },
        { status: 409 }
      );
    }

    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;
    const userEmail = session.user.email || 'unknown';

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { maxTasksPerList = 100, showCompleted = true, showHidden = false } = body;

    // Start sync (don't await - run in background)
    startSync(userId, userEmail, maxTasksPerList, showCompleted, showHidden).catch((error) => {
      console.error('[Tasks Sync] Background sync failed:', error);
      syncStatus.isRunning = false;
      syncStatus.error = error.message;
    });

    return NextResponse.json({
      message: 'Task sync started',
      status: syncStatus,
    });
  } catch (error) {
    console.error('[Tasks Sync] Failed to start sync:', error);

    // Handle authentication errors with proper 401/403 status codes
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: error.message,
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: `Failed to start sync: ${error}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tasks/sync
 * Get sync status
 */
export async function GET() {
  return NextResponse.json({
    status: syncStatus,
  });
}

/**
 * Background sync function
 */
async function startSync(
  userId: string,
  userEmail: string,
  maxTasksPerList: number,
  showCompleted: boolean,
  showHidden: boolean
): Promise<void> {
  syncStatus = {
    isRunning: true,
    tasksProcessed: 0,
    eventsSent: 0,
    lastSync: new Date(),
  };

  try {
    console.log('[Tasks Sync] Fetching all tasks for user:', userId);

    // Fetch all tasks from all task lists
    const allTasks = await fetchAllTasks(userId, {
      maxTasksPerList,
      showCompleted,
      showHidden,
    });

    syncStatus.tasksProcessed = allTasks.length;

    // Emit events for entity extraction (batch send for efficiency)
    if (allTasks.length > 0) {
      const events = allTasks.map(({ task, taskListId, taskListTitle }) => ({
        name: 'izzie/ingestion.task.extracted' as const,
        data: {
          userId: userEmail,
          taskId: task.id,
          title: task.title,
          notes: task.notes || '',
          due: task.due || undefined,
          status: task.status,
          listId: taskListId,
          listTitle: taskListTitle,
          updated: task.updated || undefined,
          completed: task.completed || undefined,
          parent: task.parent || undefined,
        } satisfies TaskContentExtractedPayload,
      }));

      await inngest.send(events);
      syncStatus.eventsSent = events.length;
      console.log(`[Tasks Sync] Sent ${events.length} events for entity extraction`);
    }

    syncStatus.isRunning = false;
    syncStatus.lastSync = new Date();
    console.log(
      `[Tasks Sync] Completed. Processed ${allTasks.length} tasks, sent ${syncStatus.eventsSent} events for extraction`
    );
  } catch (error) {
    console.error('[Tasks Sync] Sync failed:', error);
    syncStatus.isRunning = false;
    syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}
