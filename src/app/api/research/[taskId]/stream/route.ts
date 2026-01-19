/**
 * Research Task Stream API
 * GET /api/research/:taskId/stream - Server-Sent Events for progress updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTask } from '@/agents/base/task-manager';

const LOG_PREFIX = '[Research Stream API]';

interface RouteParams {
  params: Promise<{
    taskId: string;
  }>;
}

/**
 * GET /api/research/:taskId/stream
 * Stream progress updates via Server-Sent Events
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { taskId } = await params;

    console.log(`${LOG_PREFIX} Starting stream for task ${taskId}`);

    // Verify task exists and belongs to user
    const task = await getTask(taskId);

    if (!task) {
      return NextResponse.json(
        {
          error: 'Task not found',
        },
        { status: 404 }
      );
    }

    if (task.userId !== userId) {
      return NextResponse.json(
        {
          error: 'Unauthorized - task does not belong to user',
        },
        { status: 403 }
      );
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let lastProgress = -1;
        let lastStatus = '';

        // Poll for task updates every 2 seconds
        const intervalId = setInterval(async () => {
          try {
            const currentTask = await getTask(taskId);

            if (!currentTask) {
              // Task deleted
              const event = JSON.stringify({
                type: 'error',
                data: { message: 'Task not found' },
              });
              controller.enqueue(encoder.encode(`data: ${event}\n\n`));
              clearInterval(intervalId);
              controller.close();
              return;
            }

            // Send progress update if changed
            if (
              currentTask.progress !== lastProgress ||
              currentTask.status !== lastStatus
            ) {
              const event = JSON.stringify({
                type: 'progress',
                data: {
                  status: currentTask.status,
                  progress: currentTask.progress,
                  currentStep: currentTask.currentStep,
                  stepsCompleted: currentTask.stepsCompleted,
                  totalSteps: currentTask.totalSteps,
                },
              });
              controller.enqueue(encoder.encode(`data: ${event}\n\n`));

              lastProgress = currentTask.progress;
              lastStatus = currentTask.status;
            }

            // Check if task is complete
            if (currentTask.status === 'completed') {
              const event = JSON.stringify({
                type: 'complete',
                data: {
                  summary: (currentTask.output as any)?.summary,
                  tokensUsed: currentTask.tokensUsed,
                  totalCost: currentTask.totalCost,
                },
              });
              controller.enqueue(encoder.encode(`data: ${event}\n\n`));
              clearInterval(intervalId);
              controller.close();
              return;
            }

            // Check if task failed
            if (currentTask.status === 'failed') {
              const event = JSON.stringify({
                type: 'error',
                data: {
                  message: currentTask.error || 'Task failed',
                },
              });
              controller.enqueue(encoder.encode(`data: ${event}\n\n`));
              clearInterval(intervalId);
              controller.close();
              return;
            }

            // Check if task was cancelled
            if (currentTask.status === 'paused') {
              const event = JSON.stringify({
                type: 'cancelled',
                data: {
                  message: 'Task was paused',
                },
              });
              controller.enqueue(encoder.encode(`data: ${event}\n\n`));
              clearInterval(intervalId);
              controller.close();
              return;
            }
          } catch (error) {
            console.error(`${LOG_PREFIX} Stream error:`, error);
            const event = JSON.stringify({
              type: 'error',
              data: {
                message: error instanceof Error ? error.message : 'Unknown error',
              },
            });
            controller.enqueue(encoder.encode(`data: ${event}\n\n`));
            clearInterval(intervalId);
            controller.close();
          }
        }, 2000); // Poll every 2 seconds

        // Clean up on client disconnect
        request.signal.addEventListener('abort', () => {
          clearInterval(intervalId);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create stream:`, error);

    return NextResponse.json(
      {
        error: 'Failed to create stream',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
