# Gmail API Integration

## Overview

The Gmail API integration enables Izzie2 to fetch and process emails from both inbox and sent folders. Sent emails are particularly high-signal for significance scoring.

## Setup

### 1. Google Service Account Configuration

The service account is already configured:
- Email: `izzie-assistant@izzie-456719.iam.gserviceaccount.com`
- Credentials: `.credentials/google-service-account.json`

### 2. Environment Variables

Already configured in `.env.local`:
```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=izzie-assistant@izzie-456719.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=.credentials/google-service-account.json
GOOGLE_SERVICE_ACCOUNT_ID=102513362928084266785
```

### 3. Domain-Wide Delegation (for Google Workspace)

**IMPORTANT:** For the service account to access Gmail, you must configure domain-wide delegation in Google Workspace Admin:

1. Go to Google Workspace Admin Console
2. Navigate to Security > API Controls > Domain-wide Delegation
3. Add the service account client ID: `102513362928084266785`
4. Add OAuth scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/drive.readonly`
5. Save and wait 15-30 minutes for propagation

### 4. Personal Gmail (Alternative)

For personal Gmail accounts, you'll need OAuth 2.0 with user consent:

1. Create OAuth credentials in Google Cloud Console
2. Add environment variables:
   ```bash
   GOOGLE_OAUTH_CLIENT_ID=your_client_id
   GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
   ```
3. Use `getOAuth2Client()` instead of `getServiceAccountAuth()`

## Usage

### Test Connection

```bash
curl http://localhost:3000/api/gmail/test
```

Expected response:
```json
{
  "success": true,
  "connection": {
    "authenticated": true,
    "emailAddress": "user@domain.com",
    "messagesTotal": 1234,
    "threadsTotal": 567
  },
  "stats": {
    "totalEmails": 5,
    "sentEmails": 2,
    "inboxEmails": 3,
    "withAttachments": 1
  },
  "emails": [...]
}
```

### Start Email Sync

```bash
# Sync all emails
curl -X POST http://localhost:3000/api/gmail/sync \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "all",
    "maxResults": 100
  }'

# Sync only inbox
curl -X POST http://localhost:3000/api/gmail/sync \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "inbox",
    "maxResults": 50
  }'

# Sync emails since specific date
curl -X POST http://localhost:3000/api/gmail/sync \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "all",
    "maxResults": 100,
    "since": "2025-01-01T00:00:00Z"
  }'
```

### Check Sync Status

```bash
curl http://localhost:3000/api/gmail/sync
```

## API Endpoints

### GET /api/gmail/test

Tests Gmail connection and returns sample emails.

**Query Parameters:**
- `userEmail` (optional): Email address to impersonate (requires domain-wide delegation)
- `maxResults` (optional): Number of emails to fetch (default: 5)
- `folder` (optional): Folder to fetch from - `inbox`, `sent`, or `all` (default: `inbox`)

### POST /api/gmail/sync

Starts email synchronization.

**Request Body:**
```typescript
{
  folder: 'inbox' | 'sent' | 'all';  // default: 'all'
  maxResults?: number;                // default: 100, max: 500
  since?: string;                     // ISO date string
  userEmail?: string;                 // For domain-wide delegation
}
```

### GET /api/gmail/sync

Gets current sync status.

**Response:**
```typescript
{
  status: {
    isRunning: boolean;
    lastSync?: Date;
    emailsProcessed: number;
    error?: string;
  }
}
```

## Programmatic Usage

### Fetch Emails

```typescript
import { getServiceAccountAuth, GmailService } from '@/lib/google';

// Initialize
const auth = await getServiceAccountAuth('user@domain.com');
const gmail = new GmailService(auth);

// Fetch emails
const batch = await gmail.fetchEmails({
  folder: 'all',
  maxResults: 100,
  since: new Date('2025-01-01'),
});

// Process emails
for (const email of batch.emails) {
  console.log(`From: ${email.from.email}`);
  console.log(`Subject: ${email.subject}`);
  console.log(`Is Sent: ${email.isSent}`); // High-signal!
}
```

### Get Single Email

```typescript
const email = await gmail.getEmail('email-id');
console.log(email.body);
console.log(email.htmlBody);
```

### Get Thread

```typescript
const thread = await gmail.getThread('thread-id');
console.log(`Thread has ${thread.emails.length} messages`);
```

### Batch Fetch

```typescript
const emails = await gmail.batchFetch(['id1', 'id2', 'id3']);
```

## Rate Limits

Gmail API quotas:
- **250 quota units per user per second**
- **1 billion quota units per day** (generous for typical usage)

The implementation includes:
- 100ms delay between requests
- Automatic retry with exponential backoff
- Proper error handling and logging

## Email Structure

```typescript
interface Email {
  id: string;
  threadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  body: string;          // Plain text
  htmlBody?: string;     // HTML version
  date: Date;
  labels: string[];
  isSent: boolean;       // ⭐ High-signal for significance
  hasAttachments: boolean;
  snippet?: string;      // Preview text
}
```

## Common Issues

### Authentication Failed

**Symptom:** `Authentication failed` error

**Solutions:**
1. Verify service account key file exists: `.credentials/google-service-account.json`
2. Check environment variables are set correctly
3. For Google Workspace: Ensure domain-wide delegation is configured
4. For personal Gmail: Use OAuth 2.0 instead

### Domain-Wide Delegation Not Configured

**Symptom:** `domain-wide delegation` error

**Solution:** Configure in Google Workspace Admin (see Setup section above)

### File Not Found

**Symptom:** `Service account key file not found`

**Solution:** Ensure `.credentials/google-service-account.json` exists and path is correct

### Rate Limit Exceeded

**Symptom:** `Rate limit exceeded` or `429` errors

**Solution:** The implementation includes automatic delays. If you still hit limits:
- Reduce `maxResults`
- Add longer delays between batches
- Implement exponential backoff

## Next Steps

### TODO: Email Processing Pipeline

1. **Store emails in database**
   - Create email schema in Neon Postgres
   - Store sent emails with priority flag
   - Index by date, sender, labels

2. **Trigger significance scoring**
   - Process sent emails for high-signal scoring
   - Analyze email threads for context
   - Extract key information (people, topics, projects)

3. **Event classification**
   - Classify emails into categories
   - Extract actionable items
   - Identify follow-ups needed

4. **Integration with other sources**
   - Combine with calendar events
   - Link to Linear/GitHub tickets
   - Correlate with Slack messages

## Files Created

- `/src/lib/google/types.ts` - Type definitions
- `/src/lib/google/auth.ts` - Authentication
- `/src/lib/google/gmail.ts` - Gmail service
- `/src/lib/google/index.ts` - Exports
- `/src/app/api/gmail/sync/route.ts` - Sync endpoint
- `/src/app/api/gmail/test/route.ts` - Test endpoint
- `/docs/gmail-integration.md` - This documentation
