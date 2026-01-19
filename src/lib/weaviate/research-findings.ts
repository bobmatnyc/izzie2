/**
 * Weaviate Research Findings Collection
 *
 * Enables semantic search over research results with auto-generated embeddings.
 * Uses BM25 keyword search (no vectorizer needed) similar to existing entity collections.
 *
 * Schema:
 * - claim: string (the finding)
 * - evidence: string (supporting evidence)
 * - confidence: number (0-100)
 * - taskId: string (reference to agent_tasks)
 * - sourceUrl: string
 * - sourceTitle: string
 * - quote: string (direct quote from source)
 * - userId: string
 */

import { getWeaviateClient } from './client';
import type { ResearchFinding } from '@/agents/research/types';

const LOG_PREFIX = '[Weaviate Research Findings]';

/**
 * Extended finding type with storage metadata
 */
export interface StoredResearchFinding extends ResearchFinding {
  id: string;
  taskId: string;
  createdAt: Date;
}

/**
 * Weaviate collection name for research findings
 */
export const RESEARCH_FINDING_COLLECTION = 'ResearchFinding';

/**
 * Internal interface for Weaviate storage format (snake_case fields, different confidence scale)
 */
interface WeaviateResearchFinding {
  claim: string;
  evidence: string;
  confidence: number; // 0-100 (stored as percentage)
  taskId: string;
  sourceUrl: string;
  sourceTitle: string;
  quote: string;
  userId: string;
  createdAt: string; // ISO timestamp
}

/**
 * Initialize ResearchFinding collection schema
 */
export async function initResearchFindingSchema(): Promise<void> {
  const client = await getWeaviateClient();

  try {
    // Check if collection exists
    const exists = await client.collections.exists(RESEARCH_FINDING_COLLECTION);

    if (exists) {
      console.log(`${LOG_PREFIX} Collection '${RESEARCH_FINDING_COLLECTION}' already exists`);
      return;
    }

    // Create collection with no vectorizer (use BM25 keyword search)
    await client.collections.create({
      name: RESEARCH_FINDING_COLLECTION,
      description: 'Research findings with claims, evidence, and citations',
      properties: [
        {
          name: 'claim',
          dataType: 'text',
          description: 'The research finding or claim',
        },
        {
          name: 'evidence',
          dataType: 'text',
          description: 'Supporting evidence for the claim',
        },
        {
          name: 'confidence',
          dataType: 'number',
          description: 'Confidence score (0-100)',
        },
        {
          name: 'taskId',
          dataType: 'text',
          description: 'Reference to agent_tasks table',
        },
        {
          name: 'sourceUrl',
          dataType: 'text',
          description: 'URL of the source',
        },
        {
          name: 'sourceTitle',
          dataType: 'text',
          description: 'Title of the source',
        },
        {
          name: 'quote',
          dataType: 'text',
          description: 'Direct quote from source supporting the finding',
        },
        {
          name: 'userId',
          dataType: 'text',
          description: 'User ID who owns this finding',
        },
        {
          name: 'createdAt',
          dataType: 'text',
          description: 'ISO timestamp of creation',
        },
      ] as any,
    });

    console.log(`${LOG_PREFIX} Created collection '${RESEARCH_FINDING_COLLECTION}'`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create collection:`, error);
    throw error;
  }
}

/**
 * Save a single research finding to Weaviate
 */
export async function saveFinding(
  finding: ResearchFinding,
  taskId: string,
  userId: string,
  sourceUrl: string = '',
  sourceTitle: string = ''
): Promise<string> {
  const client = await getWeaviateClient();

  try {
    const collection = client.collections.get(RESEARCH_FINDING_COLLECTION);

    const storedFinding = {
      claim: finding.claim,
      evidence: finding.evidence || '',
      confidence: Math.round(finding.confidence * 100), // Convert 0-1 to 0-100
      taskId,
      sourceUrl: sourceUrl || finding.sourceUrl || '',
      sourceTitle: sourceTitle || '',
      quote: finding.quote || '',
      userId,
      createdAt: new Date().toISOString(),
    };

    const result = await collection.data.insert(storedFinding as any);

    console.log(`${LOG_PREFIX} Saved finding: "${finding.claim.substring(0, 50)}..."`);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save finding:`, error);
    throw error;
  }
}

/**
 * Save multiple research findings in batch
 */
export async function saveFindings(
  findings: ResearchFinding[],
  taskId: string,
  userId: string
): Promise<string[]> {
  if (findings.length === 0) {
    console.log(`${LOG_PREFIX} No findings to save`);
    return [];
  }

  const client = await getWeaviateClient();

  try {
    const collection = client.collections.get(RESEARCH_FINDING_COLLECTION);

    const objects = findings.map((finding) => ({
      claim: finding.claim,
      evidence: finding.evidence || '',
      confidence: Math.round(finding.confidence * 100),
      taskId,
      sourceUrl: finding.sourceUrl || '',
      sourceTitle: '', // Will be populated from source if available
      quote: finding.quote || '',
      userId,
      createdAt: new Date().toISOString(),
    }));

    const result = await collection.data.insertMany(objects);

    // Count successful inserts
    const insertedCount = result.uuids ? Object.keys(result.uuids).length : 0;
    console.log(`${LOG_PREFIX} Saved ${insertedCount} findings for task ${taskId}`);

    return result.uuids ? Object.values(result.uuids).map(String) : [];
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save findings:`, error);
    throw error;
  }
}

/**
 * Search findings using BM25 keyword search
 */
export async function searchFindings(
  query: string,
  userId: string,
  options?: {
    limit?: number;
    taskId?: string;
    minConfidence?: number;
  }
): Promise<StoredResearchFinding[]> {
  const client = await getWeaviateClient();
  const limit = options?.limit || 20;

  console.log(`${LOG_PREFIX} Searching for: "${query}" (user: ${userId})`);

  try {
    const collection = client.collections.get(RESEARCH_FINDING_COLLECTION);

    // Use BM25 keyword search
    const result = await collection.query.bm25(query, {
      limit: limit * 2, // Fetch more for filtering
      returnMetadata: ['score'],
    });

    // Filter by userId and optionally taskId
    const filtered = result.objects
      .filter((obj: any) => {
        if (obj.properties.userId !== userId) return false;
        if (options?.taskId && obj.properties.taskId !== options.taskId) return false;
        if (options?.minConfidence && obj.properties.confidence < options.minConfidence) {
          return false;
        }
        return true;
      })
      .slice(0, limit);

    // Convert to StoredResearchFinding objects
    const findings: StoredResearchFinding[] = filtered.map((obj: any) => ({
      id: obj.uuid,
      taskId: obj.properties.taskId,
      claim: obj.properties.claim,
      evidence: obj.properties.evidence,
      confidence: obj.properties.confidence / 100, // Convert back to 0-1
      sourceUrl: obj.properties.sourceUrl,
      quote: obj.properties.quote,
      createdAt: new Date(obj.properties.createdAt),
    }));

    console.log(`${LOG_PREFIX} Found ${findings.length} matching findings`);
    return findings;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to search findings:`, error);
    return [];
  }
}

/**
 * Get all findings for a specific task
 */
export async function getFindingsByTask(
  taskId: string,
  userId: string
): Promise<StoredResearchFinding[]> {
  const client = await getWeaviateClient();

  console.log(`${LOG_PREFIX} Fetching findings for task ${taskId}...`);

  try {
    const collection = client.collections.get(RESEARCH_FINDING_COLLECTION);

    const result = await collection.query.fetchObjects({
      limit: 1000,
      returnProperties: [
        'claim',
        'evidence',
        'confidence',
        'taskId',
        'sourceUrl',
        'sourceTitle',
        'quote',
        'userId',
        'createdAt',
      ],
    });

    // Filter by taskId and userId
    const findings: StoredResearchFinding[] = result.objects
      .filter(
        (obj: any) => obj.properties.taskId === taskId && obj.properties.userId === userId
      )
      .map((obj: any) => ({
        id: obj.uuid,
        taskId: obj.properties.taskId,
        claim: obj.properties.claim,
        evidence: obj.properties.evidence,
        confidence: obj.properties.confidence / 100,
        sourceUrl: obj.properties.sourceUrl,
        quote: obj.properties.quote,
        createdAt: new Date(obj.properties.createdAt),
      }));

    console.log(`${LOG_PREFIX} Found ${findings.length} findings for task ${taskId}`);
    return findings;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to fetch findings:`, error);
    return [];
  }
}

/**
 * Delete all findings for a specific task
 */
export async function deleteFindingsByTask(taskId: string, userId: string): Promise<number> {
  const client = await getWeaviateClient();

  console.log(`${LOG_PREFIX} Deleting findings for task ${taskId}...`);

  try {
    const collection = client.collections.get(RESEARCH_FINDING_COLLECTION);

    // Fetch all objects matching the criteria
    const result = await collection.query.fetchObjects({
      limit: 1000,
      returnProperties: ['taskId', 'userId'],
    });

    // Filter objects to delete
    const objectsToDelete = result.objects.filter(
      (obj: any) => obj.properties.taskId === taskId && obj.properties.userId === userId
    );

    // Delete each object by UUID
    for (const obj of objectsToDelete) {
      await collection.data.deleteById(obj.uuid);
    }

    console.log(`${LOG_PREFIX} Deleted ${objectsToDelete.length} findings`);
    return objectsToDelete.length;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to delete findings:`, error);
    return 0;
  }
}
