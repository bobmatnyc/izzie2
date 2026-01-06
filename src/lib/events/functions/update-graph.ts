/**
 * Graph Update Function
 * Event-triggered function that updates Neo4j graph and Mem0 embeddings
 */

import { inngest } from '../index';
import { processExtraction } from '@/lib/graph/graph-builder';
import { enhancedMemoryService } from '@/lib/memory/enhanced';
import type { ExtractionResult } from '@/lib/extraction/types';

const LOG_PREFIX = '[UpdateGraph]';

/**
 * Update graph with extracted entities
 */
export const updateGraph = inngest.createFunction(
  {
    id: 'update-graph',
    name: 'Update Graph and Memory',
    retries: 3,
    concurrency: {
      limit: 5, // Process up to 5 graph updates concurrently
    },
  },
  { event: 'izzie/ingestion.entities.extracted' },
  async ({ event, step }) => {
    const { userId, sourceId, sourceType, entities, spam, extractedAt, cost, model } = event.data;

    console.log(
      `${LOG_PREFIX} Updating graph for ${sourceType} ${sourceId} with ${entities.length} entities`
    );

    // Step 1: Update Neo4j graph
    const graphUpdateResult = await step.run('update-neo4j-graph', async () => {
      try {
        // Convert event entities to extraction result format
        const extractionResult: ExtractionResult = {
          emailId: sourceId,
          entities: entities,
          spam: spam,
          extractedAt: new Date(extractedAt),
          cost,
          model,
        };

        // Process extraction and update graph
        await processExtraction(extractionResult, {
          timestamp: new Date(extractedAt),
        });

        console.log(`${LOG_PREFIX} Successfully updated Neo4j graph for ${sourceId}`);

        return {
          success: true,
          nodesCreated: entities.length,
        };
      } catch (error) {
        console.error(`${LOG_PREFIX} Error updating Neo4j graph:`, error);
        // Don't fail the entire operation if graph update fails
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Step 2: Store in memory with embeddings
    const memoryUpdateResult = await step.run('update-memory-embeddings', async () => {
      try {
        // Create a summary of the entities for storage
        const entitySummary = entities
          .map((entity: any) => `${entity.type}: ${entity.value} (confidence: ${entity.confidence.toFixed(2)})`)
          .join(', ');

        const content = `Entities from ${sourceType} ${sourceId}: ${entitySummary}`;

        // Store in enhanced memory service (dual-write to vector + graph)
        const memoryEntry = await enhancedMemoryService.store(
          {
            userId,
            content,
            metadata: {
              sourceId,
              sourceType,
              entityCount: entities.length,
              extractionCost: cost,
              extractionModel: model,
            },
          },
          {
            summary: `${entities.length} entities extracted from ${sourceType}`,
            importance: Math.min(10, Math.max(1, entities.length)), // Scale importance by entity count
            entities: entities, // Pass entities for graph integration
            extractEntities: false, // Don't re-extract, we already have them
          }
        );

        console.log(`${LOG_PREFIX} Successfully stored memory entry ${memoryEntry.id}`);

        return {
          success: true,
          memoryId: memoryEntry.id,
        };
      } catch (error) {
        console.error(`${LOG_PREFIX} Error updating memory:`, error);
        // Don't fail the entire operation if memory update fails
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Step 3: Log completion metrics
    await step.run('log-metrics', async () => {
      console.log(`${LOG_PREFIX} Completed graph and memory update for ${sourceId}`);
      console.log(`${LOG_PREFIX} Graph update: ${graphUpdateResult.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`${LOG_PREFIX} Memory update: ${memoryUpdateResult.success ? 'SUCCESS' : 'FAILED'}`);

      if (graphUpdateResult.success && 'nodesCreated' in graphUpdateResult) {
        console.log(`${LOG_PREFIX}   - Nodes created: ${graphUpdateResult.nodesCreated}`);
      }

      if (memoryUpdateResult.success && 'memoryId' in memoryUpdateResult) {
        console.log(`${LOG_PREFIX}   - Memory ID: ${memoryUpdateResult.memoryId}`);
      }

      // TODO: Send metrics to monitoring service (e.g., Datadog, Prometheus)
    });

    return {
      sourceId,
      sourceType,
      entitiesCount: entities.length,
      graphUpdate: graphUpdateResult,
      memoryUpdate: memoryUpdateResult,
      completedAt: new Date().toISOString(),
    };
  }
);
