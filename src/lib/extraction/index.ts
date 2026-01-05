/**
 * Entity Extraction Module
 *
 * Exports entity extraction service and related types.
 */

export { EntityExtractor, getEntityExtractor } from './entity-extractor';
export { buildExtractionPrompt, buildBatchExtractionPrompt } from './prompts';
export type {
  EntityType,
  Entity,
  ExtractionResult,
  ExtractionConfig,
  EntityFrequency,
  EntityCoOccurrence,
  ExtractionStats,
} from './types';
export { DEFAULT_EXTRACTION_CONFIG } from './types';
