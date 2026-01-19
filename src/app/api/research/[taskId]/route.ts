/**
 * Research Task Detail API
 * GET /api/research/:taskId - Get task status and results
 * DELETE /api/research/:taskId - Cancel task
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTask, cancelTask } from '@/agents/base/task-manager';
import { getFindingsByTask } from '@/lib/weaviate/research-findings';
import { getResearchSources } from '@/lib/db/research';

const LOG_PREFIX = '[Research Task API]';

interface RouteParams {
  params: Promise<{
    taskId: string;
  }>;
}

/**
 * GET /api/research/:taskId
 * Get task status and results
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { taskId } = await params;

    console.log(`${LOG_PREFIX} Getting task ${taskId} for user ${userId}`);

    // Check if client wants findings included
    const includeFindings = request.nextUrl.searchParams.get('includeFindings') === 'true';

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

    // Optionally fetch findings if task is completed
    let findings = undefined;
    let sources = undefined;

    if (includeFindings && task.status === 'completed') {
      try {
        [findings, sources] = await Promise.all([
          getFindingsByTask(taskId, userId),
          getResearchSources(taskId),
        ]);
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to fetch findings/sources:`, error);
        // Continue without findings rather than failing the whole request
      }
    }

    // Return task with output if completed
    return NextResponse.json({
      task: {
        id: task.id,
        status: task.status,
        query: (task.input as any).query,
        progress: task.progress,
        currentStep: task.currentStep,
        stepsCompleted: task.stepsCompleted,
        totalSteps: task.totalSteps,
        tokensUsed: task.tokensUsed,
        totalCost: task.totalCost,
        error: task.error,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
      },
      output: task.status === 'completed' ? task.output : undefined,
      findings: findings
        ? findings.map((f) => ({
            id: f.id,
            claim: f.claim,
            evidence: f.evidence,
            confidence: f.confidence,
            sourceUrl: f.sourceUrl,
            quote: f.quote,
          }))
        : undefined,
      sources: sources
        ? sources.map((s) => ({
            id: s.id,
            url: s.url,
            title: s.title,
            relevanceScore: s.relevanceScore,
            credibilityScore: s.credibilityScore,
          }))
        : undefined,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get task:`, error);

    return NextResponse.json(
      {
        error: 'Failed to get task',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/research/:taskId
 * Cancel a running task
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { taskId } = await params;

    console.log(`${LOG_PREFIX} Cancelling task ${taskId} for user ${userId}`);

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

    // Cannot cancel already completed or failed tasks
    if (task.status === 'completed' || task.status === 'failed') {
      return NextResponse.json(
        {
          error: 'Cannot cancel task that is already completed or failed',
        },
        { status: 400 }
      );
    }

    // Cancel task (sets status to 'paused')
    await cancelTask(taskId);

    console.log(`${LOG_PREFIX} Successfully cancelled task ${taskId}`);

    return NextResponse.json({
      success: true,
      message: 'Task cancelled successfully',
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to cancel task:`, error);

    return NextResponse.json(
      {
        error: 'Failed to cancel task',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
