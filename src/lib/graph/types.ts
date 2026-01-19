/**
 * Neo4j Graph Types
 *
 * Defines node and relationship types for the knowledge graph.
 * Maps entity extraction results to graph structures.
 */

import type { EntityType } from '@/lib/extraction/types';

/**
 * Base properties for all graph nodes
 */
export interface BaseNodeProperties {
  name: string; // Original value
  normalized: string; // Normalized key (e.g., "john_doe")
  frequency: number; // How many times mentioned
  confidence: number; // Average confidence score
  firstSeen: Date; // First extraction timestamp
  lastSeen: Date; // Last extraction timestamp
}

/**
 * Person node properties
 */
export interface PersonNode extends BaseNodeProperties {
  email?: string; // Email address if available
}

/**
 * Company node properties
 */
export interface CompanyNode extends BaseNodeProperties {
  domain?: string; // Company domain if available
}

/**
 * Project node properties
 */
export interface ProjectNode extends BaseNodeProperties {
  status?: string; // "active", "planned", "completed"
}

/**
 * Topic node properties
 */
export interface TopicNode extends BaseNodeProperties {
  category?: string; // Derived from clustering
}

/**
 * Location node properties
 */
export interface LocationNode extends BaseNodeProperties {
  type?: string; // "city", "country", "office", "address"
}

/**
 * Email node properties
 */
export interface EmailNode {
  id: string; // Gmail message ID
  subject: string;
  timestamp: Date;
  significanceScore?: number; // From email scoring system
  threadId?: string;
  from?: string;
  to?: string[];
  cc?: string[];
}

/**
 * Document node properties (future - for Drive integration)
 */
export interface DocumentNode {
  id: string;
  type: string; // "doc", "sheet", "slide", "pdf"
  source: string; // "gmail", "drive", "calendar"
  timestamp: Date;
  title?: string;
}

/**
 * Union type for all node types
 */
export type GraphNode =
  | PersonNode
  | CompanyNode
  | ProjectNode
  | TopicNode
  | LocationNode
  | EmailNode
  | DocumentNode;

/**
 * Base properties for all relationships
 */
export interface BaseRelationshipProperties {
  weight: number; // Co-occurrence count or strength
  emailIds: string[]; // Which emails show this relationship
  firstSeen: Date;
  lastSeen: Date;
}

/**
 * MENTIONED_IN relationship properties
 * (Entity -> Email/Document)
 */
export interface MentionedInRelationship {
  confidence: number;
  source: 'metadata' | 'body' | 'subject';
  context?: string; // Surrounding text
  extractedAt: Date;
}

/**
 * WORKS_WITH relationship properties
 * (Person -> Person)
 */
export interface WorksWithRelationship extends BaseRelationshipProperties {}

/**
 * DISCUSSED_TOPIC relationship properties
 * (Person -> Topic)
 */
export interface DiscussedTopicRelationship extends BaseRelationshipProperties {}

/**
 * COLLABORATES_ON relationship properties
 * (Person -> Project)
 */
export interface CollaboratesOnRelationship extends BaseRelationshipProperties {
  role?: string; // "lead", "contributor", "stakeholder"
}

/**
 * WORKS_FOR relationship properties
 * (Person -> Company)
 */
export interface WorksForRelationship extends BaseRelationshipProperties {
  current?: boolean; // Is this current employment?
}

/**
 * RELATED_TO relationship properties
 * (Topic -> Topic)
 */
export interface RelatedToRelationship extends BaseRelationshipProperties {}

/**
 * LOCATED_AT relationship properties
 * (Person/Company/Project -> Location)
 */
export interface LocatedAtRelationship extends BaseRelationshipProperties {}

/**
 * Union type for all relationship types
 */
export type GraphRelationship =
  | MentionedInRelationship
  | WorksWithRelationship
  | DiscussedTopicRelationship
  | CollaboratesOnRelationship
  | WorksForRelationship
  | RelatedToRelationship
  | LocatedAtRelationship;

/**
 * Graph node label (corresponds to entity type)
 */
export type NodeLabel =
  | 'Person'
  | 'Company'
  | 'Project'
  | 'Topic'
  | 'Location'
  | 'Email'
  | 'Document';

/**
 * Graph relationship type
 */
export type RelationshipType =
  | 'MENTIONED_IN'
  | 'WORKS_WITH'
  | 'DISCUSSED_TOPIC'
  | 'COLLABORATES_ON'
  | 'WORKS_FOR'
  | 'RELATED_TO'
  | 'LOCATED_AT';

/**
 * Map entity type to node label
 */
export function entityTypeToNodeLabel(entityType: EntityType): NodeLabel {
  const mapping: Record<EntityType, NodeLabel> = {
    person: 'Person',
    company: 'Company',
    project: 'Project',
    topic: 'Topic',
    location: 'Location',
    date: 'Topic', // Dates are stored as topics for now
    action_item: 'Topic', // Action items stored as topics for now
  };
  return mapping[entityType];
}

/**
 * Query result types
 */
export interface EntityQueryResult {
  node: GraphNode;
  label: NodeLabel;
}

export interface RelationshipQueryResult {
  source: GraphNode;
  relationship: GraphRelationship;
  target: GraphNode;
  type: RelationshipType;
}

export interface CoOccurrenceResult {
  entity: GraphNode;
  weight: number;
  emailIds: string[];
}

/**
 * Graph statistics
 */
export interface GraphStats {
  nodeCount: number;
  relationshipCount: number;
  nodesByType: Record<NodeLabel, number>;
  relationshipsByType: Record<RelationshipType, number>;
}
