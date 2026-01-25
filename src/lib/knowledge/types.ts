/**
 * Knowledge Types
 *
 * Type definitions for the two-tier knowledge architecture.
 * Supports global, organization, and personal knowledge sources.
 *
 * NOTE: Types are defined locally since schema tables not yet created.
 */

/**
 * Shared knowledge types (would come from schema)
 */
export type SharedKnowledgeType = 'documentation' | 'faq' | 'procedure' | 'policy' | 'reference' | 'template';
export type SharedKnowledgeVisibility = 'global' | 'organization' | 'private';

/**
 * Shared knowledge item (would come from schema)
 */
export interface SharedKnowledge {
  id: string;
  organizationId: string | null;
  type: SharedKnowledgeType;
  title: string;
  content: string;
  visibility: SharedKnowledgeVisibility;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export type NewSharedKnowledge = Omit<SharedKnowledge, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Organization (would come from schema)
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Knowledge source tier
 */
export type KnowledgeSource = 'global' | 'organization' | 'personal';

/**
 * Unified knowledge result from any tier
 */
export interface KnowledgeResult {
  id: string;
  content: string;
  type: string;
  source: KnowledgeSource;
  title?: string;
  relevanceScore?: number;
  organizationId?: string;
  organizationName?: string;
}

/**
 * Options for knowledge retrieval
 */
export interface KnowledgeRetrievalOptions {
  /** Include global/core knowledge (default: true) */
  includeGlobal?: boolean;
  /** Include organization-scoped knowledge (default: true) */
  includeOrganization?: boolean;
  /** Include user-specific/personal knowledge (default: true) */
  includePersonal?: boolean;
  /** Filter by knowledge type */
  type?: SharedKnowledgeType;
  /** Maximum results to return */
  limit?: number;
  /** Minimum relevance score (0-1) */
  minRelevance?: number;
}

/**
 * Default retrieval options
 */
export const DEFAULT_RETRIEVAL_OPTIONS: Required<Omit<KnowledgeRetrievalOptions, 'type' | 'minRelevance'>> = {
  includeGlobal: true,
  includeOrganization: true,
  includePersonal: true,
  limit: 20,
};
