/**
 * Graph Builder
 *
 * Builds Neo4j knowledge graph from extracted entities.
 * Handles incremental updates using MERGE for deduplication.
 */

import { neo4jClient } from './neo4j-client';
import { entityTypeToNodeLabel, type NodeLabel } from './types';
import type {
  Entity,
  ExtractionResult,
  EntityCoOccurrence,
} from '@/lib/extraction/types';

/**
 * Create or update an entity node
 */
export async function createEntityNode(
  entity: Entity,
  emailId: string
): Promise<void> {
  const label = entityTypeToNodeLabel(entity.type);

  // Build MERGE query for entity node
  const cypher = `
    MERGE (n:${label} {normalized: $normalized})
    ON CREATE SET
      n.name = $name,
      n.frequency = 1,
      n.confidence = $confidence,
      n.firstSeen = datetime($timestamp),
      n.lastSeen = datetime($timestamp)
    ON MATCH SET
      n.frequency = n.frequency + 1,
      n.confidence = (n.confidence + $confidence) / 2,
      n.lastSeen = datetime($timestamp)
    RETURN n
  `;

  await neo4jClient.runQuery(cypher, {
    normalized: entity.normalized,
    name: entity.value,
    confidence: entity.confidence,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create or update an email node
 */
export async function createEmailNode(email: {
  id: string;
  subject?: string;
  timestamp: Date;
  significanceScore?: number;
  threadId?: string;
  from?: string;
  to?: string[];
  cc?: string[];
}): Promise<void> {
  const cypher = `
    MERGE (e:Email {id: $id})
    ON CREATE SET
      e.subject = $subject,
      e.timestamp = datetime($timestamp),
      e.significanceScore = $significanceScore,
      e.threadId = $threadId,
      e.from = $from,
      e.to = $to,
      e.cc = $cc
    ON MATCH SET
      e.subject = $subject,
      e.timestamp = datetime($timestamp),
      e.significanceScore = coalesce($significanceScore, e.significanceScore),
      e.threadId = coalesce($threadId, e.threadId)
    RETURN e
  `;

  await neo4jClient.runQuery(cypher, {
    id: email.id,
    subject: email.subject || '',
    timestamp: email.timestamp.toISOString(),
    significanceScore: email.significanceScore || null,
    threadId: email.threadId || null,
    from: email.from || null,
    to: email.to || [],
    cc: email.cc || [],
  });
}

/**
 * Create MENTIONED_IN relationship between entity and email
 */
export async function createMentionedIn(
  entity: Entity,
  emailId: string
): Promise<void> {
  const label = entityTypeToNodeLabel(entity.type);

  const cypher = `
    MATCH (entity:${label} {normalized: $normalized})
    MATCH (email:Email {id: $emailId})
    MERGE (entity)-[r:MENTIONED_IN]->(email)
    ON CREATE SET
      r.confidence = $confidence,
      r.source = $source,
      r.context = $context,
      r.extractedAt = datetime($timestamp)
    RETURN r
  `;

  await neo4jClient.runQuery(cypher, {
    normalized: entity.normalized,
    emailId,
    confidence: entity.confidence,
    source: entity.source,
    context: entity.context || null,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create co-occurrence relationship between two entities
 */
export async function createCoOccurrence(
  entity1: Entity,
  entity2: Entity,
  emailId: string
): Promise<void> {
  const label1 = entityTypeToNodeLabel(entity1.type);
  const label2 = entityTypeToNodeLabel(entity2.type);

  // Determine relationship type based on entity types
  let relationshipType = 'RELATED_TO';
  if (entity1.type === 'person' && entity2.type === 'person') {
    relationshipType = 'WORKS_WITH';
  } else if (entity1.type === 'person' && entity2.type === 'topic') {
    relationshipType = 'DISCUSSED_TOPIC';
  } else if (entity1.type === 'person' && entity2.type === 'project') {
    relationshipType = 'COLLABORATES_ON';
  } else if (entity1.type === 'person' && entity2.type === 'company') {
    relationshipType = 'WORKS_FOR';
  } else if (
    (entity1.type === 'person' ||
      entity1.type === 'company' ||
      entity1.type === 'project') &&
    entity2.type === 'location'
  ) {
    relationshipType = 'LOCATED_AT';
  } else if (entity1.type === 'topic' && entity2.type === 'topic') {
    relationshipType = 'RELATED_TO';
  }

  const cypher = `
    MATCH (e1:${label1} {normalized: $normalized1})
    MATCH (e2:${label2} {normalized: $normalized2})
    MERGE (e1)-[r:${relationshipType}]-(e2)
    ON CREATE SET
      r.weight = 1,
      r.emailIds = [$emailId],
      r.firstSeen = datetime($timestamp),
      r.lastSeen = datetime($timestamp)
    ON MATCH SET
      r.weight = r.weight + 1,
      r.emailIds = CASE
        WHEN NOT $emailId IN r.emailIds
        THEN r.emailIds + [$emailId]
        ELSE r.emailIds
      END,
      r.lastSeen = datetime($timestamp)
    RETURN r
  `;

  await neo4jClient.runQuery(cypher, {
    normalized1: entity1.normalized,
    normalized2: entity2.normalized,
    emailId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Process a single extraction result
 */
export async function processExtraction(
  extraction: ExtractionResult,
  emailMetadata?: {
    subject?: string;
    timestamp?: Date;
    significanceScore?: number;
    threadId?: string;
    from?: string;
    to?: string[];
    cc?: string[];
  }
): Promise<void> {
  console.log(
    `[Graph] Processing extraction for email ${extraction.emailId} (${extraction.entities.length} entities)`
  );

  // Create email node
  await createEmailNode({
    id: extraction.emailId,
    subject: emailMetadata?.subject,
    timestamp: emailMetadata?.timestamp || extraction.extractedAt,
    significanceScore: emailMetadata?.significanceScore,
    threadId: emailMetadata?.threadId,
    from: emailMetadata?.from,
    to: emailMetadata?.to,
    cc: emailMetadata?.cc,
  });

  // Process each entity
  for (const entity of extraction.entities) {
    // Create entity node
    await createEntityNode(entity, extraction.emailId);

    // Create MENTIONED_IN relationship
    await createMentionedIn(entity, extraction.emailId);
  }

  // Create co-occurrence relationships
  for (let i = 0; i < extraction.entities.length; i++) {
    for (let j = i + 1; j < extraction.entities.length; j++) {
      const entity1 = extraction.entities[i];
      const entity2 = extraction.entities[j];

      // Skip if same entity
      if (entity1.normalized === entity2.normalized) continue;

      await createCoOccurrence(entity1, entity2, extraction.emailId);
    }
  }

  console.log(
    `[Graph] Completed processing for email ${extraction.emailId}`
  );
}

/**
 * Process multiple extraction results in batch
 */
export async function processBatch(
  extractions: ExtractionResult[],
  emailMetadataMap?: Map<
    string,
    {
      subject?: string;
      timestamp?: Date;
      significanceScore?: number;
      threadId?: string;
      from?: string;
      to?: string[];
      cc?: string[];
    }
  >
): Promise<void> {
  console.log(`[Graph] Processing batch of ${extractions.length} extractions`);

  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;

  for (const extraction of extractions) {
    try {
      const metadata = emailMetadataMap?.get(extraction.emailId);
      await processExtraction(extraction, metadata);
      successCount++;
    } catch (error) {
      console.error(
        `[Graph] Error processing extraction for ${extraction.emailId}:`,
        error
      );
      errorCount++;
    }
  }

  const duration = Date.now() - startTime;

  console.log(`[Graph] Batch processing complete:`);
  console.log(`  - Success: ${successCount}`);
  console.log(`  - Errors: ${errorCount}`);
  console.log(`  - Duration: ${duration}ms`);
  console.log(
    `  - Avg per email: ${(duration / extractions.length).toFixed(0)}ms`
  );
}

/**
 * Build co-occurrence relationships from entity frequency data
 */
export async function buildCoOccurrences(
  coOccurrences: EntityCoOccurrence[]
): Promise<void> {
  console.log(
    `[Graph] Building ${coOccurrences.length} co-occurrence relationships`
  );

  for (const coOccurrence of coOccurrences) {
    for (const emailId of coOccurrence.emailIds) {
      try {
        await createCoOccurrence(
          coOccurrence.entity1,
          coOccurrence.entity2,
          emailId
        );
      } catch (error) {
        console.error('[Graph] Error creating co-occurrence:', error);
      }
    }
  }

  console.log('[Graph] Co-occurrence relationships created');
}

/**
 * Initialize graph with indexes
 */
export async function initializeGraph(): Promise<void> {
  console.log('[Graph] Initializing graph...');

  // Verify connection
  const isConnected = await neo4jClient.verifyConnection();
  if (!isConnected) {
    throw new Error('[Graph] Failed to connect to Neo4j');
  }

  // Create indexes
  await neo4jClient.createIndexes();

  console.log('[Graph] Graph initialized successfully');
}
