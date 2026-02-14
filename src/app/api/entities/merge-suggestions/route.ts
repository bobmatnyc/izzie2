/**
 * Merge Suggestions API Route
 *
 * Phase 1 Entity Resolution: Human-in-the-loop entity merging
 *
 * GET /api/entities/merge-suggestions
 *   List pending merge suggestions for the current user
 *   Query params:
 *     - status: 'pending' | 'accepted' | 'rejected' | 'all' (default: 'pending')
 *     - limit: Max results (default: 50)
 *     - offset: Pagination offset (default: 0)
 *
 * POST /api/entities/merge-suggestions
 *   Create new merge suggestions from entity matching
 *   Body: { entities?: Entity[], autoAccept?: boolean }
 *
 * PATCH /api/entities/merge-suggestions
 *   Update suggestion status (accept/reject)
 *   Body: { id: string, status: 'accepted' | 'rejected' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth';
import { rateLimit, getClientIP, getRetryAfterSeconds } from '@/lib/rate-limit';
import { dbClient } from '@/lib/db';
import {
  mergeSuggestions,
  MERGE_SUGGESTION_STATUS,
  type MergeSuggestion,
} from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  findPotentialMatches,
  createMergeSuggestions,
} from '@/lib/extraction/entity-matcher';
import type { Entity } from '@/lib/extraction/types';

const LOG_PREFIX = '[MergeSuggestions API]';

/**
 * GET /api/entities/merge-suggestions
 * List merge suggestions for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Rate limiting
    const identifier = userId || getClientIP(request);
    const rateLimitResult = await rateLimit(identifier, true);
    if (!rateLimitResult.success) {
      const retryAfter = rateLimitResult.reset
        ? getRetryAfterSeconds(rateLimitResult.reset)
        : 60;
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    console.log(`${LOG_PREFIX} Fetching suggestions status=${status} limit=${limit} offset=${offset}`);

    const db = dbClient.getDb();

    // Build query based on status filter
    let suggestions: MergeSuggestion[];
    let total: number;

    if (status === 'all') {
      // Fetch all statuses
      suggestions = await db
        .select()
        .from(mergeSuggestions)
        .where(eq(mergeSuggestions.userId, userId))
        .orderBy(desc(mergeSuggestions.confidence), desc(mergeSuggestions.createdAt))
        .limit(limit)
        .offset(offset);

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(mergeSuggestions)
        .where(eq(mergeSuggestions.userId, userId));
      total = Number(countResult[0]?.count || 0);
    } else {
      // Filter by specific status
      suggestions = await db
        .select()
        .from(mergeSuggestions)
        .where(
          and(
            eq(mergeSuggestions.userId, userId),
            eq(mergeSuggestions.status, status)
          )
        )
        .orderBy(desc(mergeSuggestions.confidence), desc(mergeSuggestions.createdAt))
        .limit(limit)
        .offset(offset);

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(mergeSuggestions)
        .where(
          and(
            eq(mergeSuggestions.userId, userId),
            eq(mergeSuggestions.status, status)
          )
        );
      total = Number(countResult[0]?.count || 0);
    }

    console.log(`${LOG_PREFIX} Found ${suggestions.length} suggestions (total: ${total})`);

    // Get summary stats
    const statsResult = await db
      .select({
        status: mergeSuggestions.status,
        count: sql<number>`count(*)`,
      })
      .from(mergeSuggestions)
      .where(eq(mergeSuggestions.userId, userId))
      .groupBy(mergeSuggestions.status);

    const stats = {
      pending: 0,
      accepted: 0,
      rejected: 0,
    };
    for (const row of statsResult) {
      if (row.status in stats) {
        stats[row.status as keyof typeof stats] = Number(row.count);
      }
    }

    return NextResponse.json({
      suggestions,
      total,
      limit,
      offset,
      stats,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching suggestions:`, error);

    // Handle authentication errors
    if (error instanceof Error && error.name === 'AuthenticationError') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch merge suggestions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/entities/merge-suggestions
 * Create new merge suggestions from entity matching
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Rate limiting
    const identifier = userId || getClientIP(request);
    const rateLimitResult = await rateLimit(identifier, true);
    if (!rateLimitResult.success) {
      const retryAfter = rateLimitResult.reset
        ? getRetryAfterSeconds(rateLimitResult.reset)
        : 60;
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const body = await request.json();
    const { entities, autoAccept = false } = body as {
      entities?: Entity[];
      autoAccept?: boolean;
    };

    if (!entities || entities.length === 0) {
      return NextResponse.json(
        { error: 'entities array is required' },
        { status: 400 }
      );
    }

    console.log(`${LOG_PREFIX} Finding matches for ${entities.length} entities`);

    // Find potential matches
    const matches = await findPotentialMatches(entities, userId);

    console.log(`${LOG_PREFIX} Found ${matches.length} potential matches`);

    // Create merge suggestions
    const { created, autoAccepted } = await createMergeSuggestions(
      matches,
      userId,
      autoAccept
    );

    return NextResponse.json({
      message: 'Merge suggestions created',
      matchesFound: matches.length,
      suggestionsCreated: created,
      autoAccepted,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating suggestions:`, error);

    // Handle authentication errors
    if (error instanceof Error && error.name === 'AuthenticationError') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create merge suggestions' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/entities/merge-suggestions
 * Update suggestion status (accept/reject)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Rate limiting
    const identifier = userId || getClientIP(request);
    const rateLimitResult = await rateLimit(identifier, true);
    if (!rateLimitResult.success) {
      const retryAfter = rateLimitResult.reset
        ? getRetryAfterSeconds(rateLimitResult.reset)
        : 60;
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const body = await request.json();
    const { id, status } = body as { id: string; status: string };

    if (!id || !status) {
      return NextResponse.json(
        { error: 'id and status are required' },
        { status: 400 }
      );
    }

    if (!['accepted', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be "accepted" or "rejected"' },
        { status: 400 }
      );
    }

    console.log(`${LOG_PREFIX} Updating suggestion ${id} to status=${status}`);

    const db = dbClient.getDb();

    // Verify ownership and update
    const [suggestion] = await db
      .select()
      .from(mergeSuggestions)
      .where(
        and(
          eq(mergeSuggestions.id, id),
          eq(mergeSuggestions.userId, userId)
        )
      )
      .limit(1);

    if (!suggestion) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    // Update status
    await db
      .update(mergeSuggestions)
      .set({
        status,
        reviewedAt: new Date(),
      })
      .where(eq(mergeSuggestions.id, id));

    // If accepted, create SAME_AS relationship (Phase 2)
    // For now, just log that it was accepted
    if (status === 'accepted') {
      console.log(`${LOG_PREFIX} Accepted merge: ${suggestion.entity1Value} <-> ${suggestion.entity2Value}`);
      // TODO Phase 2: Create SAME_AS relationship in graph database
      // await createSameAsRelationship(userId, suggestion);
    }

    return NextResponse.json({
      message: `Suggestion ${status}`,
      id,
      status,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error updating suggestion:`, error);

    // Handle authentication errors
    if (error instanceof Error && error.name === 'AuthenticationError') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update merge suggestion' },
      { status: 500 }
    );
  }
}
