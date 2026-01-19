/**
 * Research Findings API
 * GET /api/research/:taskId/findings - Get/search findings for a task
 *
 * Query params:
 * - q: Search query (semantic search via Weaviate)
 * - limit: Max results (default: 20)
 * - minConfidence: Minimum confidence score (0-1)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTask } from '@/agents/base/task-manager';
import { searchFindings, getFindingsByTask } from '@/lib/weaviate/research-findings';
import { z } from 'zod';

const LOG_PREFIX = '[Research Findings API]';

interface RouteParams {
  params: Promise<{
    taskId: string;
  }>;
}

/**
 * Query schema for findings
 */
const findingsQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
});

/**
 * GET /api/research/:taskId/findings
 * Get or search findings for a task
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;
    const { taskId } = await params;

    console.log(`${LOG_PREFIX} Getting findings for task ${taskId}`);

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

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const params_query = {
      q: searchParams.get('q') || undefined,
      limit: searchParams.get('limit') || '20',
      minConfidence: searchParams.get('minConfidence') || undefined,
    };

    const validatedParams = findingsQuerySchema.parse(params_query);

    // If search query provided, do semantic search
    let findings;
    if (validatedParams.q) {
      console.log(
        `${LOG_PREFIX} Searching findings with query: "${validatedParams.q}"`
      );
      findings = await searchFindings(validatedParams.q, userId, {
        limit: validatedParams.limit,
        taskId,
        minConfidence: validatedParams.minConfidence ? validatedParams.minConfidence * 100 : undefined,
      });
    } else {
      // Otherwise, get all findings for task
      console.log(`${LOG_PREFIX} Getting all findings for task ${taskId}`);
      findings = await getFindingsByTask(taskId, userId);

      // Apply filters
      if (validatedParams.minConfidence) {
        findings = findings.filter(
          (f) => f.confidence >= validatedParams.minConfidence!
        );
      }

      // Apply limit
      findings = findings.slice(0, validatedParams.limit);
    }

    return NextResponse.json({
      findings: findings.map((finding) => ({
        id: finding.id,
        claim: finding.claim,
        evidence: finding.evidence,
        confidence: finding.confidence,
        sourceUrl: finding.sourceUrl,
        quote: finding.quote,
        createdAt: finding.createdAt,
      })),
      total: findings.length,
      taskId,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get findings:`, error);

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
        error: 'Failed to get findings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
