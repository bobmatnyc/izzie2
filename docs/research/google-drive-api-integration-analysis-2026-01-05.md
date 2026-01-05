# Google Drive API Integration Analysis

**Research Date:** January 5, 2026
**Purpose:** Inform Drive API implementation based on existing Gmail integration patterns
**Status:** Research Complete

---

## Executive Summary

This research analyzes the existing Google API integration patterns in the Izzie2 codebase to inform Google Drive API implementation. The codebase already has a well-structured Gmail integration using service account authentication with domain-wide delegation. Drive API scopes are already configured but not yet implemented.

**Key Findings:**
- ✅ Service account authentication pattern established
- ✅ Drive API scopes already configured (`drive.readonly`)
- ✅ Domain-wide delegation configured for Gmail and Drive
- ✅ Clear service class pattern with singleton instances
- ✅ Rate limiting and error handling patterns established
- ⚠️ No existing Drive implementation to extend

**Recommendation:** Implement Drive service following the Gmail service pattern with minimal modifications.

---

## 1. Authentication Architecture

### 1.1 Service Account Pattern

**Location:** `/src/lib/google/auth.ts`

The project uses **service account authentication** with optional **domain-wide delegation** for impersonating users in Google Workspace.

```typescript
// Core authentication function
export async function getServiceAccountAuth(
  userEmail?: string
): Promise<Auth.GoogleAuth> {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: SCOPES,
    // Domain-wide delegation: impersonate user if provided
    ...(userEmail && { clientOptions: { subject: userEmail } }),
  });

  return auth;
}
```

**Key Pattern:** The `subject` field in `clientOptions` enables user impersonation, requiring domain-wide delegation to be configured in Google Workspace Admin Console.

### 1.2 Configured Scopes

**Location:** `/src/lib/google/auth.ts:10-13`

```typescript
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',  // ✅ Already configured!
];
```

**Finding:** Drive API scope is already present in the authentication configuration, indicating Drive integration was anticipated in the architecture.

### 1.3 Service Account Credentials

**Location:** `.credentials/google-service-account.json`

```json
{
  "type": "service_account",
  "project_id": "izzie-456719",
  "client_email": "izzie-assistant@izzie-456719.iam.gserviceaccount.com",
  "client_id": "102513362928084266785"
}
```

**Domain-Wide Delegation Setup:**
1. Configured in Google Workspace Admin Console
2. Service account client ID: `102513362928084266785`
3. Authorized scopes: Gmail and Drive (readonly)
4. Propagation time: 15-30 minutes after configuration

### 1.4 Environment Configuration

**Required Environment Variables:**
```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=izzie-assistant@izzie-456719.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=.credentials/google-service-account.json
GOOGLE_SERVICE_ACCOUNT_ID=102513362928084266785
```

---

## 2. Gmail Service Implementation Pattern

### 2.1 Service Class Structure

**Location:** `/src/lib/google/gmail.ts`

**Pattern Analysis:**

```typescript
export class GmailService {
  private gmail: gmail_v1.Gmail;
  private auth: Auth.GoogleAuth | Auth.OAuth2Client;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.auth = auth;
    this.gmail = google.gmail({ version: 'v1', auth: auth as Auth.OAuth2Client });
  }

  // Public methods...
}

// Singleton pattern
let gmailServiceInstance: GmailService | null = null;

export async function getGmailService(
  auth?: Auth.GoogleAuth | Auth.OAuth2Client
): Promise<GmailService> {
  if (!gmailServiceInstance || auth) {
    if (!auth) {
      throw new Error('Auth required to initialize Gmail service');
    }
    gmailServiceInstance = new GmailService(auth);
  }
  return gmailServiceInstance;
}
```

**Key Patterns:**
1. **Class-based service** with private API client
2. **Constructor injection** of auth client
3. **Singleton pattern** for service instance management
4. **Factory function** for initialization (`getGmailService`)
5. **Type safety** using googleapis type definitions

### 2.2 Rate Limiting Strategy

**Pattern:**
```typescript
const RATE_LIMIT_DELAY_MS = 100; // Delay between requests

// In fetchEmails method
for (const message of messages) {
  const email = await this.getEmail(message.id);
  emails.push(email);
  await this.sleep(RATE_LIMIT_DELAY_MS); // Rate limiting
}

private sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

**Gmail API Quotas:**
- 250 quota units per user per second
- 1 billion quota units per day

**Strategy:** 100ms delay between sequential API calls prevents rate limit errors.

### 2.3 Error Handling Pattern

```typescript
try {
  const response = await this.gmail.users.messages.list({...});
  // Process response
} catch (error) {
  console.error('[Gmail] Failed to fetch emails:', error);
  throw new Error(`Failed to fetch emails: ${error}`);
}
```

**Pattern:** Structured error logging with service prefix (`[Gmail]`) and error wrapping for context preservation.

### 2.4 Data Parsing and Type Safety

**Location:** `/src/lib/google/types.ts`

```typescript
export interface Email {
  id: string;
  threadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  body: string;
  htmlBody?: string;
  date: Date;
  labels: string[];
  isSent: boolean;
  hasAttachments: boolean;
  // ...
}
```

**Pattern:** Strong type definitions for all API responses with transformation logic in service methods.

---

## 3. Project Structure

### 3.1 File Organization

```
src/lib/google/
├── auth.ts          # Authentication utilities
├── gmail.ts         # Gmail service implementation
├── types.ts         # TypeScript type definitions
└── index.ts         # Public exports
```

**Export Pattern (`index.ts`):**
```typescript
export * from './types.js';
export * from './auth.js';
export * from './gmail.js';
```

**Finding:** Clean barrel export pattern for public API surface.

### 3.2 API Route Structure

```
src/app/api/gmail/
├── test/route.ts    # GET - Test connection and fetch sample data
└── sync/route.ts    # POST/GET - Trigger sync and check status
```

**Pattern:** Separate test and production endpoints with clear HTTP verb semantics.

---

## 4. Dependencies

### 4.1 Package Versions

**Location:** `package.json`

```json
{
  "dependencies": {
    "googleapis": "^169.0.0",  // Latest stable version
    "@types/node": "^25.0.3",
    "typescript": "^5.9.3"
  }
}
```

**Finding:** Recent googleapis package version with full TypeScript support.

### 4.2 Import Pattern

```typescript
import { google, gmail_v1, Auth } from 'googleapis';
```

**Pattern:** Destructured imports for specific API versions and types.

---

## 5. Domain-Wide Delegation Configuration

### 5.1 Configuration Steps

**Documentation Location:** `docs/gmail-integration.md:24-34`

1. **Google Workspace Admin Console**
2. Navigate to: Security > API Controls > Domain-wide Delegation
3. Add service account client ID: `102513362928084266785`
4. Authorize OAuth scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/drive.readonly`
5. Wait 15-30 minutes for propagation

### 5.2 User Impersonation

**Pattern:**
```typescript
// Authenticate as specific user
const auth = await getServiceAccountAuth('user@domain.com');
const gmail = await getGmailService(auth);

// API calls now made on behalf of user@domain.com
const emails = await gmail.fetchEmails({ folder: 'inbox' });
```

**Use Case:** Required for accessing personal Gmail/Drive data in Google Workspace environments.

---

## 6. Existing Inngest Integration

### 6.1 Event Bus Pattern

**Location:** `src/lib/events/index.ts`

```typescript
export const inngest = new Inngest({
  id: 'izzie2',
  name: 'Izzie2 AI Assistant',
  eventKey: process.env.INNGEST_EVENT_KEY,
});
```

**Finding:** Inngest already configured for event-driven architecture.

### 6.2 Webhook Integration Pattern

**Example:** `src/app/api/webhooks/google/route.ts`

```typescript
import { inngest } from '@/lib/events';

await inngest.send({
  name: 'google/event.received',
  data: { /* event payload */ }
});
```

**Pattern:** Webhooks trigger Inngest events for asynchronous processing.

---

## 7. Recommended Drive API Implementation

### 7.1 File Structure

```
src/lib/google/
├── auth.ts          # ✅ Already exists
├── gmail.ts         # ✅ Already exists
├── drive.ts         # 🆕 NEW - Drive service (mirror Gmail pattern)
├── types.ts         # ✅ Extend with Drive types
└── index.ts         # ✅ Add Drive exports
```

### 7.2 Drive Service Class (Proposed)

```typescript
// src/lib/google/drive.ts
import { google, drive_v3, Auth } from 'googleapis';
import type { DriveFile, DriveListOptions, DriveFileContent } from './types';

const RATE_LIMIT_DELAY_MS = 100;

export class DriveService {
  private drive: drive_v3.Drive;
  private auth: Auth.GoogleAuth | Auth.OAuth2Client;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.auth = auth;
    this.drive = google.drive({ version: 'v3', auth: auth as Auth.OAuth2Client });
  }

  async listFiles(options: DriveListOptions): Promise<DriveFile[]> {
    // Implementation
  }

  async getFile(fileId: string): Promise<DriveFile> {
    // Implementation
  }

  async downloadFile(fileId: string): Promise<DriveFileContent> {
    // Implementation
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton pattern
let driveServiceInstance: DriveService | null = null;

export async function getDriveService(
  auth?: Auth.GoogleAuth | Auth.OAuth2Client
): Promise<DriveService> {
  if (!driveServiceInstance || auth) {
    if (!auth) {
      throw new Error('Auth required to initialize Drive service');
    }
    driveServiceInstance = new DriveService(auth);
  }
  return driveServiceInstance;
}
```

### 7.3 Type Definitions (Proposed)

```typescript
// Extend src/lib/google/types.ts

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  createdTime: Date;
  modifiedTime: Date;
  owners: DriveUser[];
  permissions: DrivePermission[];
  parents?: string[];
  webViewLink?: string;
  thumbnailLink?: string;
}

export interface DriveUser {
  displayName: string;
  emailAddress: string;
  photoLink?: string;
}

export interface DrivePermission {
  id: string;
  type: 'user' | 'group' | 'domain' | 'anyone';
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
}

export interface DriveListOptions {
  query?: string;           // Drive query syntax
  maxResults?: number;
  pageToken?: string;
  orderBy?: string;
  spaces?: 'drive' | 'appDataFolder' | 'photos';
}

export interface DriveFileContent {
  file: DriveFile;
  content: Buffer | string;
  mimeType: string;
}
```

### 7.4 API Routes (Proposed)

```
src/app/api/drive/
├── test/route.ts     # GET - Test connection and list sample files
├── sync/route.ts     # POST/GET - Sync files and check status
└── file/[id]/route.ts # GET - Fetch specific file
```

### 7.5 Scope Verification

**Current Scopes (already authorized):**
- ✅ `https://www.googleapis.com/auth/drive.readonly`

**For Future Modifications:**
- `https://www.googleapis.com/auth/drive` - Full read/write access
- `https://www.googleapis.com/auth/drive.file` - Per-file access
- `https://www.googleapis.com/auth/drive.metadata.readonly` - Metadata only

**Note:** Current `drive.readonly` scope is sufficient for initial integration.

---

## 8. Implementation Checklist

### ✅ Already Complete
- [x] Service account created and configured
- [x] Drive API scope added to auth configuration
- [x] Domain-wide delegation configured in Google Workspace
- [x] Environment variables set
- [x] googleapis package installed (v169.0.0)
- [x] Authentication patterns established
- [x] Project structure defined

### 🆕 Remaining Work
- [ ] Create `src/lib/google/drive.ts` service class
- [ ] Extend `src/lib/google/types.ts` with Drive types
- [ ] Add Drive exports to `src/lib/google/index.ts`
- [ ] Create test endpoint: `src/app/api/drive/test/route.ts`
- [ ] Create sync endpoint: `src/app/api/drive/sync/route.ts`
- [ ] Add Drive integration documentation
- [ ] Write integration tests
- [ ] Update `.env.example` with Drive-specific variables (if any)

---

## 9. Key Insights

### 9.1 Architecture Strengths
1. **Consistent Patterns:** Gmail implementation provides clear blueprint for Drive
2. **Type Safety:** Strong TypeScript types throughout
3. **Error Handling:** Structured logging and error wrapping
4. **Rate Limiting:** Built-in delay mechanism prevents quota issues
5. **Singleton Pattern:** Efficient resource management
6. **Separation of Concerns:** Auth, service, types cleanly separated

### 9.2 Considerations for Drive Implementation

**Differences from Gmail:**
1. **File Downloads:** Drive requires handling binary content (Gmail only text)
2. **Folder Hierarchy:** Drive has nested folders (Gmail has flat labels)
3. **File Types:** Multiple MIME types vs. uniform email structure
4. **Permissions:** Drive has complex sharing model vs. Gmail's simpler access
5. **Larger Payloads:** Drive files can be large (streaming may be required)

**Recommended Approach:**
- Start with listing and metadata retrieval (`drive.readonly`)
- Add file download with size limits for MVP
- Implement streaming for large files later
- Use Drive query syntax for efficient filtering
- Handle pagination similar to Gmail

### 9.3 Security Considerations

1. **Scope Limitation:** Current `drive.readonly` scope limits risk exposure
2. **Domain-Wide Delegation:** Already configured and audited for Gmail
3. **User Impersonation:** Same pattern as Gmail, no new authentication flow needed
4. **Service Account:** Credentials securely stored in `.credentials/` (gitignored)

---

## 10. Next Steps

### Immediate (Phase 1)
1. Create `DriveService` class mirroring `GmailService` structure
2. Implement basic file listing with query support
3. Add metadata retrieval for individual files
4. Create test endpoint for connection verification

### Short-term (Phase 2)
5. Implement file download with size limits (e.g., <50MB)
6. Add folder traversal support
7. Create sync endpoint with Inngest integration
8. Write comprehensive integration tests

### Future Enhancements (Phase 3)
9. Add streaming support for large files
10. Implement change notifications (Drive webhooks)
11. Add file search and filtering capabilities
12. Integrate with significance scoring system

---

## 11. Related Documentation

- **Gmail Integration:** `/docs/gmail-integration.md`
- **Architecture Overview:** `/docs/architecture/izzie-architecture.md`
- **Service Account Setup:** Already documented in Gmail integration docs
- **API Reference:** Google Drive API v3 documentation

---

## 12. Dependencies

**Required Packages (already installed):**
- `googleapis@169.0.0` - Includes Drive API client
- `@types/node@25.0.3` - Node.js types
- `typescript@5.9.3` - TypeScript compiler

**No Additional Dependencies Required**

---

## Conclusion

The Izzie2 codebase is **well-prepared for Drive API integration** with established authentication patterns, configured scopes, and clear service architecture. The Gmail service implementation provides an excellent blueprint that can be adapted for Drive with minimal changes.

**Recommended Implementation Strategy:**
1. Mirror the Gmail service class structure
2. Extend type definitions for Drive-specific entities
3. Follow existing rate limiting and error handling patterns
4. Use the same singleton factory pattern
5. Integrate with existing Inngest event bus for async processing

**Estimated Implementation Effort:**
- Core DriveService class: 4-6 hours
- Type definitions and exports: 1-2 hours
- Test endpoint: 1-2 hours
- Integration tests: 2-3 hours
- **Total: ~8-13 hours**

---

**Research Completed:** January 5, 2026
**Next Action:** Begin DriveService implementation following Gmail pattern
