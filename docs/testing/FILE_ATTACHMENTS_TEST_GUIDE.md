# File Attachments Testing Guide

## Quick Start Testing

### Prerequisites
1. **Database Migration**:
   ```bash
   npm run db:migrate
   ```

2. **Environment Variables** (`.env.local`):
   ```env
   TELEGRAM_BOT_TOKEN=<your_token>
   GOOGLE_OAUTH_CLIENT_ID=<your_client_id>
   GOOGLE_OAUTH_CLIENT_SECRET=<your_client_secret>
   DATABASE_URL=<your_postgres_url>
   ```

3. **Telegram Account**:
   - Must be linked at `izzie.ai/settings`
   - Must have Google Drive connected

---

## Manual Test Scenarios

### Test 1: Basic Document Upload (PDF)
**Objective**: Verify PDF upload to Drive

**Steps**:
1. Open Telegram and find your Izzie bot
2. Send a PDF file (under 50MB)
3. Wait for bot response

**Expected Results**:
- ✅ Bot responds: "⏳ Uploading file to Google Drive..."
- ✅ Bot responds: "✅ File uploaded successfully! 📎 [filename] 🔗 [Drive link]"
- ✅ File appears in Google Drive at: `izzie/attachments/[filename].pdf`
- ✅ Database record created with status `completed`

**How to Verify in Database**:
```sql
SELECT * FROM file_attachments
WHERE direction = 'inbound'
ORDER BY created_at DESC
LIMIT 1;
```

---

### Test 2: Photo Upload
**Objective**: Verify photo upload with auto-filename generation

**Steps**:
1. Send a photo to Izzie bot
2. Wait for response

**Expected Results**:
- ✅ Bot responds with upload confirmation
- ✅ File appears in Drive with name like: `telegram_photo_1707945600000.jpg`
- ✅ Database record shows MIME type `image/jpeg`

---

### Test 3: Blocked File Type (.exe)
**Objective**: Verify security validation rejects executables

**Steps**:
1. Try to send a file with blocked extension (.exe, .bat, .sh)

**Expected Results**:
- ❌ Bot responds: "❌ File type not supported: .exe files are blocked for security reasons."
- ❌ No file uploaded to Drive
- ❌ Database record shows status `failed` with error message

**Other blocked extensions to test**:
`.bat`, `.cmd`, `.sh`, `.app`, `.deb`, `.msi`, `.scr`, `.vbs`, `.js`, `.jar`

---

### Test 4: File Too Large
**Objective**: Verify size limit enforcement

**Steps**:
1. Send a file larger than 50MB

**Expected Results**:
- ❌ Bot responds: "❌ File too large (XX.XXMB). Maximum size is 50MB."
- ❌ No file uploaded to Drive

---

### Test 5: Rate Limiting
**Objective**: Verify 10 transfers per hour limit

**Steps**:
1. Send 10 files successfully
2. Try to send 11th file within the same hour

**Expected Results**:
- ✅ First 10 files upload successfully
- ❌ 11th file rejected with: "⚠️ Rate limit exceeded. You can upload up to 10 files per hour. Remaining: 0. Please try again later."
- ⏱️ After 1 hour, rate limit resets

**How to Check Rate Limit Status**:
```sql
SELECT COUNT(*)
FROM file_attachments
WHERE user_id = '<user_id>'
  AND status = 'completed'
  AND completed_at > NOW() - INTERVAL '1 hour';
```

---

### Test 6: Unlinked User
**Objective**: Verify only linked users can upload

**Steps**:
1. Create a new Telegram account (not linked to Izzie)
2. Try to send a file to the bot

**Expected Results**:
- ❌ Bot responds: "Your Telegram account isn't linked yet. Please visit izzie.ai/settings to get a linking code."
- ❌ No file processing occurs

---

### Test 7: Missing Drive Permissions
**Objective**: Verify error handling when Drive not connected

**Steps**:
1. Revoke Google Drive access for your account
2. Try to send a file

**Expected Results**:
- ❌ Bot responds: "⚠️ Unable to upload file: Google Drive not connected. Please link your Google account at izzie.ai/settings."
- ❌ No file uploaded

---

### Test 8: Special Characters in Filename
**Objective**: Verify filename handling

**Steps**:
1. Send a file with special characters: `file (1) [test].pdf`

**Expected Results**:
- ✅ File uploads successfully
- ✅ Filename preserved correctly in Drive
- ✅ Database stores correct filename

---

### Test 9: Concurrent Uploads
**Objective**: Verify multiple simultaneous uploads

**Steps**:
1. Send 3 files rapidly (within 1-2 seconds)

**Expected Results**:
- ✅ All 3 files process independently
- ✅ All 3 files appear in Drive
- ✅ All 3 database records show `completed`

---

### Test 10: Drive Folder Creation
**Objective**: Verify automatic folder creation

**Steps**:
1. Delete `izzie/attachments` folder from Drive (if exists)
2. Send a file

**Expected Results**:
- ✅ Bot creates `izzie` folder in Drive root
- ✅ Bot creates `attachments` subfolder
- ✅ File uploads to `izzie/attachments/`

---

## Database Verification Queries

### Check Recent Uploads
```sql
SELECT
  id,
  user_id,
  file_name,
  file_size / 1024 / 1024 AS size_mb,
  status,
  created_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - created_at)) AS duration_seconds
FROM file_attachments
WHERE direction = 'inbound'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Failed Uploads
```sql
SELECT
  id,
  file_name,
  error_message,
  created_at
FROM file_attachments
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### Check User Upload Count (Last Hour)
```sql
SELECT
  user_id,
  COUNT(*) AS uploads,
  SUM(file_size) / 1024 / 1024 AS total_mb
FROM file_attachments
WHERE
  direction = 'inbound'
  AND status = 'completed'
  AND completed_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id;
```

### Check Average Upload Time
```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) AS avg_seconds,
  MIN(EXTRACT(EPOCH FROM (completed_at - created_at))) AS min_seconds,
  MAX(EXTRACT(EPOCH FROM (completed_at - created_at))) AS max_seconds
FROM file_attachments
WHERE
  status = 'completed'
  AND direction = 'inbound'
  AND completed_at IS NOT NULL;
```

---

## Common Issues & Troubleshooting

### Issue 1: "Bot not configured" error
**Cause**: `TELEGRAM_BOT_TOKEN` not set or incorrect

**Fix**:
```bash
# Check environment variable
echo $TELEGRAM_BOT_TOKEN

# Restart server with correct token
npm run dev
```

---

### Issue 2: "Google Drive not connected" error
**Cause**: OAuth tokens expired or not present

**Fix**:
1. Go to `izzie.ai/settings`
2. Disconnect and reconnect Google account
3. Verify token refresh works

---

### Issue 3: Files not appearing in Drive
**Cause**: Folder permissions or incorrect folder ID

**Debug**:
```typescript
// Check folder ID in service logs
const folderService = createFileUploadService(oauth2Client);
const folderId = await folderService.getAttachmentsFolderId();
console.log('Attachments folder ID:', folderId);
```

---

### Issue 4: Rate limit not working
**Cause**: Clock drift or database timezone issues

**Debug**:
```sql
-- Check database timezone
SHOW timezone;

-- Check recent uploads with timestamps
SELECT
  created_at,
  completed_at,
  NOW() - completed_at AS time_since
FROM file_attachments
WHERE user_id = '<user_id>'
ORDER BY created_at DESC;
```

---

## Performance Testing

### Load Test: Sequential Uploads
```bash
# Send 100 files sequentially
for i in {1..100}; do
  echo "Upload $i"
  # Use Telegram API or bot to send file
  sleep 5  # 5 seconds between uploads
done
```

**Monitor**:
- Database query performance
- Memory usage (file buffers)
- Network bandwidth
- Error rate

---

### Load Test: Concurrent Uploads
```bash
# Send 10 files concurrently
for i in {1..10}; do
  # Use Telegram API to send file
  (send_file_to_bot) &
done
wait
```

**Monitor**:
- Database connection pool usage
- Rate limit enforcement
- Transfer success rate
- Average upload time

---

## Automated Testing

### Unit Tests (Future)
```typescript
// Example test structure
describe('TelegramFileService', () => {
  it('should download file from Telegram', async () => {
    const service = getTelegramFileService();
    const buffer = await service.downloadFile('ABC123');
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('should reject file larger than 50MB', () => {
    const service = getTelegramFileService();
    const result = service.validateFileSize(60 * 1024 * 1024);
    expect(result.valid).toBe(false);
  });
});
```

---

## Test Report Template

```markdown
## Test Report: File Attachments Feature
**Date**: YYYY-MM-DD
**Tester**: [Name]
**Environment**: [dev/staging/production]

### Test Results
| Test ID | Test Name | Status | Notes |
|---------|-----------|--------|-------|
| T1 | PDF Upload | ✅ | File uploaded in 3.2s |
| T2 | Photo Upload | ✅ | Auto-filename worked |
| T3 | Blocked .exe | ✅ | Correctly rejected |
| T4 | 60MB File | ✅ | Size limit enforced |
| T5 | Rate Limit | ✅ | 11th file rejected |
| T6 | Unlinked User | ✅ | Access denied |
| T7 | No Drive | ✅ | Error message shown |
| T8 | Special Chars | ✅ | Filename preserved |
| T9 | Concurrent | ✅ | All 3 files uploaded |
| T10 | Folder Creation | ✅ | Folders auto-created |

### Issues Found
1. [Description of any issues]

### Performance Metrics
- Average upload time: X seconds
- Success rate: XX%
- Rate limit effectiveness: XX%

### Recommendations
1. [Any recommendations]
```

---

## Next Steps

After completing manual tests:
1. ✅ Mark all test scenarios as passed
2. ✅ Document any issues found
3. ✅ Run performance tests
4. ✅ Update task #10 in project tracker
5. ✅ Move to Phase 2 (outbound transfers) if ready
