# Manual E2E Testing Plan for File Attachments

## Prerequisites Setup

### 1. Environment Configuration

**Required Environment Variables** (in `.env.local` or `.env.production.local`):
```bash
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=<your_bot_token>
GOOGLE_OAUTH_CLIENT_ID=<your_client_id>
GOOGLE_OAUTH_CLIENT_SECRET=<your_client_secret>
NEXTAUTH_URL=http://localhost:3000  # or your deployment URL
NEXTAUTH_SECRET=<your_secret>
```

**Verify Database**:
```bash
# Ensure file_attachments table exists
npx tsx scripts/verify-file-attachments-table.ts
```

Expected output:
```
✅ Table exists: file_attachments
✅ All required columns present
✅ All required indexes present
✅ Migration verification complete!
```

### 2. User Account Setup

**Create Test User Account**:
1. Sign up at `https://izzie.ai` (or your deployment URL)
2. Complete email verification
3. Connect Google account with Drive access
4. Note your user ID from database or profile page

**Link Telegram Account**:
1. Go to `https://izzie.ai/settings`
2. Click "Link Telegram Account"
3. Copy the linking code
4. Send code to your Telegram bot
5. Verify link confirmation message

**Verify Setup**:
```sql
-- Check user exists and has Google tokens
SELECT id, email, name
FROM users
WHERE email = 'your-test-email@example.com';

-- Check Telegram link exists
SELECT user_id, telegram_chat_id, linked_at
FROM telegram_links
WHERE user_id = '<your_user_id>';

-- Check Google account connected
SELECT * FROM accounts
WHERE user_id = '<your_user_id>'
AND provider = 'google';
```

### 3. Start Development Server

```bash
npm run dev
```

Server should start on `http://localhost:3000`

### 4. Test Files Preparation

Create test files in a temporary directory:

```bash
mkdir /tmp/file-attachments-test
cd /tmp/file-attachments-test

# Create valid test files
echo "Test PDF content" > test-document.pdf
echo "Test text" > test-document.txt
curl -o test-image.jpg https://via.placeholder.com/150

# Create blocked file type
echo "malware" > malware.exe

# Create large file (60MB - exceeds 50MB limit)
dd if=/dev/zero of=large-file.bin bs=1M count=60
```

---

## Test Scenarios

### ✅ Test 1: Basic Document Upload (Inbound: Telegram → Drive)

**Objective**: Verify PDF file uploads successfully from Telegram to Google Drive

**Setup**: Have test-document.pdf ready

**Steps**:
1. Open Telegram and navigate to your bot chat
2. Upload `test-document.pdf` by clicking attachment → File
3. Wait for bot response (should be within 5-10 seconds)

**Expected Results**:
- ✅ Bot sends: "⏳ Uploading file to Google Drive..."
- ✅ Bot sends: "✅ File uploaded successfully! 📎 test-document.pdf 🔗 [Drive link]"
- ✅ Click Drive link and verify file opens
- ✅ File appears in `izzie/attachments/test-document.pdf` in your Google Drive
- ✅ File content matches original

**Database Verification**:
```sql
SELECT
  file_name,
  mime_type,
  file_size,
  status,
  drive_file_id,
  telegram_file_id,
  created_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - created_at)) as duration_seconds
FROM file_attachments
WHERE user_id = '<your_user_id>'
AND direction = 'inbound'
ORDER BY created_at DESC
LIMIT 1;
```

Expected database record:
- `file_name`: test-document.pdf
- `mime_type`: application/pdf
- `status`: completed
- `drive_file_id`: non-null
- `telegram_file_id`: non-null
- `duration_seconds`: < 10 seconds

**Pass Criteria**: All expected results met ✅

**If Failed**: Check logs, verify Drive permissions, confirm bot token is valid

---

### ✅ Test 2: Photo Upload (Inbound)

**Objective**: Verify photo uploads with auto-generated filename

**Setup**: Have test-image.jpg ready

**Steps**:
1. In Telegram bot chat, click attachment → Photo
2. Select `test-image.jpg`
3. Send photo (not as file)
4. Wait for bot response

**Expected Results**:
- ✅ Bot uploads photo successfully
- ✅ Filename auto-generated: `telegram_photo_<timestamp>.jpg`
- ✅ Photo appears in `izzie/attachments/` folder
- ✅ MIME type: `image/jpeg`

**Database Check**:
```sql
SELECT file_name, mime_type, file_size
FROM file_attachments
WHERE user_id = '<your_user_id>'
AND direction = 'inbound'
AND mime_type LIKE 'image/%'
ORDER BY created_at DESC
LIMIT 1;
```

**Pass Criteria**: Photo uploaded with auto-generated name ✅

---

### ✅ Test 3: Blocked File Type (.exe)

**Objective**: Verify security validation rejects executable files

**Setup**: Have malware.exe ready

**Steps**:
1. Try to upload `malware.exe` to Telegram bot
2. Observe bot response

**Expected Results**:
- ❌ Bot responds: "❌ File type not supported: .exe files are blocked for security reasons."
- ❌ NO file uploaded to Google Drive
- ❌ Database record shows status: `failed`
- ❌ Error message recorded in `error_message` column

**Database Check**:
```sql
SELECT file_name, status, error_message
FROM file_attachments
WHERE user_id = '<your_user_id>'
AND file_name LIKE '%.exe'
ORDER BY created_at DESC
LIMIT 1;
```

Expected:
- `status`: failed
- `error_message`: contains "blocked for security"

**Also Test These Extensions**:
- .bat, .cmd, .sh (shell scripts)
- .scr, .vbs (Windows scripts)
- .jar (Java archives)
- .js (JavaScript - might be legitimate, check if blocked)

**Pass Criteria**: All blocked extensions rejected ✅

---

### ✅ Test 4: File Too Large (Size Limit)

**Objective**: Verify 50MB size limit enforcement

**Setup**: Have large-file.bin (60MB) ready

**Steps**:
1. Try to upload 60MB file to Telegram bot
2. Observe response

**Expected Results**:
- ❌ Bot responds: "❌ File too large (60.00MB). Maximum size is 50MB."
- ❌ NO file uploaded to Google Drive
- ❌ Transfer fails before download starts

**Note**: Telegram itself has a 50MB limit for non-premium users, so the file might not even send. In that case, create a 49MB file and verify it succeeds, then try 51MB to verify rejection.

**Pass Criteria**: Size limit enforced correctly ✅

---

### ✅ Test 5: Rate Limiting (10 per hour)

**Objective**: Verify rate limit prevents 11th file upload within 1 hour

**Setup**: Prepare 11 small test files

**Steps**:
1. Upload 10 files successfully (use small text files for speed)
2. Verify all 10 succeed
3. Immediately try to upload 11th file
4. Observe rate limit message

**Expected Results**:
- ✅ First 10 files upload successfully
- ❌ 11th file rejected with: "⚠️ Rate limit exceeded. You can upload up to 10 files per hour. Remaining: 0. Please try again later."
- ⏱️ After 1 hour, quota resets (verify 11th file succeeds)

**Database Verification**:
```sql
-- Count uploads in last hour
SELECT COUNT(*) as recent_uploads
FROM file_attachments
WHERE user_id = '<your_user_id>'
  AND status = 'completed'
  AND completed_at > NOW() - INTERVAL '1 hour';
```

Should show: 10 (before reset), 0 (after 1 hour)

**Pass Criteria**: Rate limit enforced and resets after 1 hour ✅

---

### ✅ Test 6: Unlinked User Rejection

**Objective**: Verify only linked users can upload files

**Setup**: Create a new Telegram account (or use an unlinked test account)

**Steps**:
1. From unlinked Telegram account, send file to bot
2. Observe rejection message

**Expected Results**:
- ❌ Bot responds: "Your Telegram account isn't linked yet. Please visit izzie.ai/settings to get a linking code."
- ❌ NO file processing occurs
- ❌ No database record created

**Database Check**:
```sql
-- Should NOT find any records for this chat_id
SELECT * FROM file_attachments
WHERE telegram_chat_id = <unlinked_chat_id>;
```

Expected: 0 rows

**Pass Criteria**: Unlinked users rejected ✅

---

### ✅ Test 7: Missing Drive Permissions

**Objective**: Verify error when Google Drive not connected

**Setup**: Temporarily revoke Google Drive access for your account

**Steps**:
1. Go to Google Account → Security → Third-party apps
2. Revoke access for your app
3. Try to upload file via Telegram
4. Observe error message

**Expected Results**:
- ❌ Bot responds: "⚠️ Unable to upload file: Google Drive not connected. Please link your Google account at izzie.ai/settings."
- ❌ No file uploaded
- ❌ Status: `failed`

**Restore Access**:
After test, reconnect Google account at `/settings`

**Pass Criteria**: Drive connection validated ✅

---

### ✅ Test 8: Special Characters in Filename

**Objective**: Verify filename handling with special characters

**Setup**: Create file: `file (1) [test] & data.pdf`

**Steps**:
1. Upload file with special characters in name
2. Verify bot response and Drive upload

**Expected Results**:
- ✅ File uploads successfully
- ✅ Filename preserved: `file (1) [test] & data.pdf`
- ✅ Database stores correct filename
- ✅ File accessible in Drive with same name

**Database Check**:
```sql
SELECT file_name FROM file_attachments
WHERE user_id = '<your_user_id>'
AND file_name LIKE '%[%'
ORDER BY created_at DESC LIMIT 1;
```

**Pass Criteria**: Special characters handled correctly ✅

---

### ✅ Test 9: Concurrent Uploads

**Objective**: Verify multiple simultaneous uploads work independently

**Setup**: Prepare 3 small files

**Steps**:
1. Rapidly send 3 files to bot (within 1-2 seconds)
2. Observe all three process concurrently
3. Verify all succeed

**Expected Results**:
- ✅ All 3 files show "⏳ Uploading..." messages
- ✅ All 3 files upload to Drive successfully
- ✅ All 3 database records show `status: completed`
- ✅ No interference between transfers

**Database Check**:
```sql
SELECT file_name, status, created_at, completed_at
FROM file_attachments
WHERE user_id = '<your_user_id>'
AND created_at > NOW() - INTERVAL '1 minute'
ORDER BY created_at DESC;
```

Expected: 3 rows, all with `status: completed`

**Pass Criteria**: Concurrent transfers handled correctly ✅

---

### ✅ Test 10: Auto Folder Creation

**Objective**: Verify `izzie/attachments` folder created automatically

**Setup**: Delete `izzie/attachments` folder from Drive (if exists)

**Steps**:
1. Ensure `izzie/attachments` folder does NOT exist in Drive
2. Upload any file via Telegram
3. Check Google Drive

**Expected Results**:
- ✅ `izzie` folder created in Drive root (if not exists)
- ✅ `attachments` subfolder created inside `izzie/`
- ✅ File uploaded to `izzie/attachments/[filename]`
- ✅ Folder created before file upload
- ✅ Subsequent uploads use existing folder (no duplicates)

**Verification**:
Browse to Google Drive and confirm folder structure:
```
My Drive/
└── izzie/
    └── attachments/
        └── [uploaded files]
```

**Pass Criteria**: Folders created automatically ✅

---

## Outbound Testing (Drive → Telegram)

### ✅ Test 11: Retrieve File from Drive and Send to Telegram

**Objective**: Test outbound flow (user requests file from Drive)

**Setup**:
1. Upload a test file directly to Google Drive
2. Note the file ID

**Steps**:
1. Make API request to: `POST /api/files/[file_id]/send`
2. Request body:
   ```json
   {
     "userId": "<your_user_id>"
   }
   ```
3. Check Telegram for file delivery

**Expected Results**:
- ✅ File downloaded from Drive
- ✅ File sent to Telegram chat
- ✅ Database record created with `direction: outbound`
- ✅ File size validated (< 50MB)

**Database Check**:
```sql
SELECT * FROM file_attachments
WHERE user_id = '<your_user_id>'
AND direction = 'outbound'
ORDER BY created_at DESC
LIMIT 1;
```

**Pass Criteria**: Outbound transfer succeeds ✅

---

## Performance Testing

### Test 12: Upload Time Measurement

**Objective**: Measure average upload time for various file sizes

**Test Matrix**:
| File Size | Expected Time | Measured Time | Pass/Fail |
|-----------|---------------|---------------|-----------|
| 100 KB    | < 2 seconds   |               |           |
| 1 MB      | < 3 seconds   |               |           |
| 10 MB     | < 10 seconds  |               |           |
| 25 MB     | < 20 seconds  |               |           |
| 49 MB     | < 40 seconds  |               |           |

**Query for Measurements**:
```sql
SELECT
  file_size / 1024 / 1024 as size_mb,
  EXTRACT(EPOCH FROM (completed_at - created_at)) as duration_seconds
FROM file_attachments
WHERE user_id = '<your_user_id>'
AND status = 'completed'
ORDER BY created_at DESC;
```

**Pass Criteria**: All uploads complete within expected time ✅

---

## Database Health Checks

### After All Tests Complete

**1. Check for orphaned records**:
```sql
-- Pending/processing records older than 10 minutes
SELECT * FROM file_attachments
WHERE status IN ('pending', 'processing')
AND created_at < NOW() - INTERVAL '10 minutes';
```

Expected: 0 rows (all should complete or fail)

**2. Success rate**:
```sql
SELECT
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) as percentage
FROM file_attachments
GROUP BY status;
```

Expected:
- `completed`: > 90%
- `failed`: < 10%

**3. Average transfer time**:
```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_seconds,
  MIN(EXTRACT(EPOCH FROM (completed_at - created_at))) as min_seconds,
  MAX(EXTRACT(EPOCH FROM (completed_at - created_at))) as max_seconds
FROM file_attachments
WHERE status = 'completed'
AND completed_at IS NOT NULL;
```

Expected: avg < 10 seconds for typical files

---

## Test Report Template

```markdown
# File Attachments E2E Test Report

**Date**: YYYY-MM-DD
**Tester**: [Name]
**Environment**: [dev/staging/production]
**Server**: http://localhost:3000

## Test Results Summary

| Test ID | Test Name                  | Status | Duration | Notes        |
|---------|----------------------------|--------|----------|--------------|
| T1      | Basic PDF Upload           | ✅     | 3.2s     | Success      |
| T2      | Photo Upload               | ✅     | 2.8s     | Auto-named   |
| T3      | Blocked .exe               | ✅     | N/A      | Rejected     |
| T4      | 60MB File                  | ✅     | N/A      | Size limit   |
| T5      | Rate Limit (11th file)     | ✅     | N/A      | Blocked      |
| T6      | Unlinked User              | ✅     | N/A      | Rejected     |
| T7      | No Drive Access            | ✅     | N/A      | Error shown  |
| T8      | Special Characters         | ✅     | 3.5s     | Preserved    |
| T9      | Concurrent Uploads (3)     | ✅     | 4.1s     | All success  |
| T10     | Auto Folder Creation       | ✅     | N/A      | Created      |
| T11     | Outbound (Drive→Telegram)  | ⏳     | N/A      | Not tested   |
| T12     | Performance Benchmarks     | ⏳     | N/A      | Not tested   |

## Overall Results

- **Total Tests**: 12
- **Passed**: 10 ✅
- **Failed**: 0 ❌
- **Skipped**: 2 ⏳
- **Success Rate**: 83%

## Issues Found

1. [Issue description if any]

## Performance Metrics

- **Average Upload Time**: 3.4 seconds
- **Success Rate**: 95%
- **Rate Limit Effectiveness**: 100%

## Recommendations

1. [Any recommendations for improvements]
2. Complete outbound testing (Test 11)
3. Run performance benchmarks (Test 12)

## Sign-off

**Status**: ✅ PASS (with minor follow-ups)
**Ready for Production**: Yes / No
**Next Steps**: [List any remaining work]
```

---

## Troubleshooting Common Issues

### Issue: "Bot not responding"
**Cause**: `TELEGRAM_BOT_TOKEN` not set or webhook not configured
**Fix**:
```bash
# Check bot token
echo $TELEGRAM_BOT_TOKEN

# Restart server
npm run dev
```

### Issue: "Google Drive not connected"
**Cause**: OAuth tokens expired or missing scopes
**Fix**:
1. Go to `/settings`
2. Disconnect and reconnect Google account
3. Ensure Drive scope is requested

### Issue: "File not appearing in Drive"
**Cause**: Folder permissions or incorrect folder ID
**Debug**:
```typescript
// Check logs for folder ID
const folderService = createFileUploadService(oauth2Client);
const folderId = await folderService.getAttachmentsFolderId();
console.log('Folder ID:', folderId);
```

### Issue: "Rate limit not resetting"
**Cause**: Clock drift or timezone issues
**Debug**:
```sql
-- Check database timezone
SHOW timezone;

-- Check timestamps
SELECT NOW(), NOW() - INTERVAL '1 hour';
```

---

## Next Steps After Manual Testing

1. ✅ Complete all test scenarios (T1-T12)
2. ✅ Document any bugs found
3. ✅ Fix critical bugs
4. ✅ Re-test failed scenarios
5. ✅ Create monitoring dashboard
6. ✅ Set up alerts for failed transfers
7. ✅ Plan for production rollout

---

*Good luck with testing! 🚀*
