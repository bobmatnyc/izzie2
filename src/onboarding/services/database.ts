/**
 * Onboarding Database Service
 *
 * Wraps Weaviate entity/relationship storage with PostgreSQL day tracking.
 * Provides userId-scoped operations for multi-user support.
 *
 * This service is the single source of truth for onboarding data:
 * - Entities stored in Weaviate (tenant-isolated per userId)
 * - Relationships stored in Weaviate (tenant-isolated per userId)
 * - Day tracking stored in PostgreSQL training_progress table
 * - Feedback stored in-memory (handled by FeedbackService)
 */

import {
  saveEntities,
  getEntityStats,
  listEntitiesByType,
} from '@/lib/weaviate/entities';
import {
  saveRelationships,
  getAllRelationships,
  getRelationshipStats,
} from '@/lib/weaviate/relationships';
import { dbClient } from '@/lib/db/client';
import { trainingProgress, TRAINING_SOURCE_TYPE } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { Entity, EntityType } from '@/lib/extraction/types';
import type { InferredRelationship } from '@/lib/relationships/types';
import type { InlineRelationship } from '@/lib/extraction/types';

const LOG_PREFIX = '[OnboardingDatabase]';

/**
 * Processing statistics including database counts
 */
export interface ProcessingStats {
  // Entity counts by type
  entities: {
    person: number;
    company: number;
    project: number;
    tool: number;
    topic: number;
    location: number;
    action_item: number;
    total: number;
  };
  // Relationship counts
  relationships: {
    total: number;
    byType: Record<string, number>;
    avgConfidence: number;
  };
  // Day tracking
  daysProcessed: number;
  processedDates: string[];
}

/**
 * Onboarding Database Service
 * Multi-tenant database operations for onboarding flow
 */
export class OnboardingDatabase {
  constructor(private userId: string) {
    console.log(`${LOG_PREFIX} Initialized for user ${userId}`);
  }

  /**
   * Save entities to Weaviate (tenant-isolated)
   * @param entities - Array of entities to save
   * @param sourceId - Email/source ID for tracking
   */
  async saveEntities(entities: Entity[], sourceId: string): Promise<void> {
    if (entities.length === 0) {
      console.log(`${LOG_PREFIX} No entities to save`);
      return;
    }

    console.log(`${LOG_PREFIX} Saving ${entities.length} entities for user ${this.userId}`);
    await saveEntities(entities, this.userId, sourceId);
  }

  /**
   * Get all entities for this user, optionally filtered by type
   */
  async getEntitiesByUser(
    entityType?: EntityType
  ): Promise<(Entity & { sourceId?: string; extractedAt?: string })[]> {
    console.log(`${LOG_PREFIX} Fetching entities for user ${this.userId}`);

    if (entityType) {
      return await listEntitiesByType(this.userId, entityType);
    }

    // Get all entity types
    const allTypes: EntityType[] = [
      'person',
      'company',
      'project',
      'tool',
      'topic',
      'location',
      'action_item',
    ];

    const allEntities: (Entity & { sourceId?: string; extractedAt?: string })[] = [];
    for (const type of allTypes) {
      const entities = await listEntitiesByType(this.userId, type);
      allEntities.push(...entities);
    }

    return allEntities;
  }

  /**
   * Save relationships to Weaviate (tenant-isolated)
   * Converts inline relationships to InferredRelationship format
   */
  async saveRelationships(
    relationships: InlineRelationship[],
    sourceId: string
  ): Promise<number> {
    if (relationships.length === 0) {
      console.log(`${LOG_PREFIX} No relationships to save`);
      return 0;
    }

    console.log(`${LOG_PREFIX} Saving ${relationships.length} relationships for user ${this.userId}`);

    // Convert InlineRelationship[] to InferredRelationship[] format
    // Note: id will be assigned by Weaviate, so we cast to InferredRelationship
    const inferredRelationships = relationships.map((rel) => ({
      fromEntityType: rel.fromType,
      fromEntityValue: rel.fromValue,
      toEntityType: rel.toType,
      toEntityValue: rel.toValue,
      relationshipType: rel.relationshipType,
      confidence: rel.confidence,
      evidence: rel.evidence || '',
      sourceId,
      userId: this.userId,
      inferredAt: new Date().toISOString(),
      status: 'active' as const,
    })) as InferredRelationship[];

    return await saveRelationships(inferredRelationships, this.userId);
  }

  /**
   * Get all relationships for this user
   */
  async getRelationshipsByUser(limit: number = 1000): Promise<InferredRelationship[]> {
    console.log(`${LOG_PREFIX} Fetching relationships for user ${this.userId}`);
    return await getAllRelationships(this.userId, limit);
  }

  /**
   * Mark a day as processed in training_progress table
   * @param date - Date string in YYYY-MM-DD format
   * @param sourceType - 'email' or 'calendar'
   * @param itemsFound - Number of items found for this day
   */
  async markDayProcessed(
    date: string,
    sourceType: 'email' | 'calendar',
    itemsFound: number,
    sessionId?: string
  ): Promise<void> {
    console.log(`${LOG_PREFIX} Marking ${date} as processed (${sourceType}, ${itemsFound} items)`);

    const db = dbClient.getDb();
    await db.insert(trainingProgress).values({
      userId: this.userId,
      sessionId: sessionId || null,
      sourceType,
      processedDate: date,
      itemsFound,
      processedAt: new Date(),
    });
  }

  /**
   * Check if a day has been processed
   * @param date - Date string in YYYY-MM-DD format
   * @param sourceType - 'email' or 'calendar'
   */
  async isDayProcessed(date: string, sourceType: 'email' | 'calendar'): Promise<boolean> {
    const db = dbClient.getDb();
    const result = await db
      .select()
      .from(trainingProgress)
      .where(
        and(
          eq(trainingProgress.userId, this.userId),
          eq(trainingProgress.sourceType, sourceType),
          eq(trainingProgress.processedDate, date)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Get all processed days for this user
   * @param sourceType - Optional filter by 'email' or 'calendar'
   */
  async getProcessedDays(sourceType?: 'email' | 'calendar'): Promise<string[]> {
    const db = dbClient.getDb();
    const conditions = [eq(trainingProgress.userId, this.userId)];

    if (sourceType) {
      conditions.push(eq(trainingProgress.sourceType, sourceType));
    }

    const result = await db
      .select({
        processedDate: trainingProgress.processedDate,
      })
      .from(trainingProgress)
      .where(and(...conditions))
      .orderBy(trainingProgress.processedDate);

    return result.map((row: { processedDate: string }) => row.processedDate);
  }

  /**
   * Get the last processed day for this user
   * @param sourceType - Optional filter by 'email' or 'calendar'
   */
  async getLastProcessedDay(sourceType?: 'email' | 'calendar'): Promise<string | null> {
    const db = dbClient.getDb();
    const conditions = [eq(trainingProgress.userId, this.userId)];

    if (sourceType) {
      conditions.push(eq(trainingProgress.sourceType, sourceType));
    }

    const result = await db
      .select({
        processedDate: trainingProgress.processedDate,
      })
      .from(trainingProgress)
      .where(and(...conditions))
      .orderBy(trainingProgress.processedDate)
      .limit(1);

    return result.length > 0 ? result[0].processedDate : null;
  }

  /**
   * Get processing statistics from database
   * Includes entity counts, relationship counts, and day tracking
   */
  async getProcessingStats(): Promise<ProcessingStats> {
    console.log(`${LOG_PREFIX} Fetching processing stats for user ${this.userId}`);

    // Get entity stats from Weaviate
    const entityStats = await getEntityStats(this.userId);

    // Get relationship stats from Weaviate
    const relationshipStats = await getRelationshipStats(this.userId);

    // Get processed days from PostgreSQL
    const processedDates = await this.getProcessedDays();

    return {
      entities: {
        person: entityStats.person || 0,
        company: entityStats.company || 0,
        project: entityStats.project || 0,
        tool: entityStats.tool || 0,
        topic: entityStats.topic || 0,
        location: entityStats.location || 0,
        action_item: entityStats.action_item || 0,
        total: Object.values(entityStats).reduce((sum, count) => sum + count, 0),
      },
      relationships: {
        total: relationshipStats.total,
        byType: relationshipStats.byType,
        avgConfidence: relationshipStats.avgConfidence,
      },
      daysProcessed: processedDates.length,
      processedDates,
    };
  }

  /**
   * Flush all data for this user (entities, relationships, progress)
   * WARNING: This is destructive and cannot be undone
   */
  async flushAll(): Promise<void> {
    console.log(`${LOG_PREFIX} Flushing all data for user ${this.userId}`);

    // Delete training progress from PostgreSQL
    const db = dbClient.getDb();
    await db
      .delete(trainingProgress)
      .where(eq(trainingProgress.userId, this.userId));

    // Note: Weaviate entities/relationships are tenant-isolated and cleaned up
    // automatically when the tenant is removed. For the onboarding flow,
    // we rely on the Weaviate tenant isolation to handle cleanup.

    console.log(`${LOG_PREFIX} Flush complete for user ${this.userId}`);
  }
}

/**
 * Factory function to create OnboardingDatabase with userId
 */
export function createOnboardingDatabase(userId: string): OnboardingDatabase {
  return new OnboardingDatabase(userId);
}
