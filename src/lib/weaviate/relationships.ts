/**
 * Weaviate Relationship Storage
 *
 * Save, query, and visualize inferred relationships between entities.
 */

import { Filters } from 'weaviate-client';
import { getWeaviateClient } from './client';
import { RELATIONSHIP_COLLECTION } from './schema';
import type {
  InferredRelationship,
  RelationshipGraph,
  GraphNode,
  GraphEdge,
  RelationshipType,
} from '../relationships/types';
import type { EntityType } from '../extraction/types';

const LOG_PREFIX = '[Weaviate Relationships]';

// Color scheme for entity types in graph visualization
const TYPE_COLORS: Record<string, string> = {
  person: '#3b82f6', // blue
  company: '#22c55e', // green
  project: '#fbbf24', // yellow
  topic: '#a855f7', // purple
  location: '#ec4899', // pink
  action_item: '#ef4444', // red
  date: '#64748b', // gray
};

/**
 * Generate a unique key for a relationship to detect duplicates
 */
function getRelationshipKey(
  userId: string,
  fromEntityType: string,
  fromEntityValue: string,
  toEntityType: string,
  toEntityValue: string,
  relationshipType: string
): string {
  return `${userId}|${fromEntityType}|${fromEntityValue.toLowerCase()}|${toEntityType}|${toEntityValue.toLowerCase()}|${relationshipType}`;
}

/**
 * Check for existing relationships to prevent duplicates
 */
async function findExistingRelationshipKeys(
  collection: any,
  userId: string
): Promise<Set<string>> {
  const existingKeys = new Set<string>();

  try {
    const result = await collection.query.fetchObjects({
      filters: collection.filter.byProperty('userId').equal(userId),
      limit: 10000,
      returnProperties: [
        'fromEntityType',
        'fromEntityValue',
        'toEntityType',
        'toEntityValue',
        'relationshipType',
        'userId',
      ],
    });

    for (const obj of result.objects) {
      const key = getRelationshipKey(
        obj.properties.userId,
        obj.properties.fromEntityType,
        obj.properties.fromEntityValue,
        obj.properties.toEntityType,
        obj.properties.toEntityValue,
        obj.properties.relationshipType
      );
      existingKeys.add(key);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to fetch existing relationships for deduplication:`, error);
  }

  return existingKeys;
}

/**
 * Save inferred relationships to Weaviate
 * Checks for existing relationships before inserting to prevent duplicates.
 * A relationship is considered duplicate if it has the same:
 * userId + fromEntityType + fromEntityValue + toEntityType + toEntityValue + relationshipType
 */
export async function saveRelationships(
  relationships: InferredRelationship[],
  userId: string
): Promise<number> {
  if (relationships.length === 0) {
    console.log(`${LOG_PREFIX} No relationships to save`);
    return 0;
  }

  const client = await getWeaviateClient();
  const collection = client.collections.get(RELATIONSHIP_COLLECTION);

  console.log(`${LOG_PREFIX} Checking for duplicates among ${relationships.length} relationships...`);

  // Fetch existing relationship keys for this user
  const existingKeys = await findExistingRelationshipKeys(collection, userId);
  console.log(`${LOG_PREFIX} Found ${existingKeys.size} existing relationships for user`);

  // Filter out duplicates
  const uniqueRelationships = relationships.filter((rel) => {
    const key = getRelationshipKey(
      userId,
      rel.fromEntityType,
      rel.fromEntityValue,
      rel.toEntityType,
      rel.toEntityValue,
      rel.relationshipType
    );
    return !existingKeys.has(key);
  });

  const duplicateCount = relationships.length - uniqueRelationships.length;
  if (duplicateCount > 0) {
    console.log(`${LOG_PREFIX} Skipping ${duplicateCount} duplicate relationships`);
  }

  if (uniqueRelationships.length === 0) {
    console.log(`${LOG_PREFIX} No new relationships to save (all duplicates)`);
    return 0;
  }

  console.log(`${LOG_PREFIX} Saving ${uniqueRelationships.length} unique relationships...`);

  const objects = uniqueRelationships.map((rel) => ({
    fromEntityType: rel.fromEntityType,
    fromEntityValue: rel.fromEntityValue.toLowerCase(),
    toEntityType: rel.toEntityType,
    toEntityValue: rel.toEntityValue.toLowerCase(),
    relationshipType: rel.relationshipType,
    confidence: rel.confidence,
    evidence: rel.evidence,
    sourceId: rel.sourceId,
    userId,
    inferredAt: rel.inferredAt || new Date().toISOString(),
  }));

  try {
    const result = await collection.data.insertMany(objects);
    const insertedCount = result.uuids ? Object.keys(result.uuids).length : 0;
    console.log(`${LOG_PREFIX} Saved ${insertedCount} relationships`);
    return insertedCount;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save relationships:`, error);
    throw error;
  }
}

/**
 * Get relationships for a specific entity
 */
export async function getEntityRelationships(
  entityType: EntityType,
  entityValue: string,
  userId?: string
): Promise<InferredRelationship[]> {
  const client = await getWeaviateClient();
  const collection = client.collections.get(RELATIONSHIP_COLLECTION);
  const normalizedValue = entityValue.toLowerCase();

  console.log(`${LOG_PREFIX} Fetching relationships for ${entityType}: ${entityValue}`);

  try {
    // Build filter for entity match (from OR to) using Weaviate Filters API
    const fromFilter = Filters.and(
      collection.filter.byProperty('fromEntityType').equal(entityType),
      collection.filter.byProperty('fromEntityValue').equal(normalizedValue)
    );
    const toFilter = Filters.and(
      collection.filter.byProperty('toEntityType').equal(entityType),
      collection.filter.byProperty('toEntityValue').equal(normalizedValue)
    );
    const entityFilter = Filters.or(fromFilter, toFilter);

    // Combine with userId filter if provided
    const finalFilter = userId
      ? Filters.and(entityFilter, collection.filter.byProperty('userId').equal(userId))
      : entityFilter;

    const result = await collection.query.fetchObjects({
      filters: finalFilter,
      limit: 500,
      returnProperties: [
        'fromEntityType',
        'fromEntityValue',
        'toEntityType',
        'toEntityValue',
        'relationshipType',
        'confidence',
        'evidence',
        'sourceId',
        'userId',
        'inferredAt',
      ],
    });

    const relationships = result.objects.map((obj: any) => ({
      id: obj.uuid,
      fromEntityType: obj.properties.fromEntityType as EntityType,
      fromEntityValue: obj.properties.fromEntityValue,
      toEntityType: obj.properties.toEntityType as EntityType,
      toEntityValue: obj.properties.toEntityValue,
      relationshipType: obj.properties.relationshipType as RelationshipType,
      confidence: obj.properties.confidence,
      evidence: obj.properties.evidence,
      sourceId: obj.properties.sourceId,
      userId: obj.properties.userId,
      inferredAt: obj.properties.inferredAt,
    }));

    console.log(`${LOG_PREFIX} Found ${relationships.length} relationships`);
    return relationships;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to fetch relationships:`, error);
    return [];
  }
}

/**
 * Get all relationships for a user
 */
export async function getAllRelationships(
  userId?: string,
  limit: number = 1000
): Promise<InferredRelationship[]> {
  const client = await getWeaviateClient();
  const collection = client.collections.get(RELATIONSHIP_COLLECTION);

  console.log(`${LOG_PREFIX} Fetching all relationships${userId ? ` for user ${userId}` : ''}...`);

  try {
    // Build filter using Weaviate Filters API if userId is provided
    const filters = userId
      ? collection.filter.byProperty('userId').equal(userId)
      : undefined;

    const result = await collection.query.fetchObjects({
      filters,
      limit,
      returnProperties: [
        'fromEntityType',
        'fromEntityValue',
        'toEntityType',
        'toEntityValue',
        'relationshipType',
        'confidence',
        'evidence',
        'sourceId',
        'userId',
        'inferredAt',
      ],
    });

    const relationships = result.objects.map((obj: any) => ({
      id: obj.uuid,
      fromEntityType: obj.properties.fromEntityType as EntityType,
      fromEntityValue: obj.properties.fromEntityValue,
      toEntityType: obj.properties.toEntityType as EntityType,
      toEntityValue: obj.properties.toEntityValue,
      relationshipType: obj.properties.relationshipType as RelationshipType,
      confidence: obj.properties.confidence,
      evidence: obj.properties.evidence,
      sourceId: obj.properties.sourceId,
      userId: obj.properties.userId,
      inferredAt: obj.properties.inferredAt,
    }));

    console.log(`${LOG_PREFIX} Found ${relationships.length} total relationships`);
    return relationships;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to fetch relationships:`, error);
    return [];
  }
}

/**
 * Build a graph representation for visualization
 */
export async function buildRelationshipGraph(
  userId?: string,
  options?: {
    centerEntity?: { type: EntityType; value: string };
    maxDepth?: number;
    minConfidence?: number;
  }
): Promise<RelationshipGraph> {
  const relationships = await getAllRelationships(userId);
  const minConfidence = options?.minConfidence || 0.5;

  // Filter by confidence
  const filteredRels = relationships.filter((r) => r.confidence >= minConfidence);

  // Build nodes map
  const nodesMap = new Map<string, GraphNode>();
  const edgeCounts = new Map<string, number>();

  for (const rel of filteredRels) {
    // From node
    const fromId = `${rel.fromEntityType}:${rel.fromEntityValue}`;
    if (!nodesMap.has(fromId)) {
      nodesMap.set(fromId, {
        id: fromId,
        label: rel.fromEntityValue,
        type: rel.fromEntityType,
        color: TYPE_COLORS[rel.fromEntityType] || '#9ca3af',
        size: 1,
      });
    }
    edgeCounts.set(fromId, (edgeCounts.get(fromId) || 0) + 1);

    // To node
    const toId = `${rel.toEntityType}:${rel.toEntityValue}`;
    if (!nodesMap.has(toId)) {
      nodesMap.set(toId, {
        id: toId,
        label: rel.toEntityValue,
        type: rel.toEntityType,
        color: TYPE_COLORS[rel.toEntityType] || '#9ca3af',
        size: 1,
      });
    }
    edgeCounts.set(toId, (edgeCounts.get(toId) || 0) + 1);
  }

  // Update node sizes based on connections
  for (const [id, count] of Array.from(edgeCounts.entries())) {
    const node = nodesMap.get(id);
    if (node) {
      node.size = Math.min(5, 1 + Math.log2(count + 1));
    }
  }

  // Build edges (aggregate duplicates)
  const edgesMap = new Map<string, GraphEdge>();

  for (const rel of filteredRels) {
    const fromId = `${rel.fromEntityType}:${rel.fromEntityValue}`;
    const toId = `${rel.toEntityType}:${rel.toEntityValue}`;
    const edgeKey = `${fromId}:${rel.relationshipType}:${toId}`;

    const existing = edgesMap.get(edgeKey);
    if (existing) {
      existing.weight += rel.confidence;
    } else {
      edgesMap.set(edgeKey, {
        source: fromId,
        target: toId,
        type: rel.relationshipType,
        weight: rel.confidence,
        label: rel.relationshipType.replace(/_/g, ' ').toLowerCase(),
      });
    }
  }

  const nodes = Array.from(nodesMap.values());
  const edges = Array.from(edgesMap.values());

  // Calculate average connections
  const totalConnections = edges.length * 2;
  const avgConnections = nodes.length > 0 ? totalConnections / nodes.length : 0;

  return {
    nodes,
    edges,
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      avgConnections: Math.round(avgConnections * 100) / 100,
    },
  };
}

/**
 * Get relationship statistics
 */
export async function getRelationshipStats(userId?: string): Promise<{
  total: number;
  byType: Record<string, number>;
  avgConfidence: number;
}> {
  const relationships = await getAllRelationships(userId);

  const byType: Record<string, number> = {};
  let totalConfidence = 0;

  for (const rel of relationships) {
    byType[rel.relationshipType] = (byType[rel.relationshipType] || 0) + 1;
    totalConfidence += rel.confidence;
  }

  return {
    total: relationships.length,
    byType,
    avgConfidence:
      relationships.length > 0
        ? Math.round((totalConfidence / relationships.length) * 100) / 100
        : 0,
  };
}

/**
 * Delete a single relationship by ID
 * Verifies the relationship belongs to the specified user before deletion.
 */
export async function deleteRelationshipById(
  id: string,
  userId: string
): Promise<boolean> {
  const client = await getWeaviateClient();
  const collection = client.collections.get(RELATIONSHIP_COLLECTION);

  try {
    // Fetch the relationship to verify ownership
    const result = await collection.query.fetchObjectById(id, {
      returnProperties: ['userId'],
    });

    if (!result) {
      console.log(`${LOG_PREFIX} Relationship ${id} not found`);
      return false;
    }

    // Verify the relationship belongs to this user
    if (result.properties.userId !== userId) {
      console.log(`${LOG_PREFIX} Relationship ${id} does not belong to user ${userId}`);
      return false;
    }

    // Delete the relationship
    await collection.data.deleteById(id);
    console.log(`${LOG_PREFIX} Deleted relationship ${id}`);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to delete relationship ${id}:`, error);
    return false;
  }
}

/**
 * Delete relationships for a source
 */
export async function deleteRelationshipsBySource(
  sourceId: string,
  userId: string
): Promise<number> {
  const client = await getWeaviateClient();
  const collection = client.collections.get(RELATIONSHIP_COLLECTION);

  try {
    // Use Weaviate Filters API to filter at database level
    const filters = Filters.and(
      collection.filter.byProperty('sourceId').equal(sourceId),
      collection.filter.byProperty('userId').equal(userId)
    );

    const result = await collection.query.fetchObjects({
      filters,
      limit: 1000,
      returnProperties: ['sourceId', 'userId'],
    });

    for (const obj of result.objects) {
      await collection.data.deleteById(obj.uuid);
    }

    console.log(`${LOG_PREFIX} Deleted ${result.objects.length} relationships for source ${sourceId}`);
    return result.objects.length;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to delete relationships:`, error);
    return 0;
  }
}
