/**
 * Entity Extractor Service
 *
 * Extracts structured entities from emails using Mistral AI via OpenRouter.
 * Supports batch processing, frequency analysis, and co-occurrence tracking.
 */

import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import type { Email, CalendarEvent } from '../google/types';
import type {
  Entity,
  EntityType,
  InlineRelationship,
  InlineRelationshipType,
  ExtractionResult,
  CalendarExtractionResult,
  ExtractionConfig,
  EntityFrequency,
  EntityCoOccurrence,
  ExtractionStats,
} from './types';
import { DEFAULT_EXTRACTION_CONFIG } from './types';
import { buildExtractionPrompt, buildCalendarExtractionPrompt } from './prompts';
import type { UserIdentity } from './user-identity';

const LOG_PREFIX = '[Extraction]';

export class EntityExtractor {
  private config: ExtractionConfig;
  private _client: ReturnType<typeof getAIClient> | null = null;
  private userIdentity?: UserIdentity;

  // Lazy getter for AI client (for build compatibility)
  private get client() {
    if (!this._client) {
      this._client = getAIClient();
    }
    return this._client;
  }

  constructor(config?: Partial<ExtractionConfig>, userIdentity?: UserIdentity) {
    this.config = {
      ...DEFAULT_EXTRACTION_CONFIG,
      ...config,
    };
    this.userIdentity = userIdentity;
  }

  /**
   * Set user identity for extraction context
   */
  setUserIdentity(userIdentity: UserIdentity) {
    this.userIdentity = userIdentity;
  }

  /**
   * Extract entities from a single email
   */
  async extractFromEmail(email: Email): Promise<ExtractionResult> {
    const prompt = buildExtractionPrompt(email, this.config, this.userIdentity);

    try {
      // Use Mistral Small (cheap tier) for extraction
      const response = await this.client.chat(
        [
          {
            role: 'system',
            content:
              'You are an expert entity extraction system. Extract structured information from emails and respond with valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        {
          model: MODELS.CLASSIFIER, // Mistral Small
          maxTokens: 1500, // Increased for relationships
          temperature: 0.1, // Low temperature for consistent extraction
          logCost: false, // Avoid cluttering logs
        }
      );

      // Parse JSON response
      const parsed = this.parseExtractionResponse(response.content);

      // Filter entities by confidence threshold
      const filteredEntities = parsed.entities.filter(
        (entity) => entity.confidence >= this.config.minConfidence
      );

      // Filter relationships by confidence threshold (use slightly lower threshold)
      const minRelConfidence = Math.max(0.5, this.config.minConfidence - 0.1);
      const filteredRelationships = parsed.relationships.filter(
        (rel) => rel.confidence >= minRelConfidence
      );

      return {
        emailId: email.id,
        entities: filteredEntities,
        relationships: filteredRelationships,
        spam: parsed.spam,
        extractedAt: new Date(),
        cost: response.usage.cost,
        model: response.model,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to extract from email ${email.id}:`, error);
      // Return empty result on error
      return {
        emailId: email.id,
        entities: [],
        relationships: [],
        spam: { isSpam: false, spamScore: 0 },
        extractedAt: new Date(),
        cost: 0,
        model: MODELS.CLASSIFIER,
      };
    }
  }

  /**
   * Extract entities from a single calendar event
   */
  async extractFromCalendarEvent(event: CalendarEvent): Promise<CalendarExtractionResult> {
    const prompt = buildCalendarExtractionPrompt(event, this.config);

    try {
      // Use Mistral Small (cheap tier) for extraction
      const response = await this.client.chat(
        [
          {
            role: 'system',
            content:
              'You are an expert entity extraction system. Extract structured information from calendar events and respond with valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        {
          model: MODELS.CLASSIFIER, // Mistral Small
          maxTokens: 1500, // Increased for relationships
          temperature: 0.1, // Low temperature for consistent extraction
          logCost: false, // Avoid cluttering logs
        }
      );

      // Parse JSON response
      const parsed = this.parseExtractionResponse(response.content);

      // Filter entities by confidence threshold
      const filteredEntities = parsed.entities.filter(
        (entity) => entity.confidence >= this.config.minConfidence
      );

      // Filter relationships by confidence threshold (use slightly lower threshold)
      const minRelConfidence = Math.max(0.5, this.config.minConfidence - 0.1);
      const filteredRelationships = parsed.relationships.filter(
        (rel) => rel.confidence >= minRelConfidence
      );

      return {
        eventId: event.id,
        entities: filteredEntities,
        relationships: filteredRelationships,
        spam: { isSpam: false, spamScore: 0 }, // Calendar events are never spam
        extractedAt: new Date(),
        cost: response.usage.cost,
        model: response.model,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to extract from calendar event ${event.id}:`, error);
      // Return empty result on error
      return {
        eventId: event.id,
        entities: [],
        relationships: [],
        spam: { isSpam: false, spamScore: 0 },
        extractedAt: new Date(),
        cost: 0,
        model: MODELS.CLASSIFIER,
      };
    }
  }

  /**
   * Batch extraction for calendar events with progress tracking
   */
  async extractBatchCalendar(events: CalendarEvent[]): Promise<CalendarExtractionResult[]> {
    const startTime = Date.now();
    const results: CalendarExtractionResult[] = [];
    let totalCost = 0;
    let successCount = 0;
    let failureCount = 0;
    let totalEntities = 0;

    console.log(`${LOG_PREFIX} Processing ${events.length} calendar events...`);

    for (const event of events) {
      try {
        const result = await this.extractFromCalendarEvent(event);
        results.push(result);
        totalCost += result.cost;
        totalEntities += result.entities.length;

        if (result.entities.length > 0) {
          successCount++;
        } else {
          failureCount++;
        }

        // Log progress every 10 events
        if (results.length % 10 === 0) {
          console.log(
            `${LOG_PREFIX} Progress: ${results.length}/${events.length} (${successCount} successful)`
          );
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to extract from ${event.id}:`, error);
        failureCount++;
      }
    }

    const processingTimeMs = Date.now() - startTime;

    console.log(`${LOG_PREFIX} Completed ${results.length}/${events.length} extractions`);
    console.log(`${LOG_PREFIX} Total entities: ${totalEntities}`);
    console.log(`${LOG_PREFIX} Total cost: $${totalCost.toFixed(6)}`);
    console.log(`${LOG_PREFIX} Processing time: ${(processingTimeMs / 1000).toFixed(2)}s`);

    return results;
  }

  /**
   * Batch extraction with progress tracking and cost reporting
   */
  async extractBatch(emails: Email[]): Promise<ExtractionResult[]> {
    const startTime = Date.now();
    const results: ExtractionResult[] = [];
    let totalCost = 0;
    let successCount = 0;
    let failureCount = 0;
    let totalEntities = 0;

    console.log(`${LOG_PREFIX} Processing ${emails.length} emails...`);

    for (const email of emails) {
      try {
        const result = await this.extractFromEmail(email);
        results.push(result);
        totalCost += result.cost;
        totalEntities += result.entities.length;

        if (result.entities.length > 0) {
          successCount++;
        } else {
          failureCount++;
        }

        // Log progress every 10 emails
        if (results.length % 10 === 0) {
          console.log(
            `${LOG_PREFIX} Progress: ${results.length}/${emails.length} (${successCount} successful)`
          );
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to extract from ${email.id}:`, error);
        failureCount++;
      }
    }

    const processingTimeMs = Date.now() - startTime;
    const stats: ExtractionStats = {
      totalEmails: emails.length,
      successCount,
      failureCount,
      totalEntities,
      totalCost,
      processingTimeMs,
      entitiesPerEmail: totalEntities / emails.length,
      costPerEmail: totalCost / emails.length,
    };

    console.log(`${LOG_PREFIX} Completed ${results.length}/${emails.length} extractions`);
    console.log(`${LOG_PREFIX} Total entities: ${totalEntities}`);
    console.log(`${LOG_PREFIX} Total cost: $${totalCost.toFixed(6)}`);
    console.log(`${LOG_PREFIX} Processing time: ${(processingTimeMs / 1000).toFixed(2)}s`);
    console.log(
      `${LOG_PREFIX} Performance: ${((emails.length / processingTimeMs) * 1000).toFixed(2)} emails/second`
    );

    return results;
  }

  /**
   * Build entity frequency map across multiple extraction results
   */
  buildFrequencyMap(results: ExtractionResult[]): Map<string, EntityFrequency> {
    const frequencyMap = new Map<string, EntityFrequency>();

    for (const result of results) {
      for (const entity of result.entities) {
        const key = `${entity.type}:${entity.normalized}`;
        const existing = frequencyMap.get(key);

        if (existing) {
          existing.count++;
          existing.emailIds.push(result.emailId);
        } else {
          frequencyMap.set(key, {
            entity,
            count: 1,
            emailIds: [result.emailId],
          });
        }
      }
    }

    return frequencyMap;
  }

  /**
   * Build co-occurrence map (which entities appear together)
   */
  buildCoOccurrenceMap(results: ExtractionResult[]): Map<string, EntityCoOccurrence> {
    const coOccurrenceMap = new Map<string, EntityCoOccurrence>();

    for (const result of results) {
      const entities = result.entities;

      // Generate all pairs of entities
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const entity1 = entities[i];
          const entity2 = entities[j];

          // Create consistent key (alphabetical order)
          const key1 = `${entity1.type}:${entity1.normalized}`;
          const key2 = `${entity2.type}:${entity2.normalized}`;
          const pairKey = key1 < key2 ? `${key1}|${key2}` : `${key2}|${key1}`;

          const existing = coOccurrenceMap.get(pairKey);

          if (existing) {
            existing.count++;
            existing.emailIds.push(result.emailId);
          } else {
            coOccurrenceMap.set(pairKey, {
              entity1: key1 < key2 ? entity1 : entity2,
              entity2: key1 < key2 ? entity2 : entity1,
              count: 1,
              emailIds: [result.emailId],
            });
          }
        }
      }
    }

    return coOccurrenceMap;
  }

  /**
   * Get top N most frequent entities
   */
  getTopEntities(results: ExtractionResult[], limit = 20): EntityFrequency[] {
    const frequencyMap = this.buildFrequencyMap(results);

    return Array.from(frequencyMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get top N entity co-occurrences
   */
  getTopCoOccurrences(results: ExtractionResult[], limit = 20): EntityCoOccurrence[] {
    const coOccurrenceMap = this.buildCoOccurrenceMap(results);

    return Array.from(coOccurrenceMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Parse JSON response from Mistral with error handling
   */
  private parseExtractionResponse(content: string): {
    entities: Entity[];
    relationships: InlineRelationship[];
    spam: { isSpam: boolean; spamScore: number; spamReason?: string };
  } {
    try {
      // Try to extract JSON from response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`${LOG_PREFIX} No JSON found in response`);
        return {
          entities: [],
          relationships: [],
          spam: { isSpam: false, spamScore: 0 },
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!parsed.entities || !Array.isArray(parsed.entities)) {
        console.warn(`${LOG_PREFIX} Invalid response structure - missing or invalid 'entities' array`);
        return {
          entities: [],
          relationships: [],
          spam: { isSpam: false, spamScore: 0 },
        };
      }

      // Validate each entity
      const validEntities = parsed.entities.filter((entity: any) => {
        return (
          entity.type &&
          entity.value &&
          entity.normalized &&
          typeof entity.confidence === 'number' &&
          entity.source
        );
      });

      // Parse spam classification with fallback
      const spam = {
        isSpam: parsed.spam?.isSpam ?? false,
        spamScore: parsed.spam?.spamScore ?? 0,
        spamReason: parsed.spam?.spamReason,
      };

      // Parse relationships with validation
      const validRelationships: InlineRelationship[] = [];
      if (Array.isArray(parsed.relationships)) {
        for (const rel of parsed.relationships) {
          if (this.isValidRelationship(rel)) {
            validRelationships.push({
              fromType: rel.fromType as EntityType,
              fromValue: rel.fromValue,
              toType: rel.toType as EntityType,
              toValue: rel.toValue,
              relationshipType: rel.relationshipType as InlineRelationshipType,
              confidence: Math.min(1, Math.max(0, rel.confidence || 0.5)),
              evidence: rel.evidence || '',
            });
          }
        }
      }

      return { entities: validEntities, relationships: validRelationships, spam };
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error(`${LOG_PREFIX} JSON parsing failed - malformed response from LLM`);
        console.error(`${LOG_PREFIX} SyntaxError: ${error.message}`);
        console.error(`${LOG_PREFIX} Response snippet: ${content.substring(0, 200)}...`);
      } else {
        console.error(`${LOG_PREFIX} Failed to parse JSON response:`, error);
        console.error(`${LOG_PREFIX} Response content:`, content);
      }
      return {
        entities: [],
        relationships: [],
        spam: { isSpam: false, spamScore: 0 },
      };
    }
  }

  /**
   * Validate that a relationship has valid structure and types
   */
  private isValidRelationship(rel: any): boolean {
    // Check required fields exist
    if (!rel.fromType || !rel.fromValue || !rel.toType || !rel.toValue || !rel.relationshipType) {
      console.warn(`${LOG_PREFIX} Invalid relationship structure:`, rel);
      return false;
    }

    // Valid entity types
    const validEntityTypes: EntityType[] = ['person', 'company', 'project', 'date', 'topic', 'location', 'action_item'];
    if (!validEntityTypes.includes(rel.fromType) || !validEntityTypes.includes(rel.toType)) {
      console.warn(`${LOG_PREFIX} Invalid entity type in relationship: ${rel.fromType} -> ${rel.toType}`);
      return false;
    }

    // Valid relationship types
    const validRelTypes: InlineRelationshipType[] = [
      'WORKS_WITH', 'REPORTS_TO', 'WORKS_FOR', 'LEADS', 'WORKS_ON', 'EXPERT_IN', 'LOCATED_IN',
      'PARTNERS_WITH', 'COMPETES_WITH', 'OWNS', 'RELATED_TO', 'DEPENDS_ON', 'PART_OF',
      'SUBTOPIC_OF', 'ASSOCIATED_WITH'
    ];
    if (!validRelTypes.includes(rel.relationshipType)) {
      console.warn(`${LOG_PREFIX} Unknown relationship type: ${rel.relationshipType}`);
      return false;
    }

    return true;
  }

  /**
   * Normalize entity name for consistent tracking
   * Example: "John Doe" -> "john_doe", "Acme Corp" -> "acme_corp"
   */
  normalizeEntityName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .trim();
  }
}

/**
 * Singleton instance
 */
let extractorInstance: EntityExtractor | null = null;

export function getEntityExtractor(
  config?: Partial<ExtractionConfig>,
  userIdentity?: UserIdentity
): EntityExtractor {
  if (!extractorInstance || config || userIdentity) {
    extractorInstance = new EntityExtractor(config, userIdentity);
  }
  return extractorInstance;
}
