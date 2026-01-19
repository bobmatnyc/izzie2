/**
 * Result Ranker Tests
 */

import { describe, it, expect } from 'vitest';
import {
  rankVectorResults,
  mergeAndRank,
  getTopResults,
  filterByThreshold,
  DEFAULT_WEIGHTS,
} from '../ranker';
import type { VectorSearchResult } from '@/lib/db/vectors';
import type { ParsedQuery, RankedResult } from '../types';

describe('Result Ranker', () => {
  const mockQuery: ParsedQuery = {
    original: 'test query',
    type: 'semantic',
    entities: ['Test'],
    keywords: ['test', 'query'],
    intent: 'Find semantically similar content for: test, query',
    confidence: 0.8,
  };

  const mockVectorResult: VectorSearchResult = {
    id: 'vec-1',
    userId: 'user-123',
    conversationId: null,
    content: 'Test content with query keywords',
    summary: null,
    metadata: {},
    embedding: [],
    importance: 7,
    accessCount: 5,
    lastAccessedAt: null,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    similarity: 0.85,
  };

  describe('rankVectorResults', () => {
    it('should calculate combined score', () => {
      const results = rankVectorResults([mockVectorResult], mockQuery);

      expect(results).toHaveLength(1);
      expect(results[0].scores.combined).toBeGreaterThan(0);
      expect(results[0].scores.vector).toBe(0.85);
    });

    it('should boost recent items', () => {
      const recentResult = {
        ...mockVectorResult,
        id: 'vec-recent',
        createdAt: new Date(),
      };

      const oldResult = {
        ...mockVectorResult,
        id: 'vec-old',
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      };

      const ranked = rankVectorResults([recentResult, oldResult], mockQuery);

      expect(ranked[0].scores.recency).toBeGreaterThan(ranked[1]!.scores.recency!);
    });

    it('should calculate entity overlap', () => {
      const withEntity = {
        ...mockVectorResult,
        content: 'Content mentioning Test entity',
      };

      const withoutEntity = {
        ...mockVectorResult,
        id: 'vec-2',
        content: 'Content without the entity',
      };

      const ranked = rankVectorResults([withEntity, withoutEntity], mockQuery);

      expect(ranked[0].scores.entityOverlap).toBeGreaterThan(
        ranked[1]!.scores.entityOverlap!
      );
    });

    it('should normalize importance score', () => {
      const highImportance = {
        ...mockVectorResult,
        importance: 10,
      };

      const lowImportance = {
        ...mockVectorResult,
        id: 'vec-2',
        importance: 1,
      };

      const ranked = rankVectorResults(
        [highImportance, lowImportance],
        mockQuery
      );

      expect(ranked[0].scores.importance).toBe(1.0); // 10/10
      expect(ranked[1].scores.importance).toBe(0.1); // 1/10
    });

    it('should include relevance reason', () => {
      const ranked = rankVectorResults([mockVectorResult], mockQuery);

      expect(ranked[0].metadata.relevanceReason).toBeDefined();
      expect(ranked[0].metadata.relevanceReason).toBeTruthy();
    });
  });

  describe('mergeAndRank', () => {
    it('should merge vector and graph results', () => {
      const vectorRanked = rankVectorResults([mockVectorResult], mockQuery);
      const graphRanked: RankedResult[] = []; // Empty for simplicity

      const merged = mergeAndRank(vectorRanked, graphRanked);

      expect(merged).toHaveLength(1);
    });

    it('should deduplicate results', () => {
      const result1 = rankVectorResults([mockVectorResult], mockQuery)[0];
      const result2 = { ...result1 }; // Duplicate

      const merged = mergeAndRank([result1, result2], []);

      expect(merged).toHaveLength(1); // Deduplicated
    });

    it('should sort by combined score', () => {
      const highScore = {
        ...mockVectorResult,
        similarity: 0.95,
      };

      const lowScore = {
        ...mockVectorResult,
        id: 'vec-2',
        similarity: 0.6,
      };

      const ranked = rankVectorResults([lowScore, highScore], mockQuery);
      const merged = mergeAndRank(ranked, []);

      expect(merged[0].scores.combined).toBeGreaterThan(
        merged[1].scores.combined
      );
    });
  });

  describe('getTopResults', () => {
    it('should limit results', () => {
      const results = rankVectorResults(
        Array(20).fill(mockVectorResult).map((r, i) => ({ ...r, id: `vec-${i}` })),
        mockQuery
      );

      const top5 = getTopResults(results, 5);

      expect(top5).toHaveLength(5);
    });
  });

  describe('filterByThreshold', () => {
    it('should filter by minimum score', () => {
      const highScore = {
        ...mockVectorResult,
        similarity: 0.9,
      };

      const lowScore = {
        ...mockVectorResult,
        id: 'vec-2',
        similarity: 0.5,
      };

      const ranked = rankVectorResults([highScore, lowScore], mockQuery);
      const filtered = filterByThreshold(ranked, 0.7);

      expect(filtered.length).toBeLessThan(ranked.length);
      expect(filtered.every((r) => r.scores.combined >= 0.7)).toBe(true);
    });
  });
});
