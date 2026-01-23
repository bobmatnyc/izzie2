/**
 * Memory Store API Route
 *
 * POST /api/memory/store
 * Store a new memory entry with vector embedding
 *
 * Requires authentication. The userId is derived from the authenticated session.
 *
 * Request body:
 * {
 *   content: string;
 *   metadata?: Record<string, unknown>;
 *   conversationId?: string;
 *   importance?: number; // 1-10 scale
 *   summary?: string;
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { memoryService } from '@/lib/memory';
import { z } from 'zod';

/**
 * Request schema
 */
const StoreMemorySchema = z.object({
  userId: z.string(),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  conversationId: z.string().optional(),
  importance: z.number().min(1).max(10).optional(),
  summary: z.string().optional(),
});

/**
 * POST /api/memory/store
 * Store a memory with vector embedding
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    let authSession;
    try {
      authSession = await requireAuth(request);
    } catch {
      return NextResponse.json(
        { error: 'Unauthorized - authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate request
    const parsed = StoreMemorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    // Override userId with authenticated user's ID (don't trust client-provided userId)
    const userId = authSession.user.id;
    const { content, metadata, conversationId, importance, summary } = parsed.data;

    // Store memory
    const memory = await memoryService.store(
      {
        userId,
        content,
        metadata: metadata || {},
      },
      {
        conversationId,
        importance,
        summary,
      }
    );

    return NextResponse.json({
      status: 'success',
      memory,
      message: 'Memory stored successfully',
    });
  } catch (error) {
    console.error('[API] Memory store error:', error);

    return NextResponse.json(
      {
        error: 'Failed to store memory',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
