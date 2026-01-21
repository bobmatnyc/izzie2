/**
 * Relationship Converter
 *
 * Converts InlineRelationship (from extraction) to InferredRelationship (for storage).
 * Enables inline relationship extraction to be saved alongside separately inferred relationships.
 */

import type { InlineRelationship, InlineRelationshipType } from './types';
import type { InferredRelationship, RelationshipType } from '../relationships/types';

/**
 * Convert an inline relationship to an inferred relationship for storage
 *
 * @param inline - The inline relationship extracted during entity extraction
 * @param sourceId - The source email/document ID
 * @param userId - The user ID
 * @returns InferredRelationship ready for storage
 */
export function convertToInferredRelationship(
  inline: InlineRelationship,
  sourceId: string,
  userId: string
): InferredRelationship {
  return {
    fromEntityType: inline.fromType,
    fromEntityValue: inline.fromValue.toLowerCase(),
    toEntityType: inline.toType,
    toEntityValue: inline.toValue.toLowerCase(),
    relationshipType: inline.relationshipType as RelationshipType,
    confidence: inline.confidence,
    evidence: inline.evidence,
    sourceId,
    inferredAt: new Date().toISOString(),
    userId,
  };
}

/**
 * Convert multiple inline relationships to inferred relationships for storage
 *
 * @param relationships - Array of inline relationships
 * @param sourceId - The source email/document ID
 * @param userId - The user ID
 * @returns Array of InferredRelationship ready for storage
 */
export function convertToInferredRelationships(
  relationships: InlineRelationship[],
  sourceId: string,
  userId: string
): InferredRelationship[] {
  return relationships.map((rel) => convertToInferredRelationship(rel, sourceId, userId));
}

/**
 * Deduplicate inline relationships by key (fromType:fromValue:relType:toType:toValue)
 * Keeps the relationship with highest confidence for each unique key.
 *
 * @param relationships - Array of inline relationships to deduplicate
 * @returns Deduplicated array keeping highest confidence per unique relationship
 */
export function deduplicateInlineRelationships(
  relationships: InlineRelationship[]
): InlineRelationship[] {
  const map = new Map<string, InlineRelationship>();

  for (const rel of relationships) {
    const key = `${rel.fromType}:${rel.fromValue.toLowerCase()}:${rel.relationshipType}:${rel.toType}:${rel.toValue.toLowerCase()}`;

    const existing = map.get(key);
    if (!existing || rel.confidence > existing.confidence) {
      map.set(key, rel);
    }
  }

  return Array.from(map.values());
}
