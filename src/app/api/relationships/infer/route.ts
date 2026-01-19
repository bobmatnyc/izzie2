/**
 * Relationship Inference Preview API Route
 * POST /api/relationships/infer - Preview inference without saving
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { inferRelationships } from '@/lib/relationships/inference';
import type { Entity } from '@/lib/extraction/types';

const LOG_PREFIX = '[Relationships Infer API]';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const { sourceId, content, entities } = body as { sourceId: string; content: string; entities: Entity[] };

    if (!sourceId || !content || !entities || entities.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceId, content, entities' },
        { status: 400 }
      );
    }

    console.log(`${LOG_PREFIX} Preview inference from ${entities.length} entities`);

    const startTime = Date.now();
    const result = await inferRelationships(entities, content, sourceId, userId);
    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      relationships: result.relationships,
      count: result.relationships.length,
      processingTime,
      tokenCost: result.tokenCost,
      preview: true,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return NextResponse.json(
      { error: 'Failed to infer relationships', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
