/**
 * Graph Module
 *
 * Neo4j knowledge graph integration for Izzie2.
 * Builds and queries a graph of entities extracted from emails.
 */

// Client
export { neo4jClient, Neo4jClient } from './neo4j-client';

// Types
export * from './types';

// Builder
export {
  createEntityNode,
  createEmailNode,
  createMentionedIn,
  createCoOccurrence,
  processExtraction,
  processBatch,
  buildCoOccurrences,
  initializeGraph,
} from './graph-builder';

// Queries
export {
  getEntityByName,
  getRelatedEntities,
  getCoOccurrences,
  getEmailsForEntity,
  getTopEntities,
  getWorksWith,
  getProjectCollaborators,
  getTopicExperts,
  getCompanyPeople,
  getRelatedTopics,
  getEmailEntities,
  searchEntities,
  getRecentActivity,
  findPath,
  getEntityStats,
} from './graph-queries';
