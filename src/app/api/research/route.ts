/**
 * Research API Endpoints
 * POST /api/research - Start new research task
 * GET /api/research - List user's research tasks
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { createTask, listTasks } from '@/agents/base/task-manager';
import { inngest } from '@/lib/events';

const LOG_PREFIX = '[Research API]';

/**
 * Request schema for creating research tasks
 */
const createResearchSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  context: z.string().optional(),
  maxSources: z.number().int().min(1).max(20).default(5),
  maxDepth: z.number().int().min(1).max(3).default(1),
  focusAreas: z.array(z.string()).optional(),
  excludeDomains: z.array(z.string()).optional(),
});

/**
 * Query schema for listing tasks
 */
const listTasksSchema = z.object({
  status: z.enum(['idle', 'running', 'completed', 'failed', 'paused']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * POST /api/research
 * Start a new research task
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createResearchSchema.parse(body);

    console.log(`${LOG_PREFIX} Creating research task for user ${userId}`, {
      query: validatedData.query,
      maxSources: validatedData.maxSources,
    });

    // Create task in database
    const task = await createTask('research', userId, validatedData, {
      totalSteps: 5, // Plan, Search, Analyze, Synthesize, Complete
    });

    console.log(`${LOG_PREFIX} Created task ${task.id}`);

    // Send Inngest event to start research
    await inngest.send({
      name: 'izzie/research.request',
      data: {
        taskId: task.id,
        userId,
        query: validatedData.query,
        context: validatedData.context,
        maxSources: validatedData.maxSources,
        maxDepth: validatedData.maxDepth,
        focusAreas: validatedData.focusAreas,
        excludeDomains: validatedData.excludeDomains,
      },
    });

    console.log(`${LOG_PREFIX} Sent Inngest event for task ${task.id}`);

    return NextResponse.json(
      {
        taskId: task.id,
        status: 'started',
        message: 'Research task started successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create research task:`, error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to create research task',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/research
 * List user's research tasks
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const params = {
      status: searchParams.get('status') || undefined,
      limit: searchParams.get('limit') || '20',
      offset: searchParams.get('offset') || '0',
    };

    const validatedParams = listTasksSchema.parse(params);

    console.log(`${LOG_PREFIX} Listing research tasks for user ${userId}`, validatedParams);

    // Get tasks from database
    const tasks = await listTasks(userId, {
      agentType: 'research',
      status: validatedParams.status,
      limit: validatedParams.limit,
      offset: validatedParams.offset,
    });

    // Count total for pagination
    const allTasks = await listTasks(userId, {
      agentType: 'research',
      status: validatedParams.status,
    });

    return NextResponse.json({
      tasks: tasks.map((task) => ({
        id: task.id,
        status: task.status,
        query: (task.input as any).query,
        progress: task.progress,
        currentStep: task.currentStep,
        tokensUsed: task.tokensUsed,
        totalCost: task.totalCost,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
      })),
      total: allTasks.length,
      limit: validatedParams.limit,
      offset: validatedParams.offset,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to list research tasks:`, error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to list research tasks',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
