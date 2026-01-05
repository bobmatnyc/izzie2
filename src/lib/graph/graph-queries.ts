/**
 * Graph Queries
 *
 * Common query patterns for the Neo4j knowledge graph.
 * Provides high-level API for retrieving graph data.
 */

import { neo4jClient } from './neo4j-client';
import type {
  GraphNode,
  NodeLabel,
  EntityQueryResult,
  RelationshipQueryResult,
  CoOccurrenceResult,
} from './types';

/**
 * Find entity by name and type
 */
export async function getEntityByName(
  name: string,
  type: NodeLabel
): Promise<EntityQueryResult | null> {
  const cypher = `
    MATCH (n:${type} {normalized: $normalized})
    RETURN n, labels(n)[0] as label
  `;

  const results = await neo4jClient.query<{
    n: GraphNode;
    label: NodeLabel;
  }>(cypher, { normalized: name });

  return results.length > 0
    ? { node: results[0].n, label: results[0].label }
    : null;
}

/**
 * Get all entities connected to a given entity
 */
export async function getRelatedEntities(
  entityId: string,
  type: NodeLabel,
  limit = 10
): Promise<RelationshipQueryResult[]> {
  const cypher = `
    MATCH (source:${type} {normalized: $entityId})-[r]-(target)
    RETURN source, r, target, type(r) as relType, labels(target)[0] as targetLabel
    ORDER BY r.weight DESC
    LIMIT $limit
  `;

  const results = await neo4jClient.query<{
    source: GraphNode;
    r: any;
    target: GraphNode;
    relType: string;
    targetLabel: NodeLabel;
  }>(cypher, { entityId, limit });

  return results.map((r) => ({
    source: r.source,
    relationship: r.r.properties,
    target: r.target,
    type: r.relType as any,
  }));
}

/**
 * Get entities that co-occur with the given entity
 */
export async function getCoOccurrences(
  entityId: string,
  type: NodeLabel,
  limit = 10
): Promise<CoOccurrenceResult[]> {
  const cypher = `
    MATCH (source:${type} {normalized: $entityId})-[r]-(entity)
    WHERE r.weight IS NOT NULL
    RETURN entity, r.weight as weight, r.emailIds as emailIds
    ORDER BY r.weight DESC
    LIMIT $limit
  `;

  const results = await neo4jClient.query<{
    entity: GraphNode;
    weight: number;
    emailIds: string[];
  }>(cypher, { entityId, limit });

  return results;
}

/**
 * Get emails that mention a specific entity
 */
export async function getEmailsForEntity(
  entityId: string,
  type: NodeLabel,
  limit = 20
): Promise<
  Array<{
    email: any;
    confidence: number;
    source: string;
    context?: string;
  }>
> {
  const cypher = `
    MATCH (entity:${type} {normalized: $entityId})-[r:MENTIONED_IN]->(email:Email)
    RETURN email, r.confidence as confidence, r.source as source, r.context as context
    ORDER BY email.timestamp DESC
    LIMIT $limit
  `;

  return neo4jClient.query(cypher, { entityId, limit });
}

/**
 * Get top N entities by frequency
 */
export async function getTopEntities(
  type: NodeLabel,
  limit = 10
): Promise<EntityQueryResult[]> {
  const cypher = `
    MATCH (n:${type})
    RETURN n, labels(n)[0] as label
    ORDER BY n.frequency DESC
    LIMIT $limit
  `;

  const results = await neo4jClient.query<{ n: GraphNode; label: NodeLabel }>(
    cypher,
    { limit }
  );

  return results.map((r) => ({ node: r.n, label: r.label }));
}

/**
 * Find people who work with a given person
 */
export async function getWorksWith(
  personId: string,
  limit = 10
): Promise<
  Array<{
    person: GraphNode;
    weight: number;
    emailIds: string[];
  }>
> {
  const cypher = `
    MATCH (p1:Person {normalized: $personId})-[w:WORKS_WITH]-(p2:Person)
    RETURN p2 as person, w.weight as weight, w.emailIds as emailIds
    ORDER BY w.weight DESC
    LIMIT $limit
  `;

  return neo4jClient.query(cypher, { personId, limit });
}

/**
 * Find people who collaborate on a project
 */
export async function getProjectCollaborators(
  projectId: string,
  limit = 20
): Promise<
  Array<{
    person: GraphNode;
    role?: string;
    weight: number;
  }>
> {
  const cypher = `
    MATCH (p:Person)-[c:COLLABORATES_ON]->(proj:Project {normalized: $projectId})
    RETURN p as person, c.role as role, c.weight as weight
    ORDER BY c.weight DESC
    LIMIT $limit
  `;

  return neo4jClient.query(cypher, { projectId, limit });
}

/**
 * Find people who discuss a topic
 */
export async function getTopicExperts(
  topicId: string,
  limit = 10
): Promise<
  Array<{
    person: GraphNode;
    weight: number;
    emailIds: string[];
  }>
> {
  const cypher = `
    MATCH (p:Person)-[d:DISCUSSED_TOPIC]->(t:Topic {normalized: $topicId})
    RETURN p as person, d.weight as weight, d.emailIds as emailIds
    ORDER BY d.weight DESC
    LIMIT $limit
  `;

  return neo4jClient.query(cypher, { topicId, limit });
}

/**
 * Find people at a company
 */
export async function getCompanyPeople(
  companyId: string,
  limit = 20
): Promise<
  Array<{
    person: GraphNode;
    current?: boolean;
    projects: string[];
  }>
> {
  const cypher = `
    MATCH (p:Person)-[w:WORKS_FOR]->(c:Company {normalized: $companyId})
    OPTIONAL MATCH (p)-[:COLLABORATES_ON]->(proj:Project)
    RETURN p as person, w.current as current, collect(proj.name) as projects
    ORDER BY w.weight DESC
    LIMIT $limit
  `;

  return neo4jClient.query(cypher, { companyId, limit });
}

/**
 * Find topics related to a given topic
 */
export async function getRelatedTopics(
  topicId: string,
  limit = 10
): Promise<
  Array<{
    topic: GraphNode;
    weight: number;
  }>
> {
  const cypher = `
    MATCH (t1:Topic {normalized: $topicId})-[r:RELATED_TO]-(t2:Topic)
    RETURN t2 as topic, r.weight as weight
    ORDER BY r.weight DESC
    LIMIT $limit
  `;

  return neo4jClient.query(cypher, { topicId, limit });
}

/**
 * Get all entities mentioned in an email
 */
export async function getEmailEntities(
  emailId: string
): Promise<
  Array<{
    entity: GraphNode;
    type: NodeLabel;
    confidence: number;
    source: string;
  }>
> {
  const cypher = `
    MATCH (entity)-[r:MENTIONED_IN]->(e:Email {id: $emailId})
    RETURN entity, labels(entity)[0] as type, r.confidence as confidence, r.source as source
    ORDER BY r.confidence DESC
  `;

  return neo4jClient.query(cypher, { emailId });
}

/**
 * Search entities by name pattern
 */
export async function searchEntities(
  query: string,
  type?: NodeLabel,
  limit = 20
): Promise<EntityQueryResult[]> {
  const typeFilter = type ? `:${type}` : '';

  const cypher = `
    MATCH (n${typeFilter})
    WHERE n.name CONTAINS $query OR n.normalized CONTAINS $query
    RETURN n, labels(n)[0] as label
    ORDER BY n.frequency DESC
    LIMIT $limit
  `;

  const results = await neo4jClient.query<{ n: GraphNode; label: NodeLabel }>(
    cypher,
    { query: query.toLowerCase(), limit }
  );

  return results.map((r) => ({ node: r.n, label: r.label }));
}

/**
 * Get recent activity (emails mentioning an entity)
 */
export async function getRecentActivity(
  entityId: string,
  type: NodeLabel,
  days = 30,
  limit = 10
): Promise<
  Array<{
    email: any;
    timestamp: Date;
    confidence: number;
  }>
> {
  const cypher = `
    MATCH (entity:${type} {normalized: $entityId})-[r:MENTIONED_IN]->(email:Email)
    WHERE email.timestamp > datetime() - duration({days: $days})
    RETURN email, email.timestamp as timestamp, r.confidence as confidence
    ORDER BY email.timestamp DESC
    LIMIT $limit
  `;

  return neo4jClient.query(cypher, { entityId, days, limit });
}

/**
 * Find shortest path between two entities
 */
export async function findPath(
  entity1Id: string,
  type1: NodeLabel,
  entity2Id: string,
  type2: NodeLabel,
  maxDepth = 3
): Promise<
  Array<{
    path: any[];
    length: number;
  }>
> {
  const cypher = `
    MATCH path = shortestPath(
      (e1:${type1} {normalized: $entity1Id})-[*..${maxDepth}]-(e2:${type2} {normalized: $entity2Id})
    )
    RETURN path, length(path) as length
    ORDER BY length
    LIMIT 5
  `;

  return neo4jClient.query(cypher, { entity1Id, entity2Id });
}

/**
 * Get network statistics for an entity
 */
export async function getEntityStats(
  entityId: string,
  type: NodeLabel
): Promise<{
  frequency: number;
  emailCount: number;
  relationshipCount: number;
  recentActivity: number;
}> {
  const cypher = `
    MATCH (entity:${type} {normalized: $entityId})
    OPTIONAL MATCH (entity)-[:MENTIONED_IN]->(email:Email)
    OPTIONAL MATCH (entity)-[r]-()
    WITH entity, count(DISTINCT email) as emailCount, count(DISTINCT r) as relCount
    OPTIONAL MATCH (entity)-[:MENTIONED_IN]->(recentEmail:Email)
    WHERE recentEmail.timestamp > datetime() - duration({days: 30})
    RETURN
      entity.frequency as frequency,
      emailCount,
      relCount,
      count(DISTINCT recentEmail) as recentActivity
  `;

  const results = await neo4jClient.query<{
    frequency: number;
    emailCount: number;
    relCount: number;
    recentActivity: number;
  }>(cypher, { entityId });

  if (results.length === 0) {
    return {
      frequency: 0,
      emailCount: 0,
      relationshipCount: 0,
      recentActivity: 0,
    };
  }

  return {
    frequency: results[0].frequency || 0,
    emailCount: results[0].emailCount || 0,
    relationshipCount: results[0].relCount || 0,
    recentActivity: results[0].recentActivity || 0,
  };
}
