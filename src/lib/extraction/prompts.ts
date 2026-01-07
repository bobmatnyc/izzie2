/**
 * Entity Extraction Prompts
 *
 * Prompts for Mistral to extract structured entities from emails and calendar events.
 * Uses JSON output format for reliable parsing.
 */

import type { Email, CalendarEvent } from '../google/types';
import type { ExtractionConfig } from './types';

/**
 * Build extraction prompt for Mistral
 */
export function buildExtractionPrompt(email: Email, config: ExtractionConfig): string {
  const sources: string[] = [];

  if (config.extractFromMetadata) {
    sources.push(`**From:** ${email.from.name || email.from.email}`);
    sources.push(`**To:** ${email.to.map((t) => t.name || t.email).join(', ')}`);
    if (email.cc && email.cc.length > 0) {
      sources.push(`**CC:** ${email.cc.map((c) => c.name || c.email).join(', ')}`);
    }
  }

  if (config.extractFromSubject) {
    sources.push(`**Subject:** ${email.subject}`);
  }

  if (config.extractFromBody) {
    sources.push(`**Body:**\n${email.body}`);
  }

  // Context-aware person extraction: restrict to metadata only
  const personExtractionRule = email.isSent
    ? '1. **person** - People\'s names (ONLY from To/CC recipient lists - people you sent this email to)'
    : '1. **person** - People\'s names (ONLY from From/To/CC metadata - NOT from email body text)';

  return `Extract structured entities and classify spam from this email.

${sources.join('\n')}

**Entity Types to Extract:**
${personExtractionRule}
2. **company** - Organizations and companies (from metadata, subject, and body)
3. **project** - Project names and references (from metadata, subject, and body)
4. **date** - Important dates and deadlines (from metadata, subject, and body)
5. **topic** - Subject areas and themes (from metadata, subject, and body)
6. **location** - Geographic locations (from metadata, subject, and body)
7. **action_item** - Tasks, todos, and action items (from subject and body)

**Spam Classification:**
Classify if this email is spam/promotional/low-value based on:
- Marketing/promotional content
- Mass-distributed newsletters
- Automated notifications with no actionable content
- Phishing attempts or suspicious patterns
- Low relevance to recipient

**Instructions:**
- Extract all entities with confidence scores (0.0 to 1.0)
- Normalize names (e.g., "Bob" might be "Robert")
- Include source (metadata, subject, or body)
- Link email addresses to person entities when possible
- Minimum confidence threshold: ${config.minConfidence}
- For dates, include the actual date value if parseable
- For action_item: extract assignee, deadline, and priority if mentioned
- Classify spam with score 0-1 (0=definitely not spam, 1=definitely spam)

**CRITICAL**: DO NOT extract person entities from email body text.
Person entities should ONLY come from email headers (To, CC, From fields).
Continue extracting company, project, topic, action_item from body text.

**Response Format (JSON only):**
{
  "spam": {
    "isSpam": false,
    "spamScore": 0.1,
    "spamReason": "Personal email with actionable content"
  },
  "entities": [
    {
      "type": "person",
      "value": "John Doe",
      "normalized": "john_doe",
      "confidence": 0.95,
      "source": "metadata",
      "context": "From: John Doe <john@example.com>"
    },
    {
      "type": "action_item",
      "value": "Review the proposal by Friday",
      "normalized": "review_proposal",
      "confidence": 0.9,
      "source": "body",
      "context": "Can you review the proposal by Friday?",
      "assignee": "you",
      "deadline": "2025-01-10",
      "priority": "high"
    },
    {
      "type": "date",
      "value": "January 10, 2025",
      "normalized": "2025-01-10",
      "confidence": 0.95,
      "source": "body",
      "context": "by Friday (January 10, 2025)"
    }
  ]
}

Respond with JSON only. No additional text or explanation.`;
}

/**
 * Build batch extraction prompt (optimized for multiple emails)
 */
export function buildBatchExtractionPrompt(emails: Email[], config: ExtractionConfig): string {
  const emailSummaries = emails
    .map((email, index) => {
      const parts: string[] = [`Email ${index + 1} (ID: ${email.id})`];

      if (config.extractFromMetadata) {
        parts.push(`From: ${email.from.name || email.from.email}`);
        parts.push(`To: ${email.to.map((t) => t.name || t.email).join(', ')}`);
      }

      if (config.extractFromSubject) {
        parts.push(`Subject: ${email.subject}`);
      }

      if (config.extractFromBody) {
        // Truncate long bodies for batch processing
        const bodyPreview = email.body.length > 500 ? email.body.slice(0, 500) + '...' : email.body;
        parts.push(`Body: ${bodyPreview}`);
      }

      return parts.join('\n');
    })
    .join('\n\n---\n\n');

  return `Extract structured entities from these ${emails.length} emails.

${emailSummaries}

**Entity Types to Extract:**
1. person - People's names
2. company - Organizations
3. project - Project names
4. date - Dates and deadlines
5. topic - Subject areas
6. location - Geographic locations

**Instructions:**
- Extract all entities with confidence scores (0.0 to 1.0)
- Normalize names consistently across emails
- Minimum confidence: ${config.minConfidence}
- Group entities by email ID

**Response Format (JSON only):**
{
  "results": [
    {
      "emailId": "email-id-1",
      "entities": [
        {
          "type": "person",
          "value": "John Doe",
          "normalized": "john_doe",
          "confidence": 0.95,
          "source": "metadata"
        }
      ]
    }
  ]
}

Respond with JSON only.`;
}

/**
 * Build extraction prompt for calendar events
 */
export function buildCalendarExtractionPrompt(
  event: CalendarEvent,
  config: ExtractionConfig
): string {
  const sources: string[] = [];

  sources.push(`**Summary:** ${event.summary}`);

  if (event.description) {
    sources.push(`**Description:**\n${event.description}`);
  }

  if (event.location) {
    sources.push(`**Location:** ${event.location}`);
  }

  sources.push(`**Start:** ${event.start.dateTime}`);
  sources.push(`**End:** ${event.end.dateTime}`);

  if (event.attendees && event.attendees.length > 0) {
    sources.push(
      `**Attendees:** ${event.attendees.map((a) => `${a.displayName} (${a.email})`).join(', ')}`
    );
  }

  if (event.organizer) {
    sources.push(`**Organizer:** ${event.organizer.displayName} (${event.organizer.email})`);
  }

  return `Extract structured entities from this calendar event.

${sources.join('\n')}

**Entity Types to Extract:**
1. **person** - People's names (from attendees, organizer, and description)
2. **company** - Organizations and companies mentioned
3. **project** - Project names and references
4. **date** - Important dates and deadlines mentioned in description
5. **topic** - Subject areas and themes (meeting topics, discussion areas)
6. **location** - Geographic locations (cities, countries, addresses, meeting rooms)
7. **action_item** - Tasks, todos, and action items mentioned in description

**Instructions:**
- Extract all entities with confidence scores (0.0 to 1.0)
- Normalize names (e.g., "Bob" might be "Robert")
- Include source (metadata, description)
- Link email addresses to person entities when possible
- Minimum confidence threshold: ${config.minConfidence}
- For dates, include the actual date value if parseable
- For action_item: extract assignee, deadline, and priority if mentioned
- The event itself is NOT spam, so always set isSpam: false

**Response Format (JSON only):**
{
  "spam": {
    "isSpam": false,
    "spamScore": 0,
    "spamReason": "Calendar event"
  },
  "entities": [
    {
      "type": "person",
      "value": "John Doe",
      "normalized": "john_doe",
      "confidence": 0.95,
      "source": "metadata",
      "context": "Attendee: John Doe <john@example.com>"
    },
    {
      "type": "location",
      "value": "Conference Room A",
      "normalized": "conference_room_a",
      "confidence": 0.9,
      "source": "metadata",
      "context": "Location: Conference Room A"
    },
    {
      "type": "topic",
      "value": "Q1 Planning",
      "normalized": "q1_planning",
      "confidence": 0.9,
      "source": "metadata",
      "context": "Summary: Q1 Planning Meeting"
    },
    {
      "type": "action_item",
      "value": "Prepare budget forecast",
      "normalized": "prepare_budget_forecast",
      "confidence": 0.85,
      "source": "description",
      "context": "Please prepare budget forecast before the meeting",
      "assignee": "team",
      "priority": "medium"
    }
  ]
}

Respond with JSON only. No additional text or explanation.`;
}
