import { getAIClient, MODELS } from '@/lib/ai';
import type { Entity, EntityType } from '@/lib/extraction/types';
import type { InferredRelationship, RelationshipInferenceResult, RelationshipType } from './types';

const LOG_PREFIX = '[Relationship Inference]';

// Valid relationship constraints (from → to types)
const VALID_RELATIONSHIPS: Record<RelationshipType, [EntityType[], EntityType[]]> = {
  'WORKS_WITH': [['person'], ['person']],
  'REPORTS_TO': [['person'], ['person']],
  'WORKS_FOR': [['person'], ['company']],
  'LEADS': [['person'], ['project']],
  'WORKS_ON': [['person'], ['project']],
  'EXPERT_IN': [['person'], ['topic']],
  'LOCATED_IN': [['person', 'company'], ['location']],
  'PARTNERS_WITH': [['company'], ['company']],
  'COMPETES_WITH': [['company'], ['company']],
  'OWNS': [['company'], ['project']],
  'RELATED_TO': [['project', 'topic'], ['project', 'topic']],
  'DEPENDS_ON': [['project'], ['project']],
  'PART_OF': [['project'], ['project']],
  'SUBTOPIC_OF': [['topic'], ['topic']],
  'ASSOCIATED_WITH': [['topic'], ['topic']],
};

const INFERENCE_PROMPT = `You are an expert at analyzing text to identify relationships between entities.

Given a list of entities extracted from a document and the source content, identify meaningful relationships between them.

ENTITY TYPES: person, company, project, topic, location

RELATIONSHIP TYPES (use exactly these):
- WORKS_WITH: Two people who work together/collaborate
- REPORTS_TO: Person reports to another person (hierarchy)
- WORKS_FOR: Person works for a company
- LEADS: Person leads/manages a project
- WORKS_ON: Person works on a project
- EXPERT_IN: Person has expertise in a topic
- LOCATED_IN: Person or company is located in a place
- PARTNERS_WITH: Two companies partner together
- COMPETES_WITH: Two companies compete
- OWNS: Company owns/runs a project
- RELATED_TO: Projects or topics are related
- DEPENDS_ON: Project depends on another project
- PART_OF: Project is part of a larger project
- SUBTOPIC_OF: Topic is a subtopic of another
- ASSOCIATED_WITH: Topics are associated

RULES:
1. Only infer relationships with clear evidence in the content
2. Confidence should reflect how explicitly the relationship is stated (0.5-1.0)
3. Include a brief quote or evidence supporting each relationship
4. Focus on meaningful relationships, not every possible connection
5. Maximum 10 relationships per analysis

Return JSON array of relationships:
[
  {
    "fromType": "person",
    "fromValue": "John Smith",
    "toType": "company",
    "toValue": "Acme Corp",
    "relationship": "WORKS_FOR",
    "confidence": 0.9,
    "evidence": "John mentioned he joined Acme Corp last month"
  }
]

If no clear relationships can be inferred, return an empty array: []`;

export async function inferRelationships(
  entities: Entity[],
  sourceContent: string,
  sourceId: string,
  userId: string
): Promise<RelationshipInferenceResult> {
  const startTime = Date.now();

  // Filter to meaningful entity types
  const relevantEntities = entities.filter(e =>
    ['person', 'company', 'project', 'topic', 'location'].includes(e.type)
  );

  if (relevantEntities.length < 2) {
    console.log(`${LOG_PREFIX} Not enough entities for relationship inference (${relevantEntities.length} entities)`);
    return {
      relationships: [],
      sourceContent,
      processingTime: Date.now() - startTime,
      tokenCost: 0,
    };
  }

  // Prepare entity summary for LLM
  const entitySummary = relevantEntities
    .map(e => `- ${e.type}: "${e.normalized || e.value}"`)
    .join('\n');

  // Truncate content if too long (keep costs down)
  const truncatedContent = sourceContent.length > 3000
    ? sourceContent.substring(0, 3000) + '...[truncated]'
    : sourceContent;

  const userPrompt = `ENTITIES FOUND:
${entitySummary}

SOURCE CONTENT:
${truncatedContent}

Analyze and return relationships as JSON array:`;

  try {
    console.log(`${LOG_PREFIX} Inferring relationships from ${relevantEntities.length} entities`);

    const client = getAIClient();
    const response = await client.chat(
      [
        { role: 'system', content: INFERENCE_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      {
        model: MODELS.CLASSIFIER,
        maxTokens: 1000,
        temperature: 0.3,
        logCost: true,
      }
    );

    // Parse response
    const content = response.content || '[]';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const rawRelationships = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Transform and validate relationships
    const relationships: InferredRelationship[] = rawRelationships
      .filter((r: any) => validateRelationship(r))
      .map((r: any) => ({
        fromEntityType: r.fromType as EntityType,
        fromEntityValue: r.fromValue,
        toEntityType: r.toType as EntityType,
        toEntityValue: r.toValue,
        relationshipType: r.relationship as RelationshipType,
        confidence: Math.min(1, Math.max(0, r.confidence || 0.5)),
        evidence: r.evidence || '',
        sourceId,
        inferredAt: new Date().toISOString(),
        userId,
      }));

    console.log(`${LOG_PREFIX} Inferred ${relationships.length} relationships from ${relevantEntities.length} entities`);

    return {
      relationships,
      sourceContent,
      processingTime: Date.now() - startTime,
      tokenCost: client.getTotalCost(),
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Inference failed:`, error);
    return {
      relationships: [],
      sourceContent,
      processingTime: Date.now() - startTime,
      tokenCost: 0,
    };
  }
}

function validateRelationship(r: any): boolean {
  if (!r.fromType || !r.fromValue || !r.toType || !r.toValue || !r.relationship) {
    console.warn(`${LOG_PREFIX} Invalid relationship structure:`, r);
    return false;
  }

  const constraints = VALID_RELATIONSHIPS[r.relationship as RelationshipType];
  if (!constraints) {
    console.warn(`${LOG_PREFIX} Unknown relationship type: ${r.relationship}`);
    return false;
  }

  const [validFromTypes, validToTypes] = constraints;
  const isValid = validFromTypes.includes(r.fromType) && validToTypes.includes(r.toType);

  if (!isValid) {
    console.warn(`${LOG_PREFIX} Invalid relationship types: ${r.fromType} -[${r.relationship}]-> ${r.toType}`);
  }

  return isValid;
}

// Batch inference for multiple sources
export async function inferRelationshipsBatch(
  sources: Array<{ entities: Entity[]; content: string; sourceId: string }>,
  userId: string
): Promise<InferredRelationship[]> {
  console.log(`${LOG_PREFIX} Batch inferring relationships for ${sources.length} sources`);
  const allRelationships: InferredRelationship[] = [];

  for (const source of sources) {
    const result = await inferRelationships(
      source.entities,
      source.content,
      source.sourceId,
      userId
    );
    allRelationships.push(...result.relationships);

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const deduplicated = deduplicateRelationships(allRelationships);
  console.log(`${LOG_PREFIX} Batch inference complete: ${allRelationships.length} total, ${deduplicated.length} after deduplication`);

  return deduplicated;
}

// Deduplicate and merge relationships with same entities
function deduplicateRelationships(relationships: InferredRelationship[]): InferredRelationship[] {
  const map = new Map<string, InferredRelationship>();

  for (const rel of relationships) {
    const key = `${rel.fromEntityType}:${rel.fromEntityValue.toLowerCase()}:${rel.relationshipType}:${rel.toEntityType}:${rel.toEntityValue.toLowerCase()}`;

    const existing = map.get(key);
    if (!existing || rel.confidence > existing.confidence) {
      map.set(key, rel);
    }
  }

  return Array.from(map.values());
}
