/**
 * Entity Extraction Prompts
 *
 * Prompts for Mistral to extract structured entities from emails.
 * Uses JSON output format for reliable parsing.
 */

import type { Email } from '../google/types';
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

  return `Extract structured entities from this email.

${sources.join('\n')}

**Entity Types to Extract:**
1. **person** - People's names (from To/From/CC and body text)
2. **company** - Organizations and companies
3. **project** - Project names and references
4. **date** - Important dates and deadlines
5. **topic** - Subject areas and themes
6. **location** - Geographic locations (cities, countries, addresses)

**Instructions:**
- Extract all entities with confidence scores (0.0 to 1.0)
- Normalize names (e.g., "Bob" might be "Robert")
- Include source (metadata, subject, or body)
- Link email addresses to person entities when possible
- Minimum confidence threshold: ${config.minConfidence}
- For dates, include the actual date value if parseable

**Response Format (JSON only):**
{
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
      "context": "meeting with Acme Corp team"
    },
    {
      "type": "date",
      "value": "January 10, 2025",
      "normalized": "2025-01-10",
      "confidence": 0.95,
      "source": "body",
      "context": "let's meet on January 10, 2025"
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
