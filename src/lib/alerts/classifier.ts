/**
 * Alert Classifier
 * Determines alert priority based on content signals
 */

import type { Email, CalendarEvent } from '@/lib/google/types';
import {
  AlertLevel,
  ClassifiedAlert,
  ClassificationConfig,
  DEFAULT_CONFIG,
} from './types';
import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';

/**
 * Patterns for detecting automated/promotional emails
 */
const AUTOMATED_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^notifications?@/i,
  /^alerts?@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
];

/**
 * Patterns for bulk/marketing sender domains
 * These senders should never trigger urgent classification
 */
const BULK_SENDER_PATTERNS = [
  /@.*mailchimp\./i,
  /@.*sendgrid\./i,
  /@.*constantcontact\./i,
  /@.*mailgun\./i,
  /@.*campaign-archive\./i,
  /@.*email\./i, // Generic email subdomain (email.company.com)
  /@.*marketing\./i,
  /@.*newsletter\./i,
  /@.*updates?\./i,
  /@.*promo\./i,
  /@.*substack\./i,
  /@.*beehiiv\./i,
  /@.*convertkit\./i,
  /@.*buttondown\./i,
  /newsletter@/i,
  /digest@/i,
  /@.*therundown/i, // The Rundown AI newsletter
];

const NEWSLETTER_PATTERNS = [
  /unsubscribe/i,
  /list-unsubscribe/i,
  /email preferences/i,
  /manage.*subscription/i,
  /opt.?out/i,
];

/**
 * Patterns for newsletter subject lines
 */
const NEWSLETTER_SUBJECT_PATTERNS = [
  /\b(weekly|daily|monthly)\s+(digest|roundup|update|newsletter)/i,
  /\b(issue|edition)\s*#?\d+/i,
  /\[\s*(newsletter|update|digest)\s*\]/i,
];

/**
 * Patterns for newsletter sender names
 */
const NEWSLETTER_SENDER_NAME_PATTERNS = [
  /newsletter/i,
  /digest/i,
  /weekly/i,
  /daily\s+(brief|update|news)/i,
  /the\s+rundown/i, // The Rundown AI
];

const RECEIPT_PATTERNS = [
  /receipt/i,
  /order.*confirm/i,
  /purchase.*confirm/i,
  /payment.*received/i,
  /invoice/i,
  /shipping.*confirm/i,
  /delivery.*confirm/i,
];

/**
 * Check if email is from an automated sender
 */
function isAutomatedSender(email: string): boolean {
  return AUTOMATED_PATTERNS.some((pattern) => pattern.test(email));
}

/**
 * Check if email is from a bulk/marketing sender domain
 */
function isBulkSender(email: string): boolean {
  return BULK_SENDER_PATTERNS.some((pattern) => pattern.test(email));
}

/**
 * Check if sender name matches newsletter patterns
 */
function hasNewsletterSenderName(email: Email): boolean {
  const senderName = email.from.name || '';
  return NEWSLETTER_SENDER_NAME_PATTERNS.some((pattern) => pattern.test(senderName));
}

/**
 * Check if subject matches newsletter patterns
 */
function hasNewsletterSubject(email: Email): boolean {
  return NEWSLETTER_SUBJECT_PATTERNS.some((pattern) => pattern.test(email.subject));
}

/**
 * Check if email has List-Unsubscribe header (most reliable newsletter indicator)
 */
function hasListUnsubscribeHeader(email: Email): boolean {
  return Boolean(email.headers?.['list-unsubscribe']);
}

/**
 * Check if email appears to be a newsletter
 */
function isNewsletter(email: Email): boolean {
  // Most reliable: List-Unsubscribe header
  if (hasListUnsubscribeHeader(email)) {
    return true;
  }

  // Check sender name for newsletter patterns
  if (hasNewsletterSenderName(email)) {
    return true;
  }

  // Check subject for newsletter patterns
  if (hasNewsletterSubject(email)) {
    return true;
  }

  // Check body content for unsubscribe patterns
  const content = `${email.subject} ${email.body}`.toLowerCase();
  return NEWSLETTER_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Check if email is a receipt/confirmation
 */
function isReceipt(email: Email): boolean {
  const content = `${email.subject} ${email.body}`.toLowerCase();
  return RECEIPT_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Check if email contains urgent keywords
 */
function hasUrgentKeywords(
  email: Email,
  keywords: string[]
): { found: boolean; matches: string[] } {
  const content = `${email.subject} ${email.body}`.toLowerCase();
  const matches = keywords.filter((kw) => content.includes(kw.toLowerCase()));
  return { found: matches.length > 0, matches };
}

/**
 * Check if sender is a VIP
 */
function isVipSender(email: Email, vipList: string[]): boolean {
  const senderEmail = email.from.email.toLowerCase();
  return vipList.some((vip) => senderEmail.includes(vip.toLowerCase()));
}

/**
 * Check if this is a reply to user's email
 */
function isReplyToUser(email: Email, userEmail?: string): boolean {
  if (!userEmail) return false;

  // Check if subject starts with Re: and involves user
  const isReply = email.subject.toLowerCase().startsWith('re:');
  const involvesUser = email.to.some(
    (addr) => addr.email.toLowerCase() === userEmail.toLowerCase()
  );

  return isReply && involvesUser;
}

/**
 * Classify an email into an alert level
 */
export async function classifyEmail(
  email: Email,
  config: ClassificationConfig = DEFAULT_CONFIG
): Promise<ClassifiedAlert> {
  const signals: string[] = [];
  let level = AlertLevel.P2_INFO; // Default baseline

  // Check for automated/low-priority first (P3)
  if (isAutomatedSender(email.from.email)) {
    signals.push('Automated sender');
    level = AlertLevel.P3_SILENT;
  } else if (isBulkSender(email.from.email)) {
    signals.push('Bulk/marketing sender');
    level = AlertLevel.P3_SILENT;
  } else if (isNewsletter(email)) {
    signals.push('Newsletter detected');
    level = AlertLevel.P3_SILENT;
  } else if (isReceipt(email)) {
    signals.push('Receipt/confirmation');
    level = AlertLevel.P3_SILENT;
  }

  // If already P3, skip boosting logic
  if (level !== AlertLevel.P3_SILENT) {
    // Check VIP sender (boosts to P1 minimum)
    if (isVipSender(email, config.vipSenders)) {
      signals.push('VIP sender');
      level = AlertLevel.P1_IMPORTANT;
    }

    // Check urgent keywords (+1 level)
    const urgentCheck = hasUrgentKeywords(email, config.urgentKeywords);
    if (urgentCheck.found) {
      signals.push(`Urgent keywords: ${urgentCheck.matches.join(', ')}`);
      level = boostLevel(level);
    }

    // Check if reply to user's email (+1 level)
    if (isReplyToUser(email, config.userEmail)) {
      signals.push('Reply to your email');
      level = boostLevel(level);
    }
  }

  return {
    level,
    title: formatEmailTitle(email, level),
    body: await formatEmailBody(email),
    source: 'email',
    sourceId: email.id,
    signals,
    timestamp: email.date,
    metadata: {
      from: email.from.email,
      subject: email.subject,
      isReply: email.subject.toLowerCase().startsWith('re:'),
    },
  };
}

/**
 * Classify a calendar event into an alert level
 */
export function classifyCalendarEvent(
  event: CalendarEvent,
  config: ClassificationConfig = DEFAULT_CONFIG
): ClassifiedAlert {
  const signals: string[] = [];
  let level = AlertLevel.P2_INFO; // Default baseline

  const now = new Date();
  const eventStart = parseEventTime(event.start);
  const hoursUntilStart = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Time-based classification
  if (hoursUntilStart > 0) {
    if (hoursUntilStart <= 1) {
      signals.push(`Starting in ${Math.round(hoursUntilStart * 60)} minutes`);
      level = AlertLevel.P0_URGENT;
    } else if (hoursUntilStart <= 24) {
      signals.push(`Starting in ${Math.round(hoursUntilStart)} hours`);
      level = AlertLevel.P1_IMPORTANT;
    }
  }

  // Status-based classification
  if (event.status === 'cancelled') {
    signals.push('Event cancelled');
    level = AlertLevel.P1_IMPORTANT;
  }

  // VIP organizer check
  if (event.organizer?.email) {
    const isVip = config.vipSenders.some((vip) =>
      event.organizer!.email.toLowerCase().includes(vip.toLowerCase())
    );
    if (isVip) {
      signals.push('VIP organizer');
      level = boostLevel(level);
    }
  }

  // Default signal if no specific trigger
  if (signals.length === 0) {
    signals.push('Calendar event');
  }

  return {
    level,
    title: formatCalendarTitle(event, level),
    body: formatCalendarBody(event),
    source: 'calendar',
    sourceId: event.id,
    signals,
    timestamp: eventStart,
    metadata: {
      eventStart,
      eventEnd: parseEventTime(event.end),
      location: event.location,
      meetingLink: event.hangoutLink || getConferenceLink(event),
    },
  };
}

/**
 * Boost alert level by one (P2 -> P1 -> P0)
 */
function boostLevel(current: AlertLevel): AlertLevel {
  switch (current) {
    case AlertLevel.P3_SILENT:
      return AlertLevel.P2_INFO;
    case AlertLevel.P2_INFO:
      return AlertLevel.P1_IMPORTANT;
    case AlertLevel.P1_IMPORTANT:
      return AlertLevel.P0_URGENT;
    case AlertLevel.P0_URGENT:
      return AlertLevel.P0_URGENT; // Can't go higher
  }
}

/**
 * Parse event time to Date
 */
function parseEventTime(time: CalendarEvent['start']): Date {
  return new Date(time.dateTime);
}

/**
 * Get conference link from event
 */
function getConferenceLink(event: CalendarEvent): string | undefined {
  const videoEntry = event.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === 'video'
  );
  return videoEntry?.uri;
}

/**
 * Format email alert title
 */
function formatEmailTitle(email: Email, level: AlertLevel): string {
  const prefix = level === AlertLevel.P0_URGENT ? '🔴 URGENT: ' : '';
  const sender = email.from.name || email.from.email.split('@')[0];
  return `${prefix}Email from ${sender}`;
}

/**
 * Format email alert body using LLM for conversational summary
 */
async function formatEmailBody(email: Email): Promise<string> {
  const subject = email.subject || '(no subject)';
  const preview = email.snippet || email.body.slice(0, 500);
  const senderName = email.from.name || email.from.email.split('@')[0];

  // Fallback format for when LLM fails
  const fallbackBody = `Subject: "${subject}"\n${preview}${preview.length >= 100 ? '...' : ''}`;

  try {
    const client = getAIClient();
    const response = await client.chat(
      [
        {
          role: 'system',
          content: `You are a helpful assistant that summarizes emails conversationally.
Summarize the email in ONE natural sentence, like you're explaining it to a friend.
Rules:
- Keep it under 150 characters
- Preserve key info: who it's from, what action (if any) is needed, any deadlines
- Remove HTML entities and technical formatting
- For newsletters/marketing: just the key value prop
- For action required: lead with the action
- Sound natural and conversational`,
        },
        {
          role: 'user',
          content: `Summarize this email from ${senderName}:
Subject: ${subject}
Content: ${preview}`,
        },
      ],
      {
        model: MODELS.CLASSIFIER,
        maxTokens: 100,
        temperature: 0.3,
      }
    );

    const summary = response.content.trim();
    // Validate we got a reasonable response
    if (summary && summary.length > 10 && summary.length < 200) {
      return summary;
    }
    return fallbackBody;
  } catch (error) {
    console.warn('[Classifier] LLM summarization failed, using fallback:', error);
    return fallbackBody;
  }
}

/**
 * Format calendar alert title
 */
function formatCalendarTitle(event: CalendarEvent, level: AlertLevel): string {
  const prefix =
    level === AlertLevel.P0_URGENT
      ? '🔴 '
      : level === AlertLevel.P1_IMPORTANT
        ? '🟠 '
        : '';

  if (event.status === 'cancelled') {
    return `${prefix}CANCELLED: ${event.summary}`;
  }

  return `${prefix}${event.summary}`;
}

/**
 * Format calendar alert body
 */
function formatCalendarBody(event: CalendarEvent): string {
  const parts: string[] = [];

  const start = parseEventTime(event.start);
  if (start) {
    parts.push(
      `📅 ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    );
  }

  if (event.location) {
    parts.push(`📍 ${event.location}`);
  }

  const meetingLink = event.hangoutLink || getConferenceLink(event);
  if (meetingLink) {
    parts.push(`🔗 ${meetingLink}`);
  }

  return parts.join('\n');
}
