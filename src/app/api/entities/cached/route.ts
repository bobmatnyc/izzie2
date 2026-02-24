/**
 * Cached Entity API Route
 *
 * Demonstrates API response caching for expensive database operations.
 * This route adds caching to the entities endpoint to improve performance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { rateLimit, getClientIP, getRetryAfterSeconds } from '@/lib/rate-limit';
import { listEntitiesByType } from '@/lib/weaviate/entities';
import { createAPICacheMiddleware, APICacheConfigs } from '@/lib/cache';
import type { EntityType } from '@/lib/extraction/types';

const LOG_PREFIX = '[Entities API Cached]';

// Valid entity types
const VALID_TYPES: EntityType[] = [
  'person',
  'company',
  'project',
  'topic',
  'location',
  'action_item',
];

interface EntityData {
  id: string;
  type: string;
  value: string;
  normalized: string;
  confidence: number;
  source: string;
  context?: string;
  assignee?: string;
  deadline?: string;
  priority?: string;
  sourceId: string;
  createdAt: string;
  occurrences?: number;
}

// Create cache middleware with user-specific caching
const withCache = createAPICacheMiddleware({
  ...APICacheConfigs.mediumTerm, // 5 minutes, user-specific
  keyGenerator: (request, userId) => {
    const url = new URL(request.url);
    const typeParam = url.searchParams.get('type') || 'all';
    const limit = url.searchParams.get('limit') || '500';
    return `entities:user:${userId}:type:${typeParam}:limit:${limit}`;
  },
});

async function getEntitiesHandler(request: NextRequest): Promise<NextResponse> {
  try {
    // Require authentication and filter by userId
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Rate limiting
    const identifier = userId || getClientIP(request);
    const isAuthenticated = !!userId;
    const rateLimitResult = await rateLimit(identifier, isAuthenticated);

    if (!rateLimitResult.success) {
      const retryAfter = rateLimitResult.reset
        ? getRetryAfterSeconds(rateLimitResult.reset)
        : 60;
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          remaining: rateLimitResult.remaining,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          },
        }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type');
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 1000);

    console.log(`${LOG_PREFIX} Fetching entities type=${typeParam || 'all'} for user ${userId} (with caching)`);

    const entities: EntityData[] = [];
    const stats: Record<string, number> = {};

    // Determine which types to fetch
    const typesToFetch: EntityType[] = typeParam
      ? [typeParam as EntityType]
      : VALID_TYPES;

    // Fetch entities from Weaviate for each type
    for (const entityType of typesToFetch) {
      try {
        const typeEntities = await listEntitiesByType(userId, entityType, limit);

        for (const entity of typeEntities) {
          entities.push({
            id: `${entityType}-${entity.normalized || entity.value}`.replace(/\s+/g, '-'),
            type: entityType,
            value: entity.value || '',
            normalized: entity.normalized || entity.value || '',
            confidence: entity.confidence || 0,
            source: entity.source || 'unknown',
            context: entity.context,
            assignee: (entity as any).assignee,
            deadline: (entity as any).deadline,
            priority: (entity as any).priority,
            sourceId: entity.sourceId || '',
            createdAt: entity.extractedAt || new Date().toISOString(),
          });
        }

        stats[entityType] = typeEntities.length;
      } catch (error) {
        console.error(`${LOG_PREFIX} Error fetching ${entityType} entities:`, error);
        stats[entityType] = 0;
      }
    }

    // Deduplicate entities by type + normalized key
    console.log(`${LOG_PREFIX} Deduplicating ${entities.length} entities...`);
    const entityMap = new Map<string, EntityData>();

    for (const entity of entities) {
      const key = `${entity.type}:${entity.normalized.toLowerCase()}`;
      const existing = entityMap.get(key);

      if (!existing) {
        // First occurrence
        entityMap.set(key, { ...entity, occurrences: 1 });
      } else {
        // Update occurrences count
        existing.occurrences = (existing.occurrences || 1) + 1;

        // Determine if we should replace the existing entity
        const shouldReplace =
          entity.confidence > existing.confidence ||
          (entity.confidence === existing.confidence &&
            entity.value.length > existing.value.length) ||
          (entity.confidence === existing.confidence &&
            entity.value.length === existing.value.length &&
            new Date(entity.createdAt).getTime() > new Date(existing.createdAt).getTime());

        if (shouldReplace) {
          entityMap.set(key, { ...entity, occurrences: existing.occurrences });
        }
      }
    }

    const deduplicatedEntities = Array.from(entityMap.values());
    console.log(`${LOG_PREFIX} Deduplicated to ${deduplicatedEntities.length} unique entities`);

    // Sort by createdAt descending
    deduplicatedEntities.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Apply limit after deduplication
    const limitedEntities = deduplicatedEntities.slice(0, limit);

    console.log(`${LOG_PREFIX} Returning ${limitedEntities.length} cached entities`);

    return NextResponse.json({
      entities: limitedEntities,
      stats,
      total: limitedEntities.length,
      limit,
      cached: true, // Indicate this endpoint uses caching
      cacheInfo: {
        ttl: APICacheConfigs.mediumTerm.ttl,
        userSpecific: true,
      },
    });

  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to fetch entities:`, error);
    return NextResponse.json(
      {
        error: 'Failed to fetch entities',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Apply cache middleware to the handler
export const GET = withCache(getEntitiesHandler);
