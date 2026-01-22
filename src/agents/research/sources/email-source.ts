/**
 * Email Source for Research Agent
 * Searches emails using GmailService
 */

import { GmailService } from '@/lib/google/gmail';
import type { Auth } from 'googleapis';
import type { ResearchSourceResult } from '../types';
import type { Email } from '@/lib/google/types';

const MAX_RESULTS_DEFAULT = 5;

export interface EmailSearchOptions {
  maxResults?: number;
  since?: Date;
  folder?: 'inbox' | 'sent' | 'all';
}

/**
 * Search emails by query keywords
 * Returns top results with unified ResearchSourceResult format
 */
export async function searchEmails(
  auth: Auth.GoogleAuth | Auth.OAuth2Client,
  query: string,
  options: EmailSearchOptions = {}
): Promise<ResearchSourceResult[]> {
  const { maxResults = MAX_RESULTS_DEFAULT, since, folder = 'all' } = options;

  const gmailService = new GmailService(auth);

  try {
    // Gmail uses its own query syntax - pass query directly
    // This searches subject, body, sender, etc.
    const batch = await gmailService.fetchEmails({
      folder,
      maxResults,
      since,
    });

    // Filter emails by query keywords (Gmail API doesn't support full-text search in list)
    const filteredEmails = filterEmailsByQuery(batch.emails, query);

    // Convert to unified format
    const results: ResearchSourceResult[] = filteredEmails
      .slice(0, maxResults)
      .map((email) => emailToResearchResult(email));

    console.log(
      `[EmailSource] Found ${results.length} emails matching "${query}"`
    );

    return results;
  } catch (error) {
    console.error('[EmailSource] Failed to search emails:', error);
    return [];
  }
}

/**
 * Filter emails by query keywords
 * Checks subject, body, and sender
 */
function filterEmailsByQuery(emails: Email[], query: string): Email[] {
  const keywords = query.toLowerCase().split(/\s+/);

  return emails.filter((email) => {
    const searchText = [
      email.subject,
      email.body,
      email.from.email,
      email.from.name || '',
      email.snippet || '',
    ]
      .join(' ')
      .toLowerCase();

    // Match if any keyword is found
    return keywords.some((keyword) => searchText.includes(keyword));
  });
}

/**
 * Convert Email to ResearchSourceResult
 */
function emailToResearchResult(email: Email): ResearchSourceResult {
  const senderName = email.from.name || email.from.email;
  const dateStr = email.date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return {
    sourceType: 'email',
    title: email.subject,
    snippet: truncateText(email.snippet || email.body, 200),
    link: email.id,
    reference: `Email from ${senderName} on ${dateStr}`,
    date: email.date,
    metadata: {
      threadId: email.threadId,
      from: email.from,
      to: email.to,
      hasAttachments: email.hasAttachments,
      labels: email.labels,
    },
  };
}

/**
 * Truncate text to specified length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
