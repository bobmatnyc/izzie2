/**
 * Relationships API Route
 * GET /api/relationships - List relationships
 * POST /api/relationships - Infer and save relationships
 * DELETE /api/relationships?id=<id> - Delete a single relationship
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { inferRelationships } from '@/lib/relationships/inference';
import { saveRelationships, getAllRelationships, getEntityRelationships, deleteRelationshipById } from '@/lib/weaviate/relationships';
import type { Entity, EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Relationships API]';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType');
    const entityValue = searchParams.get('entityValue');
    const relationshipType = searchParams.get('relationshipType');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 1000);

    console.log(`${LOG_PREFIX} Fetching relationships for user ${userId}`);

    let relationships;
    if (entityType && entityValue) {
      relationships = await getEntityRelationships(entityType as EntityType, entityValue, userId);
    } else {
      relationships = await getAllRelationships(userId, limit);
    }

    // Filter by relationship type if specified
    if (relationshipType) {
      relationships = relationships.filter(r => r.relationshipType === relationshipType);
    }

    return NextResponse.json({
      relationships,
      total: relationships.length,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch relationships', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

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

    console.log(`${LOG_PREFIX} Inferring relationships from ${entities.length} entities`);

    const startTime = Date.now();
    const result = await inferRelationships(entities, content, sourceId, userId);
    const processingTime = Date.now() - startTime;

    if (result.relationships.length > 0) {
      await saveRelationships(result.relationships, userId);
    }

    return NextResponse.json({
      relationships: result.relationships,
      count: result.relationships.length,
      processingTime,
      tokenCost: result.tokenCost,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return NextResponse.json(
      { error: 'Failed to infer relationships', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required query parameter: id' },
        { status: 400 }
      );
    }

    console.log(`${LOG_PREFIX} Deleting relationship ${id} for user ${userId}`);

    const deleted = await deleteRelationshipById(id, userId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Relationship not found or does not belong to user' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Relationship deleted successfully',
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return NextResponse.json(
      { error: 'Failed to delete relationship', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
