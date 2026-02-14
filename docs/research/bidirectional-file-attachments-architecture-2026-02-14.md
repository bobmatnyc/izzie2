# Bidirectional File Attachments Architecture for Izzie

**Research Date:** 2026-02-14
**Feature:** Bidirectional File Attachments (Outbound: Google Drive → User, Inbound: User → Google Drive)
**Status:** Architecture Design

## Executive Summary

This document presents the architectural design for bidirectional file attachment support in Izzie, enabling:
1. **Outbound**: Izzie retrieves files from Google Docs/Drive and sends to users via Telegram
2. **Inbound**: Users send files via Telegram → Izzie uploads to Google Drive in "izzie/attachments" folder

### Current System Capabilities

**Existing Infrastructure:**
- ✅ Google Drive API integration (`src/lib/google/drive.ts`)
- ✅ Google Docs API integration (`src/lib/google/docs.ts`)
- ✅ Google Sheets API integration (`src/lib/google/sheets.ts`)
- ✅ Telegram bot integration (`src/app/api/telegram/webhook/route.ts`)
- ✅ OAuth2 token management for Google APIs
- ✅ File content retrieval (docs, sheets, PDFs, binaries)
- ✅ MCP tools for Drive search and retrieval (`src/lib/chat/tools/drive.ts`)

**Primary User Interaction Channel:**
- Telegram bot (text messages currently supported)
- Web UI (dashboard at `/dashboard`)

---

## Part 1: Current System Analysis

### 1.1 Google Drive Integration

**Location:** `src/lib/google/drive.ts`

**Existing Capabilities:**

```typescript
class DriveService {
  // File Retrieval
  async listFiles(options: DriveListOptions): Promise<DriveFileBatch>
  async searchFiles(options: DriveSearchOptions): Promise<DriveFileBatch>
  async getFile(fileId: string): Promise<DriveFile>
  async getFileContent(fileId: string): Promise<DriveFileContent>

  // Change Tracking (for incremental sync)
  async getStartPageToken(): Promise<DriveChangeToken>
  async listChanges(pageToken: string): Promise<{changes, newStartPageToken, nextPageToken}>

  // Batch Operations
  async batchFetch(fileIds: string[]): Promise<DriveFile[]>
}
```

**Supported File Types:**
- Google Workspace files (Docs, Sheets, Presentations) → Export to text/CSV/PDF
- Binary files (PDFs, images, videos) → Download as Buffer
- Text files → Return as string

**Authentication:**
- OAuth2 with user impersonation
- Token refresh handled automatically
- Service account support with domain-wide delegation

**Rate Limiting:**
- 100ms delay between batch requests
- Configurable page sizes (default 100, max 1000)

**Gap Analysis for Outbound:**
- ✅ File retrieval fully implemented
- ✅ Content extraction working
- ✅ Export format handling complete
- ❌ **Missing:** File download for Telegram transfer
- ❌ **Missing:** Temporary file storage/streaming for large files
- ❌ **Missing:** File size validation for Telegram limits (50MB for bots)

---

### 1.2 Telegram Bot Integration

**Location:** `src/app/api/telegram/webhook/route.ts`

**Existing Message Flow:**

```
Telegram Update → Webhook Handler → Message Processing
  ├─ /start <code> → Account linking
  ├─ /start → Welcome message
  └─ Regular text → Chat system (processAndReply)
```

**Current Capabilities:**
- ✅ Account linking via 6-digit codes
- ✅ Session management (maps Telegram chat to chat sessions)
- ✅ Text message processing
- ✅ Rate limiting (via Upstash Redis)
- ✅ Audit logging
- ✅ Forum group support (message_thread_id)

**Telegram File Transfer APIs:**

**Receiving Files (Inbound):**
```typescript
// Telegram Update object includes:
interface TelegramUpdate {
  message: {
    document?: {
      file_id: string;
      file_unique_id: string;
      file_name: string;
      mime_type: string;
      file_size: number;
    };
    photo?: Array<{file_id: string; width: number; height: number; file_size: number}>;
    video?: {file_id: string; duration: number; width: number; height: number; file_size: number};
    // ... other media types
  }
}

// To download file from Telegram:
// 1. Get file path: GET https://api.telegram.org/bot<token>/getFile?file_id=<file_id>
// 2. Download file: https://api.telegram.org/file/bot<token>/<file_path>
```

**Sending Files (Outbound):**
```typescript
// Send document:
// POST https://api.telegram.org/bot<token>/sendDocument
// Multipart form data:
{
  chat_id: string;
  document: File | Buffer | Stream;
  caption?: string;
  reply_to_message_id?: number;
  message_thread_id?: number; // For forum groups
}

// Telegram Bot API Limits:
// - Max file size: 50MB
// - Supported: sendDocument, sendPhoto, sendVideo, sendAudio, sendVoice
```

**Gap Analysis for Telegram:**
- ✅ Message webhook handling
- ✅ User authentication
- ❌ **Missing:** File/document message handling
- ❌ **Missing:** File download from Telegram
- ❌ **Missing:** File upload to Telegram
- ❌ **Missing:** File metadata tracking

---

### 1.3 Database Schema

**Location:** `src/lib/db/schema.ts`

**Relevant Tables:**

```typescript
// Users (OAuth tokens stored here)
users: {
  id: string (PK)
  email: string
  name: string
  // ... other fields
}

// Telegram Links (maps Telegram chat_id to user_id)
telegramLinks: {
  id: uuid (PK)
  userId: string (FK users.id)
  telegramChatId: bigint (UNIQUE)
  telegramUsername: string
  linkedAt: timestamp
}

// Telegram Sessions (maps Telegram chat to chat session)
telegramSessions: {
  id: uuid (PK)
  telegramChatId: bigint (UNIQUE)
  chatSessionId: uuid (FK chatSessions.id)
  createdAt: timestamp
  updatedAt: timestamp
}

// Chat Messages (stores conversation history)
chatMessages: {
  id: uuid (PK)
  sessionId: uuid (FK chatSessions.id)
  userId: string (FK users.id)
  role: 'user' | 'assistant'
  content: text
  embedding: vector(1536) // For semantic search
  metadata: jsonb // Could store file references
  createdAt: timestamp
}
```

**Gap Analysis for Schema:**
- ❌ **Missing:** File attachments table
- ❌ **Missing:** File metadata tracking (Google Drive file_id, Telegram file_id)
- ❌ **Missing:** Upload/download status tracking
- ❌ **Missing:** File size validation tracking

---

### 1.4 Authentication & Authorization

**Google Drive Access:**
- OAuth2 tokens stored in `accounts` table
- Token refresh automatic via `oauth2Client.on('tokens')`
- User impersonation via service account (domain-wide delegation)

**Telegram Access:**
- Bot token in environment (`TELEGRAM_BOT_TOKEN`)
- User linking via 6-digit codes (expires in 10 minutes)
- Chat ID mapped to user ID in `telegramLinks` table

**Permission Model:**
- User must be authenticated with Google (OAuth)
- User must have linked Telegram account
- Files uploaded to user's Google Drive (user owns files)
- Izzie uses user's OAuth tokens to access Drive

---

## Part 2: Architecture Design

### 2.1 High-Level Flow

**Outbound (Google Drive → User):**
```
User: "Send me the Q4 report"
  ↓
Izzie Chat System
  ↓
Drive Search Tool → Find "Q4 report" file
  ↓
Drive Content Tool → Get file metadata + content
  ↓
[NEW] File Download Service → Prepare file for transfer
  ↓
[NEW] Telegram File Upload → Send document to user
  ↓
[NEW] Attachment Tracking → Log transfer
  ↓
User receives file in Telegram
```

**Inbound (User → Google Drive):**
```
User sends document via Telegram
  ↓
Telegram Webhook → Detect document message
  ↓
[NEW] File Download Service → Download from Telegram
  ↓
[NEW] File Validation → Check size, type, scan
  ↓
[NEW] Drive Upload Service → Upload to "izzie/attachments"
  ↓
[NEW] Attachment Tracking → Store metadata
  ↓
Reply with confirmation + Drive link
```

---

### 2.2 Database Schema Changes

**New Table: `file_attachments`**

```typescript
export const fileAttachments = pgTable(
  'file_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Direction: 'inbound' (user → drive) or 'outbound' (drive → user)
    direction: text('direction').notNull(), // 'inbound' | 'outbound'

    // File metadata
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(), // Bytes

    // Google Drive reference
    driveFileId: text('drive_file_id'), // Google Drive file ID
    driveFolderId: text('drive_folder_id'), // Parent folder ID
    driveWebViewLink: text('drive_web_view_link'),
    driveWebContentLink: text('drive_web_content_link'),

    // Telegram reference
    telegramFileId: text('telegram_file_id'), // Telegram file ID
    telegramChatId: bigint('telegram_chat_id', { mode: 'bigint' }),
    telegramMessageId: integer('telegram_message_id'),

    // Chat context
    chatSessionId: uuid('chat_session_id').references(() => chatSessions.id, {
      onDelete: 'set null',
    }),
    chatMessageId: uuid('chat_message_id').references(() => chatMessages.id, {
      onDelete: 'set null',
    }),

    // Transfer status
    status: text('status').notNull(), // 'pending' | 'processing' | 'completed' | 'failed'
    errorMessage: text('error_message'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),

    // Metadata
    metadata: jsonb('metadata').$type<{
      originalFileName?: string;
      uploadedBy?: string;
      description?: string;
      tags?: string[];
      [key: string]: unknown;
    }>(),
  },
  (table) => ({
    userIdIdx: index('file_attachments_user_id_idx').on(table.userId),
    directionIdx: index('file_attachments_direction_idx').on(table.direction),
    statusIdx: index('file_attachments_status_idx').on(table.status),
    driveFileIdIdx: index('file_attachments_drive_file_id_idx').on(table.driveFileId),
    telegramFileIdIdx: index('file_attachments_telegram_file_id_idx').on(table.telegramFileId),
    chatSessionIdIdx: index('file_attachments_chat_session_id_idx').on(table.chatSessionId),
    createdAtIdx: index('file_attachments_created_at_idx').on(table.createdAt),
  })
);

export type FileAttachment = typeof fileAttachments.$inferSelect;
export type NewFileAttachment = typeof fileAttachments.$inferInsert;
```

**Migration Plan:**
```sql
-- Migration: 0012_add_file_attachments.sql

CREATE TABLE IF NOT EXISTS file_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  drive_file_id TEXT,
  drive_folder_id TEXT,
  drive_web_view_link TEXT,
  drive_web_content_link TEXT,
  telegram_file_id TEXT,
  telegram_chat_id BIGINT,
  telegram_message_id INTEGER,
  chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  chat_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX file_attachments_user_id_idx ON file_attachments(user_id);
CREATE INDEX file_attachments_direction_idx ON file_attachments(direction);
CREATE INDEX file_attachments_status_idx ON file_attachments(status);
CREATE INDEX file_attachments_drive_file_id_idx ON file_attachments(drive_file_id);
CREATE INDEX file_attachments_telegram_file_id_idx ON file_attachments(telegram_file_id);
CREATE INDEX file_attachments_chat_session_id_idx ON file_attachments(chat_session_id);
CREATE INDEX file_attachments_created_at_idx ON file_attachments(created_at);
```

---

### 2.3 Service Layer Architecture

**New Services:**

#### 2.3.1 File Download Service (from Google Drive)

**Location:** `src/lib/google/file-download.ts`

```typescript
export interface DownloadOptions {
  fileId: string;
  userId: string;
  targetFormat?: 'original' | 'pdf' | 'text'; // For Google Workspace files
}

export interface DownloadResult {
  fileName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
  driveFile: DriveFile;
}

export class FileDownloadService {
  constructor(private driveService: DriveService) {}

  /**
   * Download file from Google Drive
   * Handles format conversion for Google Workspace files
   */
  async downloadFile(options: DownloadOptions): Promise<DownloadResult> {
    const { fileId, userId, targetFormat } = options;

    // Get file metadata
    const file = await this.driveService.getFile(fileId);

    // Validate file size (Telegram limit: 50MB)
    if (file.size && file.size > 50 * 1024 * 1024) {
      throw new Error(`File too large: ${file.size} bytes (max 50MB for Telegram)`);
    }

    // Get file content
    const content = await this.driveService.getFileContent(fileId);

    // Convert to Buffer if needed
    const buffer = Buffer.isBuffer(content.content)
      ? content.content
      : Buffer.from(content.content as string, 'utf-8');

    return {
      fileName: file.name,
      mimeType: content.mimeType,
      size: buffer.length,
      buffer,
      driveFile: file,
    };
  }

  /**
   * Check if file is within Telegram size limits
   */
  isWithinSizeLimit(fileSize: number): boolean {
    return fileSize <= 50 * 1024 * 1024; // 50MB
  }
}
```

#### 2.3.2 File Upload Service (to Google Drive)

**Location:** `src/lib/google/file-upload.ts`

```typescript
export interface UploadOptions {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  userId: string;
  folderId?: string;
  description?: string;
}

export interface UploadResult {
  fileId: string;
  fileName: string;
  webViewLink: string;
  webContentLink?: string;
  size: number;
}

export class FileUploadService {
  constructor(
    private driveService: DriveService,
    private oauth2Client: OAuth2Client
  ) {}

  /**
   * Upload file to Google Drive
   */
  async uploadFile(options: UploadOptions): Promise<UploadResult> {
    const { fileName, mimeType, buffer, userId, folderId, description } = options;

    // Validate file size
    if (buffer.length > 100 * 1024 * 1024) { // 100MB limit for safety
      throw new Error(`File too large: ${buffer.length} bytes (max 100MB)`);
    }

    // Ensure target folder exists (create "izzie/attachments" if needed)
    const targetFolderId = folderId || await this.ensureAttachmentsFolder();

    // Upload using Google Drive API
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

    const media = {
      mimeType,
      body: Readable.from(buffer),
    };

    const fileMetadata = {
      name: fileName,
      parents: [targetFolderId],
      description: description || `Uploaded via Izzie on ${new Date().toISOString()}`,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name, webViewLink, webContentLink, size',
    });

    return {
      fileId: response.data.id!,
      fileName: response.data.name!,
      webViewLink: response.data.webViewLink!,
      webContentLink: response.data.webContentLink,
      size: parseInt(response.data.size || '0', 10),
    };
  }

  /**
   * Ensure "izzie/attachments" folder exists, create if not
   */
  private async ensureAttachmentsFolder(): Promise<string> {
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

    // Search for existing "izzie" folder
    const izzieSearch = await drive.files.list({
      q: "name='izzie' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)',
      pageSize: 1,
    });

    let izzieFolderId: string;

    if (izzieSearch.data.files && izzieSearch.data.files.length > 0) {
      izzieFolderId = izzieSearch.data.files[0].id!;
    } else {
      // Create "izzie" folder
      const izzieFolder = await drive.files.create({
        requestBody: {
          name: 'izzie',
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      izzieFolderId = izzieFolder.data.id!;
    }

    // Search for "attachments" subfolder
    const attachmentsSearch = await drive.files.list({
      q: `name='attachments' and '${izzieFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    if (attachmentsSearch.data.files && attachmentsSearch.data.files.length > 0) {
      return attachmentsSearch.data.files[0].id!;
    }

    // Create "attachments" subfolder
    const attachmentsFolder = await drive.files.create({
      requestBody: {
        name: 'attachments',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [izzieFolderId],
      },
      fields: 'id',
    });

    return attachmentsFolder.data.id!;
  }
}
```

#### 2.3.3 Telegram File Service

**Location:** `src/lib/telegram/file-service.ts`

```typescript
export interface TelegramFileInfo {
  fileId: string;
  fileUniqueId: string;
  fileName?: string;
  mimeType?: string;
  fileSize: number;
  filePath: string; // Path on Telegram servers
}

export class TelegramFileService {
  constructor(private botToken: string) {}

  /**
   * Get file info from Telegram
   */
  async getFileInfo(fileId: string): Promise<TelegramFileInfo> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get file info: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description}`);
    }

    return {
      fileId,
      fileUniqueId: data.result.file_unique_id,
      filePath: data.result.file_path,
      fileSize: data.result.file_size,
    };
  }

  /**
   * Download file from Telegram
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    const fileInfo = await this.getFileInfo(fileId);

    const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${fileInfo.filePath}`;

    const response = await fetch(fileUrl);

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Send document to Telegram chat
   */
  async sendDocument(options: {
    chatId: string;
    document: Buffer;
    fileName: string;
    caption?: string;
    replyToMessageId?: number;
    messageThreadId?: number;
  }): Promise<{ success: boolean; messageId?: number }> {
    const formData = new FormData();
    formData.append('chat_id', options.chatId);
    formData.append('document', new Blob([options.document]), options.fileName);

    if (options.caption) {
      formData.append('caption', options.caption);
    }
    if (options.replyToMessageId) {
      formData.append('reply_to_message_id', options.replyToMessageId.toString());
    }
    if (options.messageThreadId) {
      formData.append('message_thread_id', options.messageThreadId.toString());
    }

    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/sendDocument`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const data = await response.json();

    return {
      success: data.ok,
      messageId: data.result?.message_id,
    };
  }
}
```

#### 2.3.4 File Attachment Service (Orchestration)

**Location:** `src/lib/attachments/attachment-service.ts`

```typescript
export class FileAttachmentService {
  constructor(
    private db: ReturnType<typeof dbClient.getDb>,
    private driveService: DriveService,
    private uploadService: FileUploadService,
    private downloadService: FileDownloadService,
    private telegramService: TelegramFileService
  ) {}

  /**
   * Handle outbound file transfer (Drive → Telegram)
   */
  async sendFileToUser(options: {
    userId: string;
    driveFileId: string;
    telegramChatId: bigint;
    chatSessionId?: string;
    chatMessageId?: string;
  }): Promise<FileAttachment> {
    // Create attachment record
    const attachment = await this.db
      .insert(fileAttachments)
      .values({
        userId: options.userId,
        direction: 'outbound',
        driveFileId: options.driveFileId,
        telegramChatId: options.telegramChatId,
        chatSessionId: options.chatSessionId,
        chatMessageId: options.chatMessageId,
        status: 'pending',
        fileName: '', // Populated after download
        mimeType: '',
        fileSize: 0,
      })
      .returning();

    try {
      // Update status to processing
      await this.db
        .update(fileAttachments)
        .set({ status: 'processing' })
        .where(eq(fileAttachments.id, attachment[0].id));

      // Download from Drive
      const downloaded = await this.downloadService.downloadFile({
        fileId: options.driveFileId,
        userId: options.userId,
      });

      // Upload to Telegram
      const sent = await this.telegramService.sendDocument({
        chatId: options.telegramChatId.toString(),
        document: downloaded.buffer,
        fileName: downloaded.fileName,
        caption: `📎 ${downloaded.fileName} (${this.formatFileSize(downloaded.size)})`,
      });

      if (!sent.success) {
        throw new Error('Failed to send document to Telegram');
      }

      // Update attachment record
      const updated = await this.db
        .update(fileAttachments)
        .set({
          status: 'completed',
          fileName: downloaded.fileName,
          mimeType: downloaded.mimeType,
          fileSize: downloaded.size,
          telegramMessageId: sent.messageId,
          driveWebViewLink: downloaded.driveFile.webViewLink,
          completedAt: new Date(),
        })
        .where(eq(fileAttachments.id, attachment[0].id))
        .returning();

      return updated[0];
    } catch (error) {
      // Update status to failed
      await this.db
        .update(fileAttachments)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        .where(eq(fileAttachments.id, attachment[0].id));

      throw error;
    }
  }

  /**
   * Handle inbound file transfer (Telegram → Drive)
   */
  async receiveFileFromUser(options: {
    userId: string;
    telegramFileId: string;
    telegramChatId: bigint;
    fileName: string;
    mimeType: string;
    fileSize: number;
    chatSessionId?: string;
    chatMessageId?: string;
  }): Promise<FileAttachment> {
    // Create attachment record
    const attachment = await this.db
      .insert(fileAttachments)
      .values({
        userId: options.userId,
        direction: 'inbound',
        fileName: options.fileName,
        mimeType: options.mimeType,
        fileSize: options.fileSize,
        telegramFileId: options.telegramFileId,
        telegramChatId: options.telegramChatId,
        chatSessionId: options.chatSessionId,
        chatMessageId: options.chatMessageId,
        status: 'pending',
      })
      .returning();

    try {
      // Update status to processing
      await this.db
        .update(fileAttachments)
        .set({ status: 'processing' })
        .where(eq(fileAttachments.id, attachment[0].id));

      // Download from Telegram
      const buffer = await this.telegramService.downloadFile(options.telegramFileId);

      // Upload to Google Drive
      const uploaded = await this.uploadService.uploadFile({
        fileName: options.fileName,
        mimeType: options.mimeType,
        buffer,
        userId: options.userId,
        description: `Uploaded from Telegram on ${new Date().toISOString()}`,
      });

      // Update attachment record
      const updated = await this.db
        .update(fileAttachments)
        .set({
          status: 'completed',
          driveFileId: uploaded.fileId,
          driveWebViewLink: uploaded.webViewLink,
          driveWebContentLink: uploaded.webContentLink,
          completedAt: new Date(),
        })
        .where(eq(fileAttachments.id, attachment[0].id))
        .returning();

      return updated[0];
    } catch (error) {
      // Update status to failed
      await this.db
        .update(fileAttachments)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        .where(eq(fileAttachments.id, attachment[0].id));

      throw error;
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
```

---

### 2.4 API Endpoint Specifications

#### 2.4.1 Outbound: GET /api/files/:id/send

**Purpose:** Send a Google Drive file to user via Telegram

```typescript
// src/app/api/files/[id]/send/route.ts

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { driveFileId } = await request.json();

  // Get Telegram chat ID for user
  const telegramLink = await getUserTelegramLink(session.user.id);
  if (!telegramLink) {
    return NextResponse.json(
      { error: 'Telegram not linked' },
      { status: 400 }
    );
  }

  // Initialize services
  const attachmentService = await getFileAttachmentService(session.user.id);

  try {
    const attachment = await attachmentService.sendFileToUser({
      userId: session.user.id,
      driveFileId,
      telegramChatId: telegramLink.telegramChatId,
    });

    return NextResponse.json({
      success: true,
      attachment: {
        id: attachment.id,
        fileName: attachment.fileName,
        status: attachment.status,
        driveFileId: attachment.driveFileId,
      },
    });
  } catch (error) {
    console.error('[API] Failed to send file:', error);
    return NextResponse.json(
      { error: 'Failed to send file' },
      { status: 500 }
    );
  }
}
```

#### 2.4.2 Inbound: Webhook Update (Modified)

**Location:** `src/app/api/telegram/webhook/route.ts` (modification)

```typescript
// Add to existing webhook handler

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ... existing verification and parsing ...

  const message = update.message;

  // NEW: Handle document messages
  if (message?.document) {
    return handleDocumentMessage(message);
  }

  // Existing text message handling
  if (message?.text) {
    // ... existing logic ...
  }

  return NextResponse.json({ ok: true });
}

async function handleDocumentMessage(
  message: TelegramMessage
): Promise<NextResponse> {
  const chatId = message.chat.id;
  const document = message.document!;

  // Get user from Telegram link
  const userId = await getUserByTelegramChatId(chatId);
  if (!userId) {
    // User not linked
    const bot = getTelegramBot();
    await bot?.send(
      chatId.toString(),
      'Your Telegram is not linked. Please visit izzie.ai/settings to link.'
    );
    return NextResponse.json({ ok: true });
  }

  // Initialize services
  const attachmentService = await getFileAttachmentService(userId);
  const bot = getTelegramBot();

  try {
    // Send acknowledgment
    await bot?.send(chatId.toString(), '📎 Uploading to Google Drive...');

    // Process file upload
    const attachment = await attachmentService.receiveFileFromUser({
      userId,
      telegramFileId: document.file_id,
      telegramChatId: chatId,
      fileName: document.file_name || `file_${Date.now()}`,
      mimeType: document.mime_type || 'application/octet-stream',
      fileSize: document.file_size || 0,
    });

    // Send success confirmation with link
    await bot?.send(
      chatId.toString(),
      `✅ Uploaded to Google Drive!\n\n` +
      `📎 ${attachment.fileName}\n` +
      `🔗 ${attachment.driveWebViewLink}`
    );
  } catch (error) {
    console.error('[Telegram] File upload failed:', error);
    await bot?.send(
      chatId.toString(),
      '❌ Upload failed. Please try again or contact support.'
    );
  }

  return NextResponse.json({ ok: true });
}
```

#### 2.4.3 Status: GET /api/files/attachments

**Purpose:** List user's file attachments

```typescript
// src/app/api/files/attachments/route.ts

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const direction = searchParams.get('direction'); // 'inbound' | 'outbound' | null
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const db = dbClient.getDb();

  let query = db
    .select()
    .from(fileAttachments)
    .where(eq(fileAttachments.userId, session.user.id))
    .orderBy(desc(fileAttachments.createdAt))
    .limit(limit)
    .offset(offset);

  if (direction) {
    query = query.where(eq(fileAttachments.direction, direction));
  }

  const attachments = await query;

  return NextResponse.json({
    attachments,
    pagination: {
      limit,
      offset,
      total: attachments.length,
    },
  });
}
```

---

### 2.5 Security & Validation

**File Size Limits:**
- Telegram: Max 50MB for bot uploads
- Google Drive: Recommend 100MB limit for uploads (avoid quota issues)
- Validation: Check file size before transfer

**File Type Validation:**
- Whitelist safe MIME types
- Block executable files (.exe, .bat, .sh, .bin)
- Validate extensions match MIME types

**Virus Scanning (Future Enhancement):**
- Integration with ClamAV or VirusTotal API
- Scan files before upload to Drive
- Quarantine suspicious files

**Access Control:**
- Verify user owns Google Drive file (check ownership via Drive API)
- Validate Telegram chat ID matches linked account
- Rate limiting: Max 10 file transfers per user per hour

**Error Handling:**
- Graceful degradation if Telegram/Drive API unavailable
- Retry logic with exponential backoff
- User-friendly error messages
- Audit logging for failed transfers

---

## Part 3: Implementation Plan

### 3.1 Phase 1: Database Schema (1 day)

**Tasks:**
1. Create migration `0012_add_file_attachments.sql`
2. Add `fileAttachments` table to `src/lib/db/schema.ts`
3. Run migration: `pnpm db:migrate`
4. Test schema with sample data

**Validation:**
- ✅ Table created successfully
- ✅ Indexes created
- ✅ Foreign key constraints working
- ✅ Type exports available

---

### 3.2 Phase 2: Service Layer (3-4 days)

**Tasks:**

**Day 1: File Download Service**
- Implement `FileDownloadService` in `src/lib/google/file-download.ts`
- Add size validation
- Test with various file types (docs, sheets, PDFs, images)

**Day 2: File Upload Service**
- Implement `FileUploadService` in `src/lib/google/file-upload.ts`
- Implement folder creation logic ("izzie/attachments")
- Test uploads with sample files

**Day 3: Telegram File Service**
- Implement `TelegramFileService` in `src/lib/telegram/file-service.ts`
- Test file download from Telegram
- Test file upload to Telegram
- Handle Telegram API errors gracefully

**Day 4: Attachment Service (Orchestration)**
- Implement `FileAttachmentService` in `src/lib/attachments/attachment-service.ts`
- Wire up all services
- Add transaction handling for DB operations
- Test end-to-end flows

**Validation:**
- ✅ Files download from Drive correctly
- ✅ Files upload to Drive in correct folder
- ✅ Telegram file transfers working
- ✅ DB records track status accurately

---

### 3.3 Phase 3: API Endpoints (2 days)

**Tasks:**

**Day 1: Outbound Endpoint**
- Implement `POST /api/files/[id]/send`
- Add authentication checks
- Add Telegram link validation
- Test with various file types

**Day 2: Inbound Webhook + Status**
- Modify `POST /api/telegram/webhook` to handle documents
- Implement `GET /api/files/attachments`
- Add error handling and user feedback

**Validation:**
- ✅ Outbound transfers work via API
- ✅ Inbound transfers work via Telegram
- ✅ Status endpoint returns correct data
- ✅ Error messages user-friendly

---

### 3.4 Phase 4: Chat Integration (2 days)

**Tasks:**

**Day 1: MCP Tools**
- Add "send_file" tool to `src/lib/chat/tools/drive.ts`
- Update tool schema and documentation
- Test in chat context

**Day 2: Chat Flow**
- Integrate file sending into natural language flow
- Add file upload confirmation messages
- Test user experience end-to-end

**Example Usage:**
```
User: "Send me the Q4 report"
Izzie: [Searches Drive] → Found "Q4_Report_2024.pdf"
      [Sends via Telegram] → "📎 Sent Q4_Report_2024.pdf (2.3 MB)"
User: [Receives file in Telegram]

User: [Sends contract.pdf via Telegram]
Izzie: "📎 Uploading to Google Drive..."
      [Uploads to izzie/attachments]
      "✅ Uploaded to Google Drive! 🔗 https://drive.google.com/file/d/..."
```

**Validation:**
- ✅ Chat understands file requests
- ✅ Tool execution successful
- ✅ User receives files promptly
- ✅ Confirmations clear and helpful

---

### 3.5 Phase 5: Testing & Security (2-3 days)

**Unit Tests:**
- FileDownloadService
- FileUploadService
- TelegramFileService
- FileAttachmentService

**Integration Tests:**
- End-to-end outbound flow
- End-to-end inbound flow
- Error scenarios (file too large, invalid format, etc.)
- Rate limiting tests

**Security Tests:**
- File type validation
- Size limit enforcement
- Access control verification
- Token refresh handling

**E2E Tests (Playwright):**
- User links Telegram
- User requests file via chat
- User receives file in Telegram
- User uploads file via Telegram
- User sees file in Drive

**Validation:**
- ✅ All tests passing
- ✅ No security vulnerabilities
- ✅ Error handling robust
- ✅ Performance acceptable (<5s per transfer)

---

### 3.6 Phase 6: Documentation (1 day)

**User Documentation:**
- Feature announcement
- Usage instructions (how to send/receive files)
- File size and type limitations
- Troubleshooting guide

**Developer Documentation:**
- Architecture overview (this document)
- Service API documentation
- Endpoint specifications
- Database schema reference

**Deployment Guide:**
- Migration steps
- Environment variables
- Monitoring setup
- Rollback plan

---

## Part 4: Security Considerations

### 4.1 File Type Restrictions

**Allowed MIME Types (Whitelist):**
```typescript
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/html',

  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',

  // Archives
  'application/zip',
  'application/x-tar',
  'application/gzip',

  // Media
  'audio/mpeg',
  'audio/mp4',
  'video/mp4',
  'video/quicktime',
];

const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.scr', '.pif',
  '.sh', '.bash', '.bin', '.app', '.deb', '.rpm',
  '.msi', '.dmg', '.pkg', '.js', '.vbs', '.jar',
];

function isFileTypeAllowed(fileName: string, mimeType: string): boolean {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return false;
  }

  // Check extension
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext && BLOCKED_EXTENSIONS.some(blocked => blocked.includes(ext))) {
    return false;
  }

  return true;
}
```

### 4.2 Size Validation

```typescript
const FILE_SIZE_LIMITS = {
  TELEGRAM_MAX: 50 * 1024 * 1024, // 50MB
  DRIVE_UPLOAD_MAX: 100 * 1024 * 1024, // 100MB
  WARNING_THRESHOLD: 10 * 1024 * 1024, // 10MB (warn user)
};

function validateFileSize(fileSize: number, direction: 'inbound' | 'outbound'): {
  valid: boolean;
  error?: string;
  warning?: string;
} {
  if (direction === 'outbound') {
    if (fileSize > FILE_SIZE_LIMITS.TELEGRAM_MAX) {
      return {
        valid: false,
        error: `File too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Telegram limit is 50MB.`,
      };
    }
    if (fileSize > FILE_SIZE_LIMITS.WARNING_THRESHOLD) {
      return {
        valid: true,
        warning: `Large file (${(fileSize / 1024 / 1024).toFixed(1)}MB). Transfer may take a few seconds.`,
      };
    }
  } else {
    if (fileSize > FILE_SIZE_LIMITS.DRIVE_UPLOAD_MAX) {
      return {
        valid: false,
        error: `File too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Maximum upload size is 100MB.`,
      };
    }
  }

  return { valid: true };
}
```

### 4.3 Rate Limiting

```typescript
// src/lib/attachments/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Rate limiter: 10 file transfers per user per hour
export const fileTransferRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  analytics: true,
});

export async function checkFileTransferRateLimit(userId: string): Promise<{
  allowed: boolean;
  remaining: number;
  reset: number;
}> {
  const result = await fileTransferRateLimit.limit(`file_transfer:${userId}`);

  return {
    allowed: result.success,
    remaining: result.remaining,
    reset: result.reset,
  };
}
```

### 4.4 Virus Scanning (Future)

```typescript
// Future enhancement: Integrate with VirusTotal API
async function scanFileForViruses(buffer: Buffer, fileName: string): Promise<{
  safe: boolean;
  threats?: string[];
}> {
  // Placeholder for future implementation
  // Options:
  // 1. VirusTotal API (https://developers.virustotal.com/)
  // 2. ClamAV integration (open-source)
  // 3. Google Safe Browsing API

  return { safe: true };
}
```

---

## Part 5: Error Handling & Edge Cases

### 5.1 Error Scenarios

**Outbound Errors:**
1. File not found in Drive → `DriveFileNotFoundError`
2. File too large for Telegram → `FileSizeExceededError`
3. User doesn't have Drive access → `UnauthorizedError`
4. Telegram send failed → `TelegramAPIError`
5. Network timeout → `NetworkTimeoutError`

**Inbound Errors:**
1. Telegram download failed → `TelegramDownloadError`
2. Drive upload quota exceeded → `DriveQuotaExceededError`
3. Invalid file type → `InvalidFileTypeError`
4. Network timeout → `NetworkTimeoutError`
5. Drive folder creation failed → `DriveFolderError`

**Error Response Format:**
```typescript
interface FileTransferError {
  code: string;
  message: string;
  details?: {
    fileName?: string;
    fileSize?: number;
    reason?: string;
  };
  userMessage: string; // User-friendly message for Telegram
}
```

**Example Error Handling:**
```typescript
try {
  await attachmentService.sendFileToUser(options);
} catch (error) {
  if (error instanceof FileSizeExceededError) {
    await bot.send(
      chatId,
      `❌ File too large (${error.fileSizeInMB}MB). Telegram limit is 50MB. ` +
      `View in Drive: ${error.driveLink}`
    );
  } else if (error instanceof UnauthorizedError) {
    await bot.send(
      chatId,
      `❌ Can't access file. Make sure you have permission to view it in Google Drive.`
    );
  } else {
    await bot.send(
      chatId,
      `❌ Failed to send file. Please try again or contact support.`
    );
  }
}
```

---

### 5.2 Edge Cases

**Case 1: User uploads file while disconnected from Telegram**
- Solution: Store file in Drive, send notification when user reconnects

**Case 2: File name contains special characters or emojis**
- Solution: Sanitize file names, preserve original in metadata

**Case 3: User requests file that's shared with them (not owned)**
- Solution: Check `canDownload` capability before transfer

**Case 4: Large file transfer interrupted**
- Solution: Implement resume logic using Range headers (future enhancement)

**Case 5: Multiple concurrent file transfers**
- Solution: Queue system with max 3 concurrent transfers per user

**Case 6: User deletes file from Drive after sending to Telegram**
- Solution: Attachment record persists with status, link becomes 404

**Case 7: Telegram rate limits exceeded**
- Solution: Queue transfers, retry with exponential backoff

---

## Part 6: Performance Optimization

### 6.1 Transfer Performance

**Streaming (Future Enhancement):**
- Avoid loading entire file into memory
- Use streams for large files (>10MB)
- Implement chunked uploads/downloads

**Parallel Transfers:**
- Support multiple files in single chat message (future)
- Process file chunks in parallel

**Caching:**
- Cache Drive folder IDs (avoid repeated lookups)
- Cache file metadata for recently transferred files

### 6.2 Database Optimization

**Indexes:**
- `user_id` (most queries filtered by user)
- `status` (for filtering pending/failed transfers)
- `created_at` (for sorting recent transfers)
- `drive_file_id` (for lookups by file)

**Partitioning (Future):**
- Partition by user_id for large-scale deployments
- Archive completed transfers older than 90 days

### 6.3 Monitoring

**Key Metrics:**
- Transfer success rate (target: >95%)
- Average transfer time (target: <5s for files <5MB)
- Error rate by type
- File size distribution
- Peak transfer times

**Alerting:**
- Error rate >10% in 5-minute window
- Transfer time >30s (indicates API issues)
- Quota warnings from Google Drive API
- Telegram API errors

---

## Part 7: Future Enhancements

### 7.1 Short-Term (Next 3-6 months)

1. **File Previews in Chat**
   - Show thumbnail/preview before full download
   - Quick metadata view (size, type, last modified)

2. **Batch File Operations**
   - Send multiple files at once
   - Folder uploads (zip all files)

3. **File Search by Content**
   - Search files uploaded via Telegram
   - OCR for scanned documents

4. **Smart File Organization**
   - Auto-tagging based on content
   - Suggested folder locations

### 7.2 Long-Term (6-12 months)

1. **Multi-Cloud Support**
   - Dropbox integration
   - OneDrive integration
   - S3-compatible storage

2. **Advanced File Processing**
   - PDF editing (merge, split, compress)
   - Image optimization
   - Video transcoding

3. **Collaborative Features**
   - Share files with team members
   - Comment on files via chat
   - Version control

4. **AI-Powered Features**
   - Automatic file summarization
   - Content extraction (dates, contacts, action items)
   - Smart suggestions ("Upload to project folder?")

---

## Part 8: Risks & Mitigation

### 8.1 Technical Risks

**Risk 1: Telegram API Rate Limits**
- **Impact:** Failed file transfers, user frustration
- **Likelihood:** Medium
- **Mitigation:** Implement queue system, retry logic, inform users of delays

**Risk 2: Google Drive Quota Exceeded**
- **Impact:** Upload failures, user confusion
- **Likelihood:** Low-Medium (depends on user quota)
- **Mitigation:** Check quota before upload, suggest cleanup options

**Risk 3: Large File Transfer Timeouts**
- **Impact:** Incomplete transfers, wasted bandwidth
- **Likelihood:** Medium (for files >20MB)
- **Mitigation:** Implement resumable uploads, progress tracking

**Risk 4: Token Refresh Failures**
- **Impact:** Authorization errors, service disruption
- **Likelihood:** Low (auto-refresh implemented)
- **Mitigation:** Retry logic, fallback to re-authentication

### 8.2 Security Risks

**Risk 1: Malicious File Uploads**
- **Impact:** Malware in user's Drive, security breach
- **Likelihood:** Low (assuming whitelisting)
- **Mitigation:** File type validation, virus scanning (future), user education

**Risk 2: Unauthorized Access**
- **Impact:** Data breach, privacy violation
- **Likelihood:** Low (OAuth scopes limited)
- **Mitigation:** Strict authorization checks, audit logging, scope review

**Risk 3: Rate Limit Abuse**
- **Impact:** Service degradation for all users
- **Likelihood:** Low-Medium
- **Mitigation:** Per-user rate limiting, anomaly detection

### 8.3 User Experience Risks

**Risk 1: Slow Transfers**
- **Impact:** User frustration, abandoned feature
- **Likelihood:** Medium (network-dependent)
- **Mitigation:** Set clear expectations, show progress, optimize for common files

**Risk 2: Confusing Error Messages**
- **Impact:** Support burden, negative reviews
- **Likelihood:** Medium
- **Mitigation:** User-friendly messages, troubleshooting guides, proactive support

**Risk 3: Lost Files**
- **Impact:** Trust erosion, data loss
- **Likelihood:** Very Low
- **Mitigation:** Comprehensive logging, status tracking, backup mechanisms

---

## Part 9: Testing Strategy

### 9.1 Unit Tests

**DriveService:**
- ✅ File metadata retrieval
- ✅ Content download (text, binary, Google Workspace)
- ✅ Export format handling
- ✅ Error handling (404, auth failures)

**FileUploadService:**
- ✅ File upload to Drive
- ✅ Folder creation/lookup
- ✅ Size validation
- ✅ MIME type validation

**TelegramFileService:**
- ✅ File download from Telegram
- ✅ File upload to Telegram
- ✅ API error handling
- ✅ Size limit enforcement

**FileAttachmentService:**
- ✅ Outbound flow orchestration
- ✅ Inbound flow orchestration
- ✅ Status tracking
- ✅ Error recovery

### 9.2 Integration Tests

**Outbound Flow:**
```typescript
describe('Outbound file transfer', () => {
  it('should send Google Doc to Telegram', async () => {
    const result = await attachmentService.sendFileToUser({
      userId: testUserId,
      driveFileId: testDocId,
      telegramChatId: testChatId,
    });

    expect(result.status).toBe('completed');
    expect(result.telegramMessageId).toBeDefined();
  });

  it('should handle large PDF files', async () => {
    // Test with 40MB PDF (under limit)
  });

  it('should reject oversized files', async () => {
    // Test with 60MB file (over limit)
    await expect(
      attachmentService.sendFileToUser(options)
    ).rejects.toThrow('File too large');
  });
});
```

**Inbound Flow:**
```typescript
describe('Inbound file transfer', () => {
  it('should upload document from Telegram to Drive', async () => {
    const result = await attachmentService.receiveFileFromUser({
      userId: testUserId,
      telegramFileId: testFileId,
      telegramChatId: testChatId,
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024000,
    });

    expect(result.status).toBe('completed');
    expect(result.driveFileId).toBeDefined();
    expect(result.driveWebViewLink).toContain('drive.google.com');
  });

  it('should create izzie/attachments folder if missing', async () => {
    // Test folder creation logic
  });

  it('should reject blocked file types', async () => {
    await expect(
      attachmentService.receiveFileFromUser({
        // ... with .exe file
      })
    ).rejects.toThrow('Invalid file type');
  });
});
```

### 9.3 E2E Tests (Playwright)

**Test Case 1: User requests file via chat**
```typescript
test('user requests file via chat and receives in Telegram', async ({ page }) => {
  // 1. Navigate to chat
  await page.goto('/dashboard/chat');

  // 2. Send message requesting file
  await page.fill('[data-testid="chat-input"]', 'Send me the Q4 report');
  await page.click('[data-testid="send-button"]');

  // 3. Wait for Izzie response
  await page.waitForSelector('[data-testid="assistant-message"]');

  // 4. Verify file sent (mock Telegram API check)
  const response = await page.evaluate(() => {
    return fetch('/api/files/attachments?direction=outbound&limit=1')
      .then(res => res.json());
  });

  expect(response.attachments[0].status).toBe('completed');
});
```

**Test Case 2: User uploads file via Telegram**
```typescript
test('user uploads file via Telegram to Drive', async ({ request }) => {
  // 1. Simulate Telegram webhook with document message
  const webhookResponse = await request.post('/api/telegram/webhook', {
    data: {
      update_id: 12345,
      message: {
        message_id: 67890,
        chat: { id: testChatId },
        from: { id: testUserId },
        document: {
          file_id: 'test_file_id',
          file_name: 'contract.pdf',
          mime_type: 'application/pdf',
          file_size: 1024000,
        },
      },
    },
  });

  expect(webhookResponse.ok()).toBeTruthy();

  // 2. Verify file uploaded to Drive
  const attachment = await db
    .select()
    .from(fileAttachments)
    .where(eq(fileAttachments.telegramFileId, 'test_file_id'))
    .limit(1);

  expect(attachment[0].status).toBe('completed');
  expect(attachment[0].driveFileId).toBeDefined();
});
```

---

## Part 10: Deployment Checklist

### Pre-Deployment

- [ ] All unit tests passing (coverage >80%)
- [ ] All integration tests passing
- [ ] E2E tests validated in staging
- [ ] Security audit complete
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Database migration tested in staging
- [ ] Rollback plan documented

### Deployment Steps

1. **Database Migration**
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

2. **Environment Variables**
   ```bash
   # Add to .env (if not already present)
   TELEGRAM_BOT_TOKEN=your_bot_token
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   UPSTASH_REDIS_REST_URL=your_redis_url
   UPSTASH_REDIS_REST_TOKEN=your_redis_token
   ```

3. **Deploy Application**
   ```bash
   pnpm build
   pnpm start
   ```

4. **Verify Deployment**
   - [ ] Health check endpoint returns 200
   - [ ] Telegram webhook responds
   - [ ] Drive API connections working
   - [ ] Database queries executing

5. **Monitor Initial Transfers**
   - [ ] Watch error logs for 1 hour
   - [ ] Verify first 10 transfers successful
   - [ ] Check rate limits not exceeded
   - [ ] Confirm user feedback positive

### Post-Deployment

- [ ] Update user documentation
- [ ] Announce feature in changelog
- [ ] Monitor metrics for 24 hours
- [ ] Collect user feedback
- [ ] Plan iteration based on feedback

---

## Part 11: Success Metrics

### Key Performance Indicators (KPIs)

**Usage Metrics:**
- Daily active file transfers
- Unique users using file attachments
- Average files per user per day
- Transfer volume (GB/day)

**Performance Metrics:**
- Transfer success rate (target: >95%)
- Average transfer time (target: <5s for <5MB files)
- P95 transfer time (target: <15s)
- Error rate (target: <5%)

**User Satisfaction:**
- Feature adoption rate (target: >30% of active users)
- User-reported issues (target: <10/week)
- Feature usage retention (target: >70% after 1 month)

### Monitoring Dashboard

**Key Metrics to Track:**
1. File transfer volume (chart over time)
2. Success vs. failure rate (pie chart)
3. Error types distribution (bar chart)
4. Average transfer time by file size (scatter plot)
5. Top users by transfer count (leaderboard)

---

## Conclusion

This architecture provides a comprehensive solution for bidirectional file attachments in Izzie, enabling seamless file transfers between Google Drive and Telegram. The design prioritizes:

1. **User Experience:** Simple, intuitive file transfers via natural language
2. **Security:** Robust validation, rate limiting, and access control
3. **Reliability:** Comprehensive error handling and status tracking
4. **Scalability:** Efficient services, caching, and monitoring
5. **Maintainability:** Clean service layer, comprehensive testing, detailed documentation

### Estimated Timeline

**Total Implementation Time:** 10-12 days

- Phase 1 (Schema): 1 day
- Phase 2 (Services): 3-4 days
- Phase 3 (API Endpoints): 2 days
- Phase 4 (Chat Integration): 2 days
- Phase 5 (Testing): 2-3 days
- Phase 6 (Documentation): 1 day

### Next Steps

1. ✅ **Review architecture** (this document)
2. **Approve implementation plan**
3. **Begin Phase 1:** Database schema migration
4. **Implement services** (Phases 2-4)
5. **Test thoroughly** (Phase 5)
6. **Deploy to production**
7. **Monitor and iterate**

---

**Document Version:** 1.0
**Last Updated:** 2026-02-14
**Author:** Research Agent
**Status:** Ready for Implementation
