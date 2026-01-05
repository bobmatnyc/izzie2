/**
 * Email Scoring Module
 *
 * Exports scoring functionality for email significance and contact analysis.
 */

export { EmailScorer } from './email-scorer';
export { ContactAnalyzer } from './contact-analyzer';

export type {
  SignificanceScore,
  ScoreFactor,
  ContactSignificance,
  ScoringConfig,
  ScoringContext,
} from './types';

export { DEFAULT_SCORING_CONFIG } from './types';
