/**
 * Contact Analyzer
 *
 * Analyzes contact importance from email history.
 * Prioritizes contacts the user sends emails to (highest signal).
 */

import type { Email } from '../google/types';
import type { ContactSignificance } from './types';
import { EmailScorer } from './email-scorer';

export class ContactAnalyzer {
  private scorer: EmailScorer;

  constructor() {
    this.scorer = new EmailScorer();
  }

  /**
   * Analyze contacts from email history
   */
  analyzeContacts(emails: Email[], userEmail: string): ContactSignificance[] {
    const contacts = this.scorer.buildContactSignificance(emails, userEmail);

    // Sort by score (descending)
    return contacts.sort((a, b) => b.score - a.score);
  }

  /**
   * Get VIP contacts (top 10% by score)
   */
  getVIPContacts(
    emails: Email[],
    userEmail: string,
    threshold?: number
  ): ContactSignificance[] {
    const contacts = this.analyzeContacts(emails, userEmail);

    if (threshold !== undefined) {
      // Use explicit threshold
      return contacts.filter((c) => c.score >= threshold);
    }

    // Use top 10%
    const topCount = Math.max(Math.ceil(contacts.length * 0.1), 1);
    return contacts.slice(0, topCount);
  }

  /**
   * Get frequent correspondents (minimum interaction count)
   */
  getFrequentCorrespondents(
    emails: Email[],
    userEmail: string,
    minCount: number = 5
  ): ContactSignificance[] {
    const contacts = this.analyzeContacts(emails, userEmail);

    return contacts.filter(
      (c) => c.sentCount + c.receivedCount >= minCount
    );
  }

  /**
   * Get contacts user actively engages with (high sent count)
   */
  getActiveCorrespondents(
    emails: Email[],
    userEmail: string,
    minSentCount: number = 3
  ): ContactSignificance[] {
    const contacts = this.analyzeContacts(emails, userEmail);

    return contacts.filter((c) => c.sentCount >= minSentCount);
  }

  /**
   * Get recent contacts (contacted in last N days)
   */
  getRecentContacts(
    emails: Email[],
    userEmail: string,
    daysBack: number = 30
  ): ContactSignificance[] {
    const contacts = this.analyzeContacts(emails, userEmail);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    return contacts.filter((c) => c.lastContact >= cutoffDate);
  }

  /**
   * Get contact statistics summary
   */
  getContactStats(
    emails: Email[],
    userEmail: string
  ): {
    totalContacts: number;
    vipCount: number;
    activeCount: number;
    avgSentCount: number;
    avgReceivedCount: number;
    avgReplyRate: number;
    topContact?: ContactSignificance;
  } {
    const contacts = this.analyzeContacts(emails, userEmail);

    if (contacts.length === 0) {
      return {
        totalContacts: 0,
        vipCount: 0,
        activeCount: 0,
        avgSentCount: 0,
        avgReceivedCount: 0,
        avgReplyRate: 0,
      };
    }

    const vipCount = Math.ceil(contacts.length * 0.1);
    const activeCount = contacts.filter((c) => c.sentCount >= 3).length;

    const avgSentCount =
      contacts.reduce((sum, c) => sum + c.sentCount, 0) / contacts.length;
    const avgReceivedCount =
      contacts.reduce((sum, c) => sum + c.receivedCount, 0) / contacts.length;
    const avgReplyRate =
      contacts.reduce((sum, c) => sum + c.replyRate, 0) / contacts.length;

    return {
      totalContacts: contacts.length,
      vipCount,
      activeCount,
      avgSentCount: Math.round(avgSentCount * 100) / 100,
      avgReceivedCount: Math.round(avgReceivedCount * 100) / 100,
      avgReplyRate: Math.round(avgReplyRate * 100) / 100,
      topContact: contacts[0],
    };
  }
}
