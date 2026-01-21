/**
 * Entity Extraction Module
 *
 * Exports entity extraction service and related types.
 */

export { EntityExtractor, getEntityExtractor } from './entity-extractor';
export { buildExtractionPrompt, buildBatchExtractionPrompt } from './prompts';
export {
  convertToInferredRelationship,
  convertToInferredRelationships,
  deduplicateInlineRelationships,
} from './relationship-converter';
export type {
  EntityType,
  Entity,
  InlineRelationship,
  InlineRelationshipType,
  ExtractionResult,
  CalendarExtractionResult,
  ExtractionConfig,
  EntityFrequency,
  EntityCoOccurrence,
  ExtractionStats,
} from './types';
export { DEFAULT_EXTRACTION_CONFIG } from './types';
