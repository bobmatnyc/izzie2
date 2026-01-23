/**
 * Alert Classifier
 * Determines alert priority based on content signals
 */

import type { Email } from '@/lib/google/types';
import type { CalendarEvent } from '@/lib/calendar/types';
import {
  AlertLevel,
  ClassifiedAlert,
  ClassificationConfig,
  DEFAULT_CONFIG,
} from './types';

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

const NEWSLETTER_PATTERNS = [
  /unsubscribe/i,
  /list-unsubscribe/i,
  /email preferences/i,
  /manage.*subscription/i,
  /opt.?out/i,
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
 * Check if email appears to be a newsletter
 */
function isNewsletter(email: Email): boolean {
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
export function classifyEmail(
  email: Email,
  config: ClassificationConfig = DEFAULT_CONFIG
): ClassifiedAlert {
  const signals: string[] = [];
  let level = AlertLevel.P2_INFO; // Default baseline

  // Check for automated/low-priority first (P3)
  if (isAutomatedSender(email.from.email)) {
    signals.push('Automated sender');
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
    body: formatEmailBody(email),
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
  const hoursUntilStart = eventStart
    ? (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60)
    : null;

  // Time-based classification
  if (hoursUntilStart !== null && hoursUntilStart > 0) {
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
    timestamp: eventStart || now,
    metadata: {
      eventStart: eventStart ?? undefined,
      eventEnd: parseEventTime(event.end) ?? undefined,
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
function parseEventTime(time: CalendarEvent['start']): Date | null {
  if (time.dateTime) {
    return new Date(time.dateTime);
  }
  if (time.date) {
    return new Date(time.date);
  }
  return null;
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
 * Format email alert body
 */
function formatEmailBody(email: Email): string {
  const subject = email.subject || '(no subject)';
  const preview = email.snippet || email.body.slice(0, 100);
  return `Subject: "${subject}"\n${preview}${preview.length >= 100 ? '...' : ''}`;
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
