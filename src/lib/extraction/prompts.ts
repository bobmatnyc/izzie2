/**
 * Entity Extraction Prompts
 *
 * Prompts for Mistral to extract structured entities from emails and calendar events.
 * Uses JSON output format for reliable parsing.
 */

import type { Email, CalendarEvent } from '../google/types';
import type { ExtractionConfig } from './types';
import type { UserIdentity } from './user-identity';

/**
 * Build extraction prompt for Mistral with user identity context
 */
export function buildExtractionPrompt(
  email: Email,
  config: ExtractionConfig,
  userIdentity?: UserIdentity
): string {
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

  // User identity context (if available)
  const userContext = userIdentity
    ? `
**USER IDENTITY CONTEXT:**
- Current user name: ${userIdentity.primaryName}
- Current user email: ${userIdentity.primaryEmail}
- User aliases: ${userIdentity.aliases.slice(0, 5).join(', ')}${userIdentity.aliases.length > 5 ? '...' : ''}

**IMPORTANT:**
- If you see "${userIdentity.primaryName}" in From/To/CC, this is the CURRENT USER (mark with high confidence)
- DO NOT extract the current user's name from emails they sent (From field when isSent=true)
- DO extract recipients of sent emails (To/CC) - these are people the user communicates with
`
    : '';

  // Context-aware person extraction: restrict to metadata only
  const personExtractionRule = email.isSent
    ? '1. **person** - People\'s names (ONLY from To/CC recipient lists - people you sent this email to)'
    : '1. **person** - People\'s names (ONLY from From/To/CC metadata - NOT from email body text)';

  return `Extract structured entities and classify spam from this email.
${userContext}
${sources.join('\n')}

**Entity Types to Extract:**
${personExtractionRule}
2. **company** - Organizations and companies (from metadata, subject, and body)
3. **project** - SPECIFIC project names with proper nouns (e.g., "claude-mpm", "Issue #24", "Q4 Migration")
   - Must be a NAMED project or initiative, not a generic task/feature
   - Examples: GitHub repo names, issue numbers, codenames, initiative names
   - DO NOT extract: generic tasks ("database optimization"), features ("email parsing"), technical terms ("sandbox cluster")
4. **date** - Important dates and deadlines (from metadata, subject, and body)
5. **topic** - Subject areas and themes (from metadata, subject, and body)
6. **location** - Geographic locations (from metadata, subject, and body)
7. **action_item** - ACTIONABLE tasks with clear context (from subject and body)
   - Must include what needs to be done AND at least one of: who/when/priority
   - Extract ONLY if you can identify specific action + (assignee OR deadline OR priority)
   - DO NOT extract vague items like "check status", "follow up", "review changes" without context

**Spam Classification:**
Classify if this email is spam/promotional/low-value based on:
- Marketing/promotional content
- Mass-distributed newsletters
- Automated notifications with no actionable content
- Phishing attempts or suspicious patterns
- Low relevance to recipient

**Relationship Extraction:**
Also identify meaningful relationships between the entities you extract:
RELATIONSHIP TYPES (use exactly these):
- WORKS_WITH: Two people who work together/collaborate
- REPORTS_TO: Person reports to another person (hierarchy)
- WORKS_FOR: Person works for a company
- LEADS: Person leads/manages a project
- WORKS_ON: Person works on a project
- EXPERT_IN: Person has expertise in a topic
- LOCATED_IN: Person or company is located in a place
- PARTNERS_WITH: Two companies partner together
- COMPETES_WITH: Two companies compete
- OWNS: Company owns/runs a project
- RELATED_TO: Projects or topics are related
- DEPENDS_ON: Project depends on another project
- PART_OF: Project is part of a larger project
- SUBTOPIC_OF: Topic is a subtopic of another
- ASSOCIATED_WITH: Topics are associated

RELATIONSHIP RULES:
1. Only infer relationships with clear evidence in the content
2. Confidence should reflect how explicitly stated (0.5-1.0)
3. Include a brief quote as evidence supporting each relationship
4. Focus on meaningful relationships, not every possible connection
5. Maximum 5 relationships per email

**Instructions:**
- Extract all entities with confidence scores (0.0 to 1.0)
- Normalize names (e.g., "Bob" might be "Robert")
- Include source (metadata, subject, or body)
- Link email addresses to person entities when possible
- Minimum confidence threshold: ${config.minConfidence}
- For dates, include the actual date value if parseable
- For action_item: extract assignee, deadline, and priority if mentioned
- Classify spam with score 0-1 (0=definitely not spam, 1=definitely spam)

**PERSON EXTRACTION (STRICT RULES):**
1. ONLY extract from To/CC/From headers - NEVER from email body
2. ONLY extract HUMAN NAMES in "Firstname Lastname" format (e.g., "John Doe", "Sarah Smith")
3. DO NOT extract the current user's own name from emails they sent (check isSent flag and user context)
4. DO NOT extract:
   - Email addresses (e.g., "bob@company.com")
   - Company/brand names (e.g., "Reddit Notifications", "Apple Support", "Hastings-on-Hudson Safety Posts")
   - Group names (e.g., "Safety Posts", "Team Updates", "Trending Posts")
   - Names with indicators: "from X", "X Team", "X Support", "X Notifications", "X Posts"
5. If From field contains BOTH a person AND company (e.g., "John Doe from Acme Corp"):
   - Extract person: "John Doe" (unless it's the current user)
   - Extract company: "Acme Corp"
6. When in doubt between person/company, choose COMPANY

**COMPANY EXTRACTION (STRICT RULES):**
1. Extract from metadata, subject, and body
2. Company indicators (extract as COMPANY, not person):
   - Pattern: "[Company] Notifications", "[Company] Support", "[Company] Team", "[Company] Posts"
   - Pattern: "Support from [Company]", "Team at [Company]"
   - Well-known companies: Reddit, Apple, Google, Microsoft, Meta, GitHub, LinkedIn, Facebook
   - From field with brand/service name (e.g., "notifications@reddit.com" → company: Reddit)
   - Group/page names: "[Name] Safety Posts", "[Name] Trending Posts" → company
3. When in doubt between person/company, choose COMPANY

**Examples:**
- "Support from Flume" → company: Flume
- "Reddit Notifications" → company: Reddit
- "Apple Support" → company: Apple
- "john@company.com" → NO person entity (email is not a name)
- "John Doe <john@company.com>" → person: John Doe

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
      "type": "company",
      "value": "Acme Corp",
      "normalized": "acme_corp",
      "confidence": 0.9,
      "source": "body",
      "context": "John from Acme Corp"
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
  ],
  "relationships": [
    {
      "fromType": "person",
      "fromValue": "John Doe",
      "toType": "company",
      "toValue": "Acme Corp",
      "relationshipType": "WORKS_FOR",
      "confidence": 0.85,
      "evidence": "John from Acme Corp mentioned..."
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

**Relationship Extraction:**
Also identify meaningful relationships between the entities you extract:
RELATIONSHIP TYPES (use exactly these):
- WORKS_WITH: Two people who work together/collaborate
- REPORTS_TO: Person reports to another person (hierarchy)
- WORKS_FOR: Person works for a company
- LEADS: Person leads/manages a project
- WORKS_ON: Person works on a project
- EXPERT_IN: Person has expertise in a topic
- LOCATED_IN: Person or company is located in a place
- PARTNERS_WITH: Two companies partner together
- OWNS: Company owns/runs a project
- RELATED_TO: Projects or topics are related
- PART_OF: Project is part of a larger project

RELATIONSHIP RULES:
1. Only infer relationships with clear evidence in the content
2. Confidence should reflect how explicitly stated (0.5-1.0)
3. Include a brief quote as evidence supporting each relationship
4. Focus on meaningful relationships, not every possible connection
5. Maximum 5 relationships per event

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
      "type": "company",
      "value": "Acme Corp",
      "normalized": "acme_corp",
      "confidence": 0.9,
      "source": "metadata",
      "context": "Meeting with Acme Corp team"
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
  ],
  "relationships": [
    {
      "fromType": "person",
      "fromValue": "John Doe",
      "toType": "company",
      "toValue": "Acme Corp",
      "relationshipType": "WORKS_FOR",
      "confidence": 0.8,
      "evidence": "John Doe attending meeting with Acme Corp team"
    }
  ]
}

Respond with JSON only. No additional text or explanation.`;
}
