/**
 * Bulk Relationship Inference API Route
 * POST /api/relationships/bulk-infer - Infer relationships from all entities
 *
 * Groups entities by sourceId and runs inference on each group
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { inferRelationships } from '@/lib/relationships/inference';
import { saveRelationships } from '@/lib/weaviate/relationships';
import { listEntitiesByType } from '@/lib/weaviate/entities';
import type { Entity } from '@/lib/extraction/types';

const LOG_PREFIX = '[Relationships Bulk Infer API]';

// Types for entity data from Weaviate
interface WeaviateEntity {
  type: string;
  value: string;
  normalized: string;
  confidence: number;
  source: string;
  sourceId: string;
  context?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const limit = Math.min(body.limit || 100, 500); // Max 500 entities per batch
    const entityTypes = body.entityTypes || ['person', 'company', 'project'];

    console.log(`${LOG_PREFIX} Starting bulk inference for user ${userId}`);
    console.log(`${LOG_PREFIX} Entity types: ${entityTypes.join(', ')}, limit: ${limit}`);

    const startTime = Date.now();
    let totalRelationships = 0;
    let totalCost = 0;
    const errors: string[] = [];

    // Fetch entities of specified types
    const allEntities: WeaviateEntity[] = [];
    for (const type of entityTypes) {
      try {
        const entities = await listEntitiesByType(userId, type, limit);
        allEntities.push(
          ...entities.map((e: any) => ({
            type: e.type || type,
            value: e.value,
            normalized: e.normalized,
            confidence: e.confidence,
            source: e.source,
            sourceId: e.sourceId,
            context: e.context,
          }))
        );
      } catch (err) {
        console.error(`${LOG_PREFIX} Error fetching ${type} entities:`, err);
        errors.push(`Failed to fetch ${type} entities`);
      }
    }

    console.log(`${LOG_PREFIX} Fetched ${allEntities.length} entities total`);

    if (allEntities.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No entities found to process',
        totalRelationships: 0,
        totalCost: 0,
        processingTime: Date.now() - startTime,
      });
    }

    // Group entities by sourceId
    const entityGroups = new Map<string, WeaviateEntity[]>();
    for (const entity of allEntities) {
      const sourceId = entity.sourceId || 'unknown';
      if (!entityGroups.has(sourceId)) {
        entityGroups.set(sourceId, []);
      }
      entityGroups.get(sourceId)!.push(entity);
    }

    console.log(`${LOG_PREFIX} Grouped into ${entityGroups.size} sources`);

    // Process each group (limit to first 20 sources to avoid timeout)
    const maxSources = Math.min(entityGroups.size, 20);
    let processedSources = 0;

    for (const [sourceId, entities] of entityGroups) {
      if (processedSources >= maxSources) break;

      // Skip groups with too few entities
      if (entities.length < 2) continue;

      try {
        // Build context from entity contexts
        const contextParts = entities
          .filter((e) => e.context)
          .map((e) => e.context)
          .slice(0, 5);
        const content =
          contextParts.length > 0
            ? contextParts.join('\n\n')
            : `Entities from source ${sourceId}: ${entities.map((e) => `${e.type}: ${e.value}`).join(', ')}`;

        // Convert to Entity type for inference
        const inferenceEntities: Entity[] = entities.map((e) => ({
          type: e.type as Entity['type'],
          value: e.value,
          normalized: e.normalized,
          confidence: e.confidence,
          source: e.source as Entity['source'],
        }));

        const result = await inferRelationships(inferenceEntities, content, sourceId, userId);

        if (result.relationships.length > 0) {
          await saveRelationships(result.relationships, userId);
          totalRelationships += result.relationships.length;
        }
        totalCost += result.tokenCost;
        processedSources++;
      } catch (err) {
        console.error(`${LOG_PREFIX} Error processing source ${sourceId}:`, err);
        errors.push(`Failed to process source: ${sourceId}`);
      }
    }

    const processingTime = Date.now() - startTime;

    console.log(
      `${LOG_PREFIX} Completed: ${totalRelationships} relationships from ${processedSources} sources in ${processingTime}ms`
    );

    return NextResponse.json({
      success: true,
      totalRelationships,
      totalCost: Math.round(totalCost * 10000) / 10000,
      sourcesProcessed: processedSources,
      totalSources: entityGroups.size,
      entitiesProcessed: allEntities.length,
      processingTime,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return NextResponse.json(
      {
        error: 'Failed to run bulk inference',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
