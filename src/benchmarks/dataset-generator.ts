/**
 * Dataset Generator
 *
 * Generates synthetic data for benchmarking:
 * - Memory entries with realistic embeddings
 * - Graph entities (Person, Company, Project, Topic, Location)
 * - Relationships with Zipf distribution
 *
 * Uses OpenAI embeddings API for realistic vectors.
 */

import { embeddingService } from '@/lib/embeddings';
import type { NodeLabel, BaseNodeProperties } from '@/lib/graph/types';

/**
 * Dataset scale options
 */
export type DatasetScale = 'small' | 'medium' | 'large';

/**
 * Scale to record count mapping
 */
const SCALE_SIZES: Record<DatasetScale, number> = {
  small: 100,
  medium: 1000,
  large: 10000,
};

/**
 * Synthetic memory entry for benchmarking
 */
export interface SyntheticMemoryEntry {
  content: string;
  embedding: number[];
  summary?: string;
  importance: number;
  category: string;
  metadata: {
    synthetic: true;
    generatedAt: string;
    tags?: string[];
  };
}

/**
 * Synthetic graph entity
 */
export interface SyntheticEntity {
  label: NodeLabel;
  properties: BaseNodeProperties & {
    synthetic: true;
    generatedAt: string;
  };
}

/**
 * Synthetic relationship
 */
export interface SyntheticRelationship {
  sourceId: string;
  targetId: string;
  sourceLabel: NodeLabel;
  targetLabel: NodeLabel;
  type: string;
  weight: number;
  emailIds: string[];
}

/**
 * Sample content templates for memory generation
 */
const CONTENT_TEMPLATES = [
  'Discussed project timeline with {person} about {topic}',
  'Meeting with {company} regarding {project}',
  'Reviewed proposal for {project} with team in {location}',
  'Email from {person} about {topic} deadline',
  'Conference call with {company} stakeholders',
  'Project update: {project} is progressing well',
  'Need to follow up with {person} on {topic}',
  'Scheduled meeting at {location} to discuss {topic}',
  'Collaboration with {company} on {project}',
  'Research findings on {topic} shared with {person}',
];

/**
 * Sample entity names by type
 */
const SAMPLE_NAMES = {
  Person: [
    'John Smith', 'Sarah Johnson', 'Michael Chen', 'Emily Davis', 'David Wilson',
    'Jessica Brown', 'Robert Martinez', 'Amanda Taylor', 'James Anderson', 'Maria Garcia',
    'Christopher Lee', 'Jennifer White', 'Daniel Harris', 'Lisa Thompson', 'Matthew Clark',
  ],
  Company: [
    'TechCorp', 'InnovateLabs', 'DataSystems Inc', 'CloudFirst', 'DevOps Solutions',
    'AI Research Group', 'Software Partners', 'Digital Ventures', 'NextGen Tech', 'CodeCraft',
  ],
  Project: [
    'Alpha Initiative', 'Beta Platform', 'Customer Portal', 'Mobile App Redesign',
    'API Migration', 'Database Optimization', 'Cloud Migration', 'Security Audit',
    'Performance Enhancement', 'Integration Project',
  ],
  Topic: [
    'Machine Learning', 'Cloud Architecture', 'Data Privacy', 'API Design',
    'Frontend Development', 'DevOps', 'Security', 'Performance Optimization',
    'Scalability', 'User Experience', 'Database Design', 'Testing Strategy',
  ],
  Location: [
    'San Francisco', 'New York', 'Seattle', 'Austin', 'Boston',
    'London', 'Berlin', 'Tokyo', 'Singapore', 'Toronto',
  ],
};

/**
 * Generate random content from templates
 */
function generateContent(entities: Record<NodeLabel, string[]>): string {
  const template = CONTENT_TEMPLATES[Math.floor(Math.random() * CONTENT_TEMPLATES.length)];

  return template.replace(/\{(\w+)\}/g, (match, type) => {
    const typeKey = type.charAt(0).toUpperCase() + type.slice(1) as NodeLabel;
    const names = entities[typeKey];
    if (!names || names.length === 0) return match;
    return names[Math.floor(Math.random() * names.length)];
  });
}

/**
 * Generate normalized name (lowercase, underscores)
 */
function normalizeEntityName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Zipf distribution for realistic frequency distribution
 */
function zipfDistribution(rank: number, s: number = 1.5): number {
  return 1 / Math.pow(rank, s);
}

/**
 * Dataset generator class
 */
export class DatasetGenerator {
  private entityCache: Record<NodeLabel, string[]> = {
    Person: [...SAMPLE_NAMES.Person],
    Company: [...SAMPLE_NAMES.Company],
    Project: [...SAMPLE_NAMES.Project],
    Topic: [...SAMPLE_NAMES.Topic],
    Location: [...SAMPLE_NAMES.Location],
    Email: [],
    Document: [],
  };

  /**
   * Generate synthetic memory entries with embeddings
   */
  async generateMemoryEntries(
    count: number,
    useBatching: boolean = true
  ): Promise<SyntheticMemoryEntry[]> {
    console.log(`[DatasetGen] Generating ${count} memory entries...`);
    const entries: SyntheticMemoryEntry[] = [];

    // Generate content first
    const contents: string[] = [];
    for (let i = 0; i < count; i++) {
      const content = generateContent(this.entityCache);
      contents.push(content);
    }

    // Generate embeddings (batched for efficiency)
    const batchSize = 100;
    const embeddings: number[][] = [];

    if (useBatching && count > batchSize) {
      console.log(`[DatasetGen] Generating embeddings in batches of ${batchSize}...`);

      for (let i = 0; i < contents.length; i += batchSize) {
        const batch = contents.slice(i, Math.min(i + batchSize, contents.length));
        const progress = Math.min(i + batchSize, contents.length);
        console.log(`[DatasetGen] Progress: ${progress}/${contents.length} (${((progress / contents.length) * 100).toFixed(1)}%)`);

        try {
          const results = await embeddingService.generateEmbeddings(batch);
          embeddings.push(...results.map(r => r.embedding));
        } catch (error) {
          console.error('[DatasetGen] Error generating batch embeddings:', error);
          // Fallback to test embeddings
          for (let j = 0; j < batch.length; j++) {
            embeddings.push(this.generateTestEmbedding(i + j));
          }
        }
      }
    } else {
      // Single requests or small dataset
      for (let i = 0; i < contents.length; i++) {
        if (i % 10 === 0) {
          console.log(`[DatasetGen] Progress: ${i}/${contents.length} (${((i / contents.length) * 100).toFixed(1)}%)`);
        }

        try {
          const result = await embeddingService.generateEmbedding(contents[i]);
          embeddings.push(result.embedding);
        } catch (error) {
          console.error(`[DatasetGen] Error generating embedding ${i}:`, error);
          embeddings.push(this.generateTestEmbedding(i));
        }
      }
    }

    // Create memory entries
    for (let i = 0; i < count; i++) {
      const importance = Math.max(1, Math.min(10, Math.floor(Math.random() * 10) + 1));
      const category = ['work', 'personal', 'research', 'meetings', 'notes'][
        Math.floor(Math.random() * 5)
      ];

      entries.push({
        content: contents[i],
        embedding: embeddings[i],
        summary: contents[i].substring(0, 100),
        importance,
        category,
        metadata: {
          synthetic: true,
          generatedAt: new Date().toISOString(),
          tags: this.generateTags(),
        },
      });
    }

    console.log(`[DatasetGen] Generated ${entries.length} memory entries`);
    return entries;
  }

  /**
   * Generate synthetic graph entities
   */
  generateEntities(scale: DatasetScale): SyntheticEntity[] {
    const count = SCALE_SIZES[scale];
    console.log(`[DatasetGen] Generating ${count} graph entities (${scale} scale)...`);

    const entities: SyntheticEntity[] = [];
    const labels: NodeLabel[] = ['Person', 'Company', 'Project', 'Topic', 'Location'];

    // Generate entities with Zipf distribution for realistic frequency
    for (let i = 0; i < count; i++) {
      const label = labels[Math.floor(Math.random() * labels.length)];
      const frequency = Math.floor(zipfDistribution(i + 1) * 100);
      const name = this.generateEntityName(label, i);

      entities.push({
        label,
        properties: {
          name,
          normalized: normalizeEntityName(name),
          frequency,
          confidence: 0.7 + Math.random() * 0.3,
          firstSeen: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
          lastSeen: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          synthetic: true,
          generatedAt: new Date().toISOString(),
        },
      });
    }

    console.log(`[DatasetGen] Generated ${entities.length} entities`);
    return entities;
  }

  /**
   * Generate synthetic relationships with Zipf distribution
   */
  generateRelationships(
    entities: SyntheticEntity[],
    relationshipsPerEntity: number = 5
  ): SyntheticRelationship[] {
    console.log(`[DatasetGen] Generating relationships (avg ${relationshipsPerEntity} per entity)...`);

    const relationships: SyntheticRelationship[] = [];
    const relationshipTypes = [
      'WORKS_WITH',
      'DISCUSSED_TOPIC',
      'COLLABORATES_ON',
      'WORKS_FOR',
      'RELATED_TO',
      'LOCATED_AT',
    ];

    for (const entity of entities) {
      const numRelationships = Math.max(
        1,
        Math.floor(relationshipsPerEntity * zipfDistribution(entity.properties.frequency + 1))
      );

      for (let i = 0; i < numRelationships; i++) {
        const target = entities[Math.floor(Math.random() * entities.length)];
        if (target.properties.normalized === entity.properties.normalized) continue;

        const type = relationshipTypes[Math.floor(Math.random() * relationshipTypes.length)];
        const weight = Math.floor(zipfDistribution(i + 1) * 50);

        relationships.push({
          sourceId: entity.properties.normalized,
          targetId: target.properties.normalized,
          sourceLabel: entity.label,
          targetLabel: target.label,
          type,
          weight,
          emailIds: this.generateEmailIds(weight),
        });
      }
    }

    console.log(`[DatasetGen] Generated ${relationships.length} relationships`);
    return relationships;
  }

  /**
   * Generate entity name with uniqueness
   */
  private generateEntityName(label: NodeLabel, index: number): string {
    const samples = SAMPLE_NAMES[label as keyof typeof SAMPLE_NAMES];
    if (!samples) return `${label}_${index}`;

    if (index < samples.length) {
      return samples[index];
    }

    // Generate variations
    const base = samples[index % samples.length];
    const suffix = Math.floor(index / samples.length);
    return `${base} ${suffix}`;
  }

  /**
   * Generate test embedding (deterministic for development)
   */
  private generateTestEmbedding(seed: number): number[] {
    const random = this.seededRandom(seed);
    return Array.from({ length: 1536 }, () => random());
  }

  /**
   * Seeded random number generator
   */
  private seededRandom(seed: number): () => number {
    let state = seed + 42;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return (state / 4294967296) * 2 - 1; // Range: -1 to 1
    };
  }

  /**
   * Generate random tags
   */
  private generateTags(): string[] {
    const allTags = ['important', 'urgent', 'follow-up', 'meeting', 'project', 'review', 'decision'];
    const count = Math.floor(Math.random() * 3);
    const tags: string[] = [];

    for (let i = 0; i < count; i++) {
      const tag = allTags[Math.floor(Math.random() * allTags.length)];
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }

    return tags;
  }

  /**
   * Generate email IDs for relationships
   */
  private generateEmailIds(count: number): string[] {
    return Array.from({ length: Math.min(count, 10) }, (_, i) =>
      `email_${Date.now()}_${Math.random().toString(36).substring(7)}`
    );
  }

  /**
   * Get dataset scale size
   */
  static getScaleSize(scale: DatasetScale): number {
    return SCALE_SIZES[scale];
  }
}
