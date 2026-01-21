/**
 * Entity Extraction Types
 *
 * Defines types for extracting structured entities from emails using AI.
 * Supports people, organizations, projects, dates, topics, and locations.
 */

/**
 * Entity types that can be extracted from emails
 */
export type EntityType =
  | 'person'
  | 'company'
  | 'project'
  | 'date'
  | 'topic'
  | 'location'
  | 'action_item';

/**
 * Relationship types for inline extraction during entity discovery
 * Matches the types defined in lib/relationships/types.ts
 */
export type InlineRelationshipType =
  // Person relationships
  | 'WORKS_WITH'        // Person ↔ Person (colleagues)
  | 'REPORTS_TO'        // Person → Person (hierarchy)
  | 'WORKS_FOR'         // Person → Company
  | 'LEADS'             // Person → Project
  | 'WORKS_ON'          // Person → Project
  | 'EXPERT_IN'         // Person → Topic
  | 'LOCATED_IN'        // Person/Company → Location
  // Company relationships
  | 'PARTNERS_WITH'     // Company ↔ Company
  | 'COMPETES_WITH'     // Company ↔ Company
  | 'OWNS'              // Company → Project
  // Project relationships
  | 'RELATED_TO'        // Project ↔ Project
  | 'DEPENDS_ON'        // Project → Project
  | 'PART_OF'           // Project → Project (parent)
  // Topic relationships
  | 'SUBTOPIC_OF'       // Topic → Topic
  | 'ASSOCIATED_WITH';  // Topic ↔ Topic

/**
 * Relationship extracted inline during entity extraction
 * Includes source and target entity types/values, relationship type,
 * confidence score, and supporting evidence from the content
 */
export interface InlineRelationship {
  fromType: EntityType;
  fromValue: string;      // Entity value (e.g., "John Doe")
  toType: EntityType;
  toValue: string;        // Entity value (e.g., "Acme Corp")
  relationshipType: InlineRelationshipType;
  confidence: number;     // 0-1 confidence score
  evidence: string;       // Quote/context supporting this relationship
}

/**
 * Extracted entity with confidence score and metadata
 */
export interface Entity {
  type: EntityType;
  value: string;
  normalized: string; // Normalized form (e.g., "Bob" -> "Robert Smith")
  confidence: number; // 0-1 confidence score
  source: 'metadata' | 'body' | 'subject'; // Where entity was found
  context?: string; // Surrounding text for context
  // Action item specific properties
  assignee?: string; // Who should do it (for action_item type)
  deadline?: string; // When it's due (for action_item type)
  priority?: 'low' | 'medium' | 'high'; // Priority level (for action_item type)
}

/**
 * Spam classification for an email
 */
export interface SpamClassification {
  isSpam: boolean; // Is this email spam/promotional/low-value?
  spamScore: number; // 0-1 confidence score
  spamReason?: string; // Why it's classified as spam
}

/**
 * Result of entity extraction from a single email
 */
export interface ExtractionResult {
  emailId: string;
  entities: Entity[];
  relationships: InlineRelationship[]; // Relationships extracted inline with entities
  spam: SpamClassification; // Spam detection
  extractedAt: Date;
  cost: number; // API cost for tracking
  model: string; // Model used
}

/**
 * Result of entity extraction from a calendar event
 */
export interface CalendarExtractionResult {
  eventId: string;
  entities: Entity[];
  relationships: InlineRelationship[]; // Relationships extracted inline with entities
  spam: SpamClassification; // Always false for calendar events
  extractedAt: Date;
  cost: number; // API cost for tracking
  model: string; // Model used
}

/**
 * Entity frequency map across multiple emails
 * Key format: "type:normalized" (e.g., "person:john_doe")
 */
export interface EntityFrequency {
  entity: Entity;
  count: number;
  emailIds: string[];
}

/**
 * Co-occurrence of two entities
 * Tracks which entities appear together in emails
 */
export interface EntityCoOccurrence {
  entity1: Entity;
  entity2: Entity;
  count: number;
  emailIds: string[];
}

/**
 * Configuration for entity extraction
 */
export interface ExtractionConfig {
  minConfidence: number; // Minimum confidence threshold (default: 0.7)
  extractFromMetadata: boolean; // Extract from To/From/CC (default: true)
  extractFromSubject: boolean; // Extract from subject line (default: true)
  extractFromBody: boolean; // Extract from email body (default: true)
  normalizeEntities: boolean; // Normalize entity names (default: true)
}

export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  minConfidence: 0.7,
  extractFromMetadata: true,
  extractFromSubject: true,
  extractFromBody: true,
  normalizeEntities: true,
};

/**
 * Batch extraction statistics
 */
export interface ExtractionStats {
  totalEmails: number;
  successCount: number;
  failureCount: number;
  totalEntities: number;
  totalCost: number;
  processingTimeMs: number;
  entitiesPerEmail: number; // Average
  costPerEmail: number; // Average
}
