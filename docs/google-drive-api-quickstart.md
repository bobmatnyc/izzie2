# Google Drive API Quick Start

Quick reference for using the Drive API in Izzie2.

---

## Basic Usage

```typescript
import { getServiceAccountDrive } from '@/lib/google/drive';

// Initialize Drive service for a user
const drive = await getServiceAccountDrive('user@matsuoka.com');

// List recent files
const files = await drive.listFiles({
  maxResults: 20,
  orderBy: 'modifiedTime desc'
});

console.log(`Found ${files.files.length} files`);
```

---

## Common Operations

### List Files

```typescript
const result = await drive.listFiles({
  maxResults: 50,
  orderBy: 'modifiedTime desc',
  query: "mimeType contains 'document'"
});

for (const file of result.files) {
  console.log(`${file.name} (${file.mimeType})`);
}
```

### Search Files

```typescript
const result = await drive.searchFiles({
  query: 'quarterly report',
  maxResults: 10
});
```

### Get File Metadata

```typescript
const file = await drive.getFile('file-id-here');
console.log(file.name, file.owners, file.shared);
```

### Extract File Content

```typescript
const content = await drive.getFileContent('file-id-here');

if (typeof content.content === 'string') {
  console.log('Text:', content.content);
} else {
  console.log('Binary data:', content.content.length, 'bytes');
}
```

### Pagination

```typescript
let pageToken: string | undefined;

do {
  const batch = await drive.listFiles({
    maxResults: 100,
    pageToken
  });

  // Process batch.files

  pageToken = batch.nextPageToken;
} while (pageToken);
```

### Incremental Sync

```typescript
// First time - get start token
const token = await drive.getStartPageToken();
// Save token.token to database

// Later - check for changes
const changes = await drive.listChanges(savedToken);

for (const change of changes.changes) {
  if (change.removed) {
    console.log(`Deleted: ${change.fileId}`);
  } else {
    console.log(`Changed: ${change.file?.name}`);
  }
}

// Save changes.newStartPageToken for next sync
```

---

## Drive Query Syntax

```typescript
// Files containing text
query: "fullText contains 'keyword'"

// Files by name
query: "name contains 'report'"

// Files by type
query: "mimeType='application/pdf'"
query: "mimeType contains 'google-apps.document'"

// Files in folder
query: "'folder-id' in parents"

// Starred files
query: "starred = true"

// Not trashed
query: "trashed = false"

// Modified after date
query: "modifiedTime > '2025-01-01T00:00:00'"

// Combine queries
query: "name contains 'report' and mimeType contains 'spreadsheet'"
```

---

## MIME Types

### Google Workspace Files

- **Google Docs:** `application/vnd.google-apps.document` → Exports to `text/plain`
- **Google Sheets:** `application/vnd.google-apps.spreadsheet` → Exports to `text/csv`
- **Google Slides:** `application/vnd.google-apps.presentation` → Exports to `text/plain`
- **Google Folders:** `application/vnd.google-apps.folder`

### Common Files

- **PDF:** `application/pdf`
- **Text:** `text/plain`
- **JSON:** `application/json`
- **CSV:** `text/csv`

---

## Error Handling

```typescript
try {
  const file = await drive.getFile(fileId);
} catch (error) {
  console.error('[Drive Error]:', error);

  if (error.message.includes('not found')) {
    // File doesn't exist
  } else if (error.message.includes('permission')) {
    // Access denied
  } else if (error.message.includes('quota')) {
    // Rate limit exceeded
  }
}
```

---

## Testing

```bash
# Test Drive connection
curl "http://localhost:3300/api/drive/test?userEmail=bob@matsuoka.com"

# Limit results
curl "http://localhost:3300/api/drive/test?userEmail=bob@matsuoka.com&maxResults=5"

# Filter by query
curl "http://localhost:3300/api/drive/test?userEmail=bob@matsuoka.com&query=name%20contains%20'report'"
```

---

## Next.js API Route Example

```typescript
// src/app/api/my-endpoint/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServiceAccountDrive } from '@/lib/google/drive';

export async function GET(request: NextRequest) {
  try {
    const userEmail = request.nextUrl.searchParams.get('userEmail');

    if (!userEmail) {
      return NextResponse.json(
        { error: 'userEmail required' },
        { status: 400 }
      );
    }

    const drive = await getServiceAccountDrive(userEmail);
    const files = await drive.listFiles({ maxResults: 10 });

    return NextResponse.json({
      success: true,
      files: files.files.map(f => ({
        id: f.id,
        name: f.name,
        type: f.mimeType
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Drive API failed' },
      { status: 500 }
    );
  }
}
```

---

## Tips

1. **Use pagination** for large result sets (>100 files)
2. **Filter early** with Drive queries instead of filtering in code
3. **Request only needed fields** to reduce bandwidth
4. **Cache content** to avoid repeated API calls
5. **Respect rate limits** - the service has built-in 100ms delays
6. **Check file size** before extracting content to avoid memory issues
7. **Use incremental sync** for efficient change tracking

---

## Related Documentation

- [Full Implementation Guide](./google-drive-implementation.md)
- [Gmail Integration](./gmail-integration.md)
- [Google Drive API v3 Reference](https://developers.google.com/drive/api/v3/reference)
