/**
 * Email Scorer
 *
 * Scores emails by significance to the user.
 * SENT emails receive highest baseline score (user actively engaged).
 */

import type { Email } from '../google/types';
import type {
  SignificanceScore,
  ScoreFactor,
  ScoringConfig,
  ScoringContext,
  ContactSignificance,
} from './types';
import { DEFAULT_SCORING_CONFIG } from './types';

export class EmailScorer {
  private config: ScoringConfig;

  constructor(config?: Partial<ScoringConfig>) {
    this.config = {
      weights: {
        ...DEFAULT_SCORING_CONFIG.weights,
        ...config?.weights,
      },
    };
  }

  /**
   * Build scoring context from email batch
   */
  buildContext(emails: Email[], userEmail: string): ScoringContext {
    const contactFrequency = new Map<string, number>();
    const threadDepths = new Map<string, number>();

    // Count contact frequency
    for (const email of emails) {
      // Count recipients (for sent emails)
      if (email.isSent) {
        for (const recipient of email.to) {
          contactFrequency.set(
            recipient.email,
            (contactFrequency.get(recipient.email) || 0) + 1
          );
        }
        if (email.cc) {
          for (const recipient of email.cc) {
            contactFrequency.set(
              recipient.email,
              (contactFrequency.get(recipient.email) || 0) + 1
            );
          }
        }
      } else {
        // Count senders (for received emails)
        contactFrequency.set(
          email.from.email,
          (contactFrequency.get(email.from.email) || 0) + 1
        );
      }

      // Count thread depth
      threadDepths.set(
        email.threadId,
        (threadDepths.get(email.threadId) || 0) + 1
      );
    }

    return {
      contactFrequency,
      threadDepths,
      userEmail,
      totalEmails: emails.length,
    };
  }

  /**
   * Score a single email
   */
  scoreEmail(email: Email, context: ScoringContext): SignificanceScore {
    const factors: ScoreFactor[] = [];
    let totalScore = 0;

    // HIGHEST SIGNAL: User sent this email
    if (email.isSent) {
      const contribution = this.config.weights.isSent * 1.0;
      factors.push({
        name: 'isSent',
        weight: this.config.weights.isSent,
        rawValue: 1.0,
        contribution,
      });
      totalScore += contribution;
    }

    // Reply indicates engagement
    if (this.isReply(email)) {
      const contribution = this.config.weights.isReply * 1.0;
      factors.push({
        name: 'isReply',
        weight: this.config.weights.isReply,
        rawValue: 1.0,
        contribution,
      });
      totalScore += contribution;
    }

    // Thread depth shows sustained conversation
    const depth = context.threadDepths.get(email.threadId) || 1;
    const depthNormalized = Math.min(depth / 10, 1.0);
    const depthContribution = this.config.weights.threadDepth * depthNormalized;
    factors.push({
      name: 'threadDepth',
      weight: this.config.weights.threadDepth,
      rawValue: depth,
      contribution: depthContribution,
    });
    totalScore += depthContribution;

    // Frequent contacts are important
    const recipientFreq = this.getRecipientFrequency(email, context);
    const freqNormalized = Math.min(recipientFreq / 20, 1.0);
    const freqContribution =
      this.config.weights.recipientFrequency * freqNormalized;
    factors.push({
      name: 'recipientFrequency',
      weight: this.config.weights.recipientFrequency,
      rawValue: recipientFreq,
      contribution: freqContribution,
    });
    totalScore += freqContribution;

    // Labels (excluding default labels) indicate organization
    const hasCustomLabels = email.labels.some(
      (l) => !['INBOX', 'SENT', 'UNREAD', 'IMPORTANT', 'CATEGORY_PERSONAL'].includes(l)
    );
    if (hasCustomLabels) {
      const contribution = this.config.weights.hasLabels * 1.0;
      factors.push({
        name: 'hasLabels',
        weight: this.config.weights.hasLabels,
        rawValue: 1.0,
        contribution,
      });
      totalScore += contribution;
    }

    // Stars are explicit signals
    if (email.labels.includes('STARRED')) {
      const contribution = this.config.weights.hasStars * 1.0;
      factors.push({
        name: 'hasStars',
        weight: this.config.weights.hasStars,
        rawValue: 1.0,
        contribution,
      });
      totalScore += contribution;
    }

    // Attachments often indicate important content
    if (email.hasAttachments) {
      const contribution = this.config.weights.hasAttachments * 1.0;
      factors.push({
        name: 'hasAttachments',
        weight: this.config.weights.hasAttachments,
        rawValue: 1.0,
        contribution,
      });
      totalScore += contribution;
    }

    // Normalize to 0-100
    const maxPossibleScore = Object.values(this.config.weights).reduce(
      (sum, weight) => sum + weight,
      0
    );
    const normalizedScore = (totalScore / maxPossibleScore) * 100;

    return {
      emailId: email.id,
      score: Math.round(normalizedScore * 100) / 100, // Round to 2 decimal places
      factors,
      computedAt: new Date(),
    };
  }

  /**
   * Score emails in batch
   */
  scoreBatch(emails: Email[], userEmail: string): SignificanceScore[] {
    const context = this.buildContext(emails, userEmail);
    return emails.map((email) => this.scoreEmail(email, context));
  }

  /**
   * Get top N significant emails
   */
  getTopSignificant(
    emails: Email[],
    userEmail: string,
    n: number
  ): SignificanceScore[] {
    const scores = this.scoreBatch(emails, userEmail);
    return scores.sort((a, b) => b.score - a.score).slice(0, n);
  }

  /**
   * Build contact significance from email history
   */
  buildContactSignificance(
    emails: Email[],
    userEmail: string
  ): ContactSignificance[] {
    const contactMap = new Map<string, {
      name?: string;
      sentCount: number;
      receivedCount: number;
      replies: number;
      lastContact: Date;
      threadDepths: number[];
    }>();

    // Group by contact
    for (const email of emails) {
      if (email.isSent) {
        // Track recipients of sent emails
        for (const recipient of email.to) {
          const contact = contactMap.get(recipient.email) || {
            name: recipient.name,
            sentCount: 0,
            receivedCount: 0,
            replies: 0,
            lastContact: email.date,
            threadDepths: [],
          };

          contact.sentCount++;
          if (email.date > contact.lastContact) {
            contact.lastContact = email.date;
          }

          contactMap.set(recipient.email, contact);
        }
      } else {
        // Track senders of received emails
        const contact = contactMap.get(email.from.email) || {
          name: email.from.name,
          sentCount: 0,
          receivedCount: 0,
          replies: 0,
          lastContact: email.date,
          threadDepths: [],
        };

        contact.receivedCount++;
        if (this.isReply(email)) {
          contact.replies++;
        }
        if (email.date > contact.lastContact) {
          contact.lastContact = email.date;
        }

        contactMap.set(email.from.email, contact);
      }
    }

    // Build context for thread depths
    const context = this.buildContext(emails, userEmail);

    // Convert to ContactSignificance array
    return Array.from(contactMap.entries()).map(([email, data]) => {
      const totalInteractions = data.sentCount + data.receivedCount;
      const replyRate = data.receivedCount > 0 ? data.replies / data.receivedCount : 0;

      // Calculate average thread depth for this contact
      const contactThreads = emails
        .filter((e) =>
          e.isSent
            ? e.to.some((r) => r.email === email)
            : e.from.email === email
        )
        .map((e) => context.threadDepths.get(e.threadId) || 1);

      const threadDepthAvg =
        contactThreads.length > 0
          ? contactThreads.reduce((sum, d) => sum + d, 0) / contactThreads.length
          : 1;

      // Calculate contact score
      // Prioritize sent emails (user initiated contact)
      const score =
        data.sentCount * 2 + // Sent emails are highest signal
        data.receivedCount * 1 +
        replyRate * 10 +
        threadDepthAvg * 2;

      return {
        email,
        name: data.name,
        score: Math.round(score * 100) / 100,
        sentCount: data.sentCount,
        receivedCount: data.receivedCount,
        replyRate: Math.round(replyRate * 100) / 100,
        lastContact: data.lastContact,
        threadDepthAvg: Math.round(threadDepthAvg * 100) / 100,
      };
    });
  }

  /**
   * Check if email is a reply (subject starts with Re:)
   */
  private isReply(email: Email): boolean {
    return email.subject.toLowerCase().startsWith('re:');
  }

  /**
   * Get recipient frequency from context
   */
  private getRecipientFrequency(
    email: Email,
    context: ScoringContext
  ): number {
    if (email.isSent) {
      // For sent emails, check frequency of recipients
      const frequencies = email.to.map(
        (recipient) => context.contactFrequency.get(recipient.email) || 0
      );
      return Math.max(...frequencies, 0);
    } else {
      // For received emails, check frequency of sender
      return context.contactFrequency.get(email.from.email) || 0;
    }
  }
}
