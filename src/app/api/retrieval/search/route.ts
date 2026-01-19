/**
 * Retrieval Search API
 *
 * POST /api/retrieval/search
 *
 * Hybrid retrieval combining vector similarity and graph traversal.
 */

import { NextRequest, NextResponse } from 'next/server';
import { retrievalService } from '@/lib/retrieval';

/**
 * POST /api/retrieval/search
 *
 * Execute hybrid retrieval search
 *
 * Body:
 * {
 *   userId: string;
 *   query: string;
 *   conversationId?: string;
 *   limit?: number;
 *   includeGraph?: boolean;
 *   forceRefresh?: boolean;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, query, conversationId, limit, includeGraph, forceRefresh } =
      body;

    // Validate required fields
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'userId is required and must be a string' },
        { status: 400 }
      );
    }

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'query is required and must be a string' },
        { status: 400 }
      );
    }

    // Execute search
    const startTime = Date.now();
    const result = await retrievalService.search(userId, query, {
      conversationId,
      limit: limit || 10,
      includeGraph: includeGraph ?? true,
      forceRefresh: forceRefresh ?? false,
    });

    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        executionTime,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[API] /api/retrieval/search error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/retrieval/search
 *
 * Get cache statistics
 */
export async function GET() {
  try {
    const stats = retrievalService.getCacheStats();

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[API] /api/retrieval/search GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/retrieval/search
 *
 * Clear retrieval cache
 */
export async function DELETE() {
  try {
    retrievalService.clearCache();

    return NextResponse.json({
      success: true,
      message: 'Cache cleared',
    });
  } catch (error) {
    console.error('[API] /api/retrieval/search DELETE error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
