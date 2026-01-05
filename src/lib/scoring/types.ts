/**
 * Email Significance Scoring Types
 *
 * Defines types for scoring emails by significance to build user memory.
 * Key insight: SENT emails are highest signal (user actively engaged).
 */

export interface SignificanceScore {
  emailId: string;
  score: number; // 0-100 normalized
  factors: ScoreFactor[];
  computedAt: Date;
}

export interface ScoreFactor {
  name: string;
  weight: number;
  rawValue: number;
  contribution: number; // weight * normalized value
}

export interface ContactSignificance {
  email: string;
  name?: string;
  score: number;
  sentCount: number; // Emails sent TO this person
  receivedCount: number; // Emails FROM this person
  replyRate: number; // How often they reply
  lastContact: Date;
  threadDepthAvg: number;
}

export interface ScoringConfig {
  weights: {
    isSent: number; // Default: 40 (highest weight!)
    isReply: number; // Default: 15
    threadDepth: number; // Default: 10
    recipientFrequency: number; // Default: 15
    hasLabels: number; // Default: 5
    hasStars: number; // Default: 10
    hasAttachments: number; // Default: 5
  };
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    isSent: 40,
    isReply: 15,
    threadDepth: 10,
    recipientFrequency: 15,
    hasLabels: 5,
    hasStars: 10,
    hasAttachments: 5,
  },
};

export interface ScoringContext {
  contactFrequency: Map<string, number>; // email -> count
  threadDepths: Map<string, number>; // threadId -> depth
  userEmail: string; // to detect sent emails
  totalEmails: number; // for normalization
}
