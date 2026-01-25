/**
 * Knowledge Module
 *
 * Two-tier knowledge architecture:
 * - Shared knowledge (global + organization) in PostgreSQL
 * - Personal knowledge (user-specific) in Weaviate
 *
 * This module provides unified retrieval across all knowledge tiers.
 */

// Types
export * from './types';

// Shared knowledge CRUD
export {
  getGlobalKnowledge,
  getOrganizationKnowledge,
  getSharedKnowledgeById,
  createSharedKnowledge,
  updateSharedKnowledge,
  deleteSharedKnowledge,
  searchSharedKnowledge,
  getAllAccessibleKnowledge,
} from './shared-knowledge';

// Unified retrieval (stub - tables not yet in schema)
export {
  retrieveKnowledge,
  getUserOrganizations,
} from './retrieval';
