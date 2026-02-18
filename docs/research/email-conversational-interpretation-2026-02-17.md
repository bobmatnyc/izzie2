# Email Conversational Interpretation Research

**Date:** 2026-02-17
**Status:** Complete
**Type:** Informational (Architecture Analysis)

## Summary

Investigation into why Izzie transcribes emails literally instead of interpreting them conversationally. Root cause identified: the `formatEmailBody()` function in the alert classifier performs literal transcription without any LLM interpretation step.

## Problem Statement

**Current Behavior (Literal Transcription):**
```
Email from Google Workspace
Subject: "Audit log export and data access control changes"
Google Workspace is making a change that affects your organization&#39;s audit log export and data access controls...
```

**Desired Behavior (Conversational Interpretation):**
```
Google Workspace is updating their audit logs on Aug 18, 2026 - you need to review your usage before then.
```

## Current Email Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EMAIL NOTIFICATION FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

1. FETCH                    2. CLASSIFY                 3. FORMAT & SEND
┌──────────────────┐       ┌──────────────────┐        ┌──────────────────┐
│ poll-email/      │       │ classifier.ts    │        │ templates.ts     │
│ route.ts         │──────▶│                  │───────▶│                  │
│                  │       │ classifyEmail()  │        │ formatAlert()    │
│ GmailService.    │       │ formatEmailBody()│        │ formatP1Alert()  │
│ fetchEmails()    │       │ formatEmailTitle()        │                  │
└──────────────────┘       └──────────────────┘        └──────────────────┘
                                    │                          │
                                    │                          │
                                    ▼                          ▼
                           ┌──────────────────┐        ┌──────────────────┐
                           │ NO LLM STEP      │        │ Telegram Bot     │
                           │ (Root Cause)     │        │ Delivery         │
                           └──────────────────┘        └──────────────────┘
```

## Root Cause Analysis

### Location: `src/lib/alerts/classifier.ts`

**Lines 364-368 - `formatEmailBody()` function:**
```typescript
function formatEmailBody(email: Email): string {
  const subject = email.subject || '(no subject)';
  const preview = email.snippet || email.body.slice(0, 100);
  return `Subject: "${subject}"\n${preview}${preview.length >= 100 ? '...' : ''}`;
}
```

**Lines 357-362 - `formatEmailTitle()` function:**
```typescript
function formatEmailTitle(email: Email, level: AlertLevel): string {
  const prefix = level === AlertLevel.P0_URGENT ? '🔴 URGENT: ' : '';
  const sender = email.from.name || email.from.email.split('@')[0];
  return `${prefix}Email from ${sender}`;
}
```

**Issue:** These functions perform literal string concatenation without any AI/LLM interpretation. The raw subject line and snippet are passed directly to the notification templates.

### Called From: `classifyEmail()` (Lines 195-253)

```typescript
export async function classifyEmail(
  email: Email,
  config: UserAlertConfig
): Promise<ClassifiedAlert> {
  // ... classification logic ...

  return {
    id: email.id,
    source: 'email',
    level,
    title: formatEmailTitle(email, level),  // <-- Literal transcription
    body: formatEmailBody(email),            // <-- Literal transcription
    signals,
    metadata: { ... },
    timestamp: new Date(email.date),
  };
}
```

## Available AI Infrastructure

The codebase already has LLM infrastructure that can be leveraged:

### 1. AI Client (`src/lib/ai/client.ts`)

```typescript
import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';

const aiClient = getAIClient();
const response = await aiClient.chat(
  [{ role: 'user', content: prompt }],
  {
    model: MODELS.GENERAL,
    temperature: 0.3,
    maxTokens: 150,
  }
);
```

### 2. Example Usage (`src/lib/chat/session/compression.ts`)

The compression module demonstrates LLM summarization:

```typescript
const prompt = `Summarize the following conversation...`;
const response = await aiClient.chat(
  [{ role: 'user', content: prompt }],
  {
    model: MODELS.GENERAL,
    temperature: 0.3,
    maxTokens: 500,
    logCost: true,
  }
);
```

## Recommended Solution

### Option A: Modify `formatEmailBody()` (Minimal Change)

Add async LLM summarization to the existing function:

```typescript
// src/lib/alerts/classifier.ts

import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';

async function formatEmailBody(email: Email): Promise<string> {
  const aiClient = getAIClient();

  const prompt = `Summarize this email in one conversational sentence. Focus on what matters to the recipient and any action needed.

From: ${email.from.name || email.from.email}
Subject: ${email.subject}
Content: ${email.snippet || email.body.slice(0, 500)}

Respond with ONLY the conversational summary, no quotes or prefixes.`;

  try {
    const response = await aiClient.chat(
      [{ role: 'user', content: prompt }],
      {
        model: MODELS.CLASSIFIER, // Use cheap model for simple summarization
        temperature: 0.3,
        maxTokens: 100,
      }
    );
    return response.content.trim();
  } catch (error) {
    // Fallback to literal transcription if LLM fails
    console.error('[formatEmailBody] LLM summarization failed:', error);
    const subject = email.subject || '(no subject)';
    const preview = email.snippet || email.body.slice(0, 100);
    return `Subject: "${subject}"\n${preview}`;
  }
}
```

### Option B: Add Interpretation Layer (More Flexible)

Create a new module for email interpretation:

```typescript
// src/lib/alerts/email-interpreter.ts

import { getAIClient } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';
import type { Email } from './types';

export interface InterpretedEmail {
  summary: string;
  actionRequired: boolean;
  deadline?: string;
  priority: 'high' | 'medium' | 'low';
}

export async function interpretEmail(email: Email): Promise<InterpretedEmail> {
  const aiClient = getAIClient();

  const prompt = `Analyze this email and provide a JSON response:

From: ${email.from.name || email.from.email}
Subject: ${email.subject}
Content: ${email.snippet || email.body.slice(0, 500)}

Respond with JSON only:
{
  "summary": "one sentence conversational summary",
  "actionRequired": true/false,
  "deadline": "date if mentioned, null otherwise",
  "priority": "high/medium/low"
}`;

  const response = await aiClient.chat(
    [{ role: 'user', content: prompt }],
    {
      model: MODELS.CLASSIFIER,
      temperature: 0.2,
      maxTokens: 200,
    }
  );

  return JSON.parse(response.content);
}
```

## Implementation Steps

1. **Update `formatEmailBody()` signature** to be async
2. **Update `classifyEmail()`** to await the new async function
3. **Update callers** of `classifyEmail()` (already async, minimal changes)
4. **Add error handling** with fallback to literal transcription
5. **Test with various email types** (newsletters, alerts, personal, promotional)

## Files Requiring Changes

| File | Change Required |
|------|-----------------|
| `src/lib/alerts/classifier.ts` | Add LLM call to `formatEmailBody()` |
| `src/lib/alerts/types.ts` | No changes needed |
| `src/lib/alerts/templates.ts` | No changes needed |
| `src/app/api/cron/poll-email/route.ts` | No changes needed (already async) |

## Cost Considerations

Using `MODELS.CLASSIFIER` (cheapest tier):
- Estimated tokens per email: ~200 input + ~50 output = 250 tokens
- Cost per email: ~$0.00005 (approximate)
- 100 emails/day = ~$0.005/day

## Testing Approach

1. Unit test `formatEmailBody()` with mock AI client
2. Integration test email classification flow
3. Manual testing with real emails:
   - Google Workspace admin notifications
   - Calendar invites
   - Personal emails
   - Newsletter/promotional emails

## Related Files Examined

- `src/lib/alerts/classifier.ts` - Alert classification (ROOT CAUSE)
- `src/lib/alerts/templates.ts` - Telegram formatting
- `src/lib/alerts/index.ts` - Module exports
- `src/app/api/cron/poll-email/route.ts` - Email polling cron
- `src/lib/ai/client.ts` - AI infrastructure
- `src/lib/chat/session/compression.ts` - LLM summarization example
- `src/lib/chat/tools/email.ts` - Email management tools
- `src/lib/chat/email-retrieval.ts` - Email retrieval for chat
- `src/agents/notifier/index.ts` - Notification delivery
- `src/lib/events/functions/process-event.ts` - Event processing

---

*Research conducted by Claude Code Research Agent*
