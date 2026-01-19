/**
 * Query Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { parseQuery, suggestStrategy } from '../parser';

describe('Query Parser', () => {
  describe('parseQuery', () => {
    it('should detect factual queries', () => {
      const queries = [
        'What is machine learning?',
        'Tell me about React',
        'Explain GraphQL',
      ];

      queries.forEach((query) => {
        const parsed = parseQuery(query);
        expect(parsed.type).toBe('factual');
      });
    });

    it('should detect relational queries', () => {
      const queries = [
        'Who works with John?',
        'What is related to authentication?',
        'Find connections for Sarah',
      ];

      queries.forEach((query) => {
        const parsed = parseQuery(query);
        expect(parsed.type).toBe('relational');
      });
    });

    it('should detect temporal queries', () => {
      const queries = [
        'Recent updates',
        'Last week activity',
        'What happened today?',
      ];

      queries.forEach((query) => {
        const parsed = parseQuery(query);
        expect(parsed.type).toBe('temporal');
      });
    });

    it('should extract entities', () => {
      const parsed = parseQuery('Who works with Sarah on the Project Alpha?');

      expect(parsed.entities).toContain('Sarah');
      expect(parsed.entities).toContain('Project');
      expect(parsed.entities).toContain('Alpha');
    });

    it('should extract keywords', () => {
      const parsed = parseQuery('machine learning tutorials for beginners');

      expect(parsed.keywords).toContain('machine');
      expect(parsed.keywords).toContain('learning');
      expect(parsed.keywords).toContain('tutorials');
      expect(parsed.keywords).toContain('beginners');
    });

    it('should filter stop words', () => {
      const parsed = parseQuery('what is the best way to learn');

      expect(parsed.keywords).not.toContain('what');
      expect(parsed.keywords).not.toContain('the');
      expect(parsed.keywords).not.toContain('to');
    });

    it('should extract temporal constraints', () => {
      const parsed = parseQuery('Recent updates from team');

      expect(parsed.temporal).toBeDefined();
      expect(parsed.temporal?.relative).toBe('recent');
      expect(parsed.temporal?.from).toBeInstanceOf(Date);
      expect(parsed.temporal?.to).toBeInstanceOf(Date);
    });

    it('should calculate confidence', () => {
      const goodQuery = parseQuery('Who works with Sarah on authentication?');
      const vagueQuery = parseQuery('stuff things');

      expect(goodQuery.confidence).toBeGreaterThan(0.7);
      expect(vagueQuery.confidence).toBeLessThan(0.7);
    });
  });

  describe('suggestStrategy', () => {
    it('should suggest graph-heavy for relational queries', () => {
      const parsed = parseQuery('Who works with John?');
      const strategy = suggestStrategy(parsed);

      expect(strategy.graphWeight).toBeGreaterThan(strategy.vectorWeight);
      expect(strategy.graphWeight).toBe(0.7);
    });

    it('should suggest vector-heavy with recency for temporal queries', () => {
      const parsed = parseQuery('Recent project updates');
      const strategy = suggestStrategy(parsed);

      expect(strategy.vectorWeight).toBeGreaterThan(strategy.graphWeight);
      expect(strategy.useRecencyBoost).toBe(true);
    });

    it('should suggest balanced for exploratory queries', () => {
      const parsed = parseQuery('Show me everything about GraphQL');
      const strategy = suggestStrategy(parsed);

      expect(strategy.vectorWeight).toBe(0.5);
      expect(strategy.graphWeight).toBe(0.5);
    });
  });
});
