/**
 * Resume Research Task API
 * POST /api/research/:taskId/resume - Resume paused task
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTask, updateTask } from '@/agents/base/task-manager';
import { inngest } from '@/lib/events';

const LOG_PREFIX = '[Research Resume API]';

interface RouteParams {
  params: Promise<{
    taskId: string;
  }>;
}

/**
 * POST /api/research/:taskId/resume
 * Resume a paused task
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { taskId } = await params;

    console.log(`${LOG_PREFIX} Resuming task ${taskId} for user ${userId}`);

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

    // Can only resume paused tasks
    if (task.status !== 'paused') {
      return NextResponse.json(
        {
          error: `Cannot resume task with status: ${task.status}`,
        },
        { status: 400 }
      );
    }

    // Update task status to pending (will be picked up by Inngest)
    await updateTask(taskId, {
      status: 'pending',
    });

    // Re-send Inngest event to resume execution
    const input = task.input as any;
    await inngest.send({
      name: 'izzie/research.request',
      data: {
        taskId: task.id,
        userId,
        query: input.query,
        context: input.context,
        maxSources: input.maxSources,
        maxDepth: input.maxDepth,
        focusAreas: input.focusAreas,
        excludeDomains: input.excludeDomains,
      },
    });

    console.log(`${LOG_PREFIX} Successfully resumed task ${taskId}`);

    return NextResponse.json({
      success: true,
      message: 'Task resumed successfully',
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to resume task:`, error);

    return NextResponse.json(
      {
        error: 'Failed to resume task',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
