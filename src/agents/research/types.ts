/**
 * Research Agent Types
 * Type definitions for the research agent framework
 */

import type { SearchResult } from '@/lib/search';

/**
 * Research source types for multi-source search
 */
export type ResearchSource = 'email' | 'drive' | 'web';

/**
 * Result from any research source (unified format)
 */
export interface ResearchSourceResult {
  sourceType: ResearchSource;
  title: string;
  snippet: string;
  link: string; // URL for web, message ID for email, file ID for drive
  reference: string; // Human-readable reference (e.g., "Email from John on Jan 15")
  date?: Date;
  relevance?: number; // 0-1 relevance score
  metadata?: Record<string, unknown>;
}

/**
 * Research task input configuration
 */
export interface ResearchInput {
  query: string;
  context?: string; // Additional context about what user wants
  maxSources?: number; // default 10
  maxDepth?: number; // search depth, default 1
  focusAreas?: string[]; // specific areas to focus on
  excludeDomains?: string[]; // domains to skip
  sources?: ResearchSource[]; // Sources to search (default: ['web'])
}

/**
 * Research task output
 */
export interface ResearchOutput {
  summary: string;
  findings: ResearchFinding[];
  sources: ResearchSourceSummary[];
  totalTokens: number;
  totalCost: number;
}

/**
 * A research finding with evidence
 */
export interface ResearchFinding {
  claim: string;
  evidence: string;
  confidence: number; // 0-1
  sourceUrl: string;
  quote?: string;
}

/**
 * Summary of a research source
 */
export interface ResearchSourceSummary {
  url: string;
  title: string;
  relevance: number; // 0-1
  credibility: number; // 0-1
  keyPoints: string[];
}

/**
 * Sub-task for query decomposition
 */
export interface ResearchSubTask {
  id: string;
  query: string;
  purpose: string; // why this sub-query
  status: 'pending' | 'running' | 'completed' | 'failed';
  results?: SearchResult[];
  error?: string;
}

/**
 * Source analysis result
 */
export interface SourceAnalysis {
  url: string;
  relevance: number;
  credibility: number;
  findings: ResearchFinding[];
  keyPoints: string[];
}

/**
 * Query plan from planner
 */
export interface ResearchPlan {
  mainQuery: string;
  subTasks: ResearchSubTask[];
  estimatedCost: number;
  estimatedTime: number;
}

/**
 * Synthesis result
 */
export interface SynthesisResult {
  summary: string;
  topFindings: ResearchFinding[];
  citations: string[];
}
