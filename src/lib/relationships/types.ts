import type { EntityType } from '../extraction/types';

// Relationship types between entities
export type RelationshipType =
  // Person relationships (professional)
  | 'WORKS_WITH'        // Person ↔ Person (colleagues)
  | 'REPORTS_TO'        // Person → Person (hierarchy)
  | 'WORKS_FOR'         // Person → Company
  | 'LEADS'             // Person → Project
  | 'WORKS_ON'          // Person → Project
  | 'EXPERT_IN'         // Person → Topic
  | 'LOCATED_IN'        // Person/Company → Location
  // Person relationships (familial/personal)
  | 'FAMILY_OF'         // Person ↔ Person (general family relation)
  | 'MARRIED_TO'        // Person ↔ Person (spouse)
  | 'SIBLING_OF'        // Person ↔ Person (brother/sister)
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

export interface InferredRelationship {
  id?: string;
  fromEntityType: EntityType;
  fromEntityValue: string;      // normalized value
  toEntityType: EntityType;
  toEntityValue: string;        // normalized value
  relationshipType: RelationshipType;
  confidence: number;           // 0-1 from LLM
  evidence: string;             // Quote/context supporting this
  sourceId: string;             // Email/doc this came from
  inferredAt: string;           // ISO timestamp
  userId: string;
}

export interface RelationshipInferenceResult {
  relationships: InferredRelationship[];
  sourceContent: string;
  processingTime: number;
  tokenCost: number;
}

// For graph visualization
export interface GraphNode {
  id: string;
  label: string;
  type: EntityType;
  size?: number;        // Based on connection count
  color?: string;
}

export interface GraphEdge {
  source: string;       // node id
  target: string;       // node id
  type: RelationshipType;
  weight: number;       // Based on confidence * occurrences
  label?: string;
}

export interface RelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    avgConnections: number;
  };
}
