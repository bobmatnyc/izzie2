/**
 * Relationship Graph API Route
 * GET /api/relationships/graph - Get graph data for visualization
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { buildRelationshipGraph } from '@/lib/weaviate/relationships';

const LOG_PREFIX = '[Relationships Graph API]';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType') || undefined;
    const entityValue = searchParams.get('entityValue') || undefined;
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0.5');

    console.log(`${LOG_PREFIX} Building graph for user ${userId}`);

    const graph = await buildRelationshipGraph(userId, {
      centerEntity: entityType && entityValue
        ? { type: entityType as any, value: entityValue }
        : undefined,
      minConfidence,
    });

    console.log(`${LOG_PREFIX} Returning ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
    console.log(`${LOG_PREFIX} Sample node:`, graph.nodes[0]);

    return NextResponse.json(
      {
        nodes: graph.nodes,
        edges: graph.edges,
        stats: {
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return NextResponse.json(
      { error: 'Failed to build relationship graph', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
