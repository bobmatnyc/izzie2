/**
 * Pause Research Task API
 * POST /api/research/:taskId/pause - Pause running task
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTask, updateTask } from '@/agents/base/task-manager';

const LOG_PREFIX = '[Research Pause API]';

interface RouteParams {
  params: Promise<{
    taskId: string;
  }>;
}

/**
 * POST /api/research/:taskId/pause
 * Pause a running task
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { taskId } = await params;

    console.log(`${LOG_PREFIX} Pausing task ${taskId} for user ${userId}`);

    // Get task from database
    const task = await getTask(taskId);

    if (!task) {
      return NextResponse.json(
        {
          error: 'Task not found',
        },
        { status: 404 }
      );
    }

    // Verify task belongs to user
    if (task.userId !== userId) {
      return NextResponse.json(
        {
          error: 'Unauthorized - task does not belong to user',
        },
        { status: 403 }
      );
    }

    // Can only pause running tasks
    if (task.status !== 'running' && task.status !== 'pending') {
      return NextResponse.json(
        {
          error: `Cannot pause task with status: ${task.status}`,
        },
        { status: 400 }
      );
    }

    // Update task status to paused
    await updateTask(taskId, {
      status: 'paused',
    });

    console.log(`${LOG_PREFIX} Successfully paused task ${taskId}`);

    return NextResponse.json({
      success: true,
      message: 'Task paused successfully',
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to pause task:`, error);

    return NextResponse.json(
      {
        error: 'Failed to pause task',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
