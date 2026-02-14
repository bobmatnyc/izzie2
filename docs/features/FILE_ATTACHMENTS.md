# File Attachments User Guide

**Izzie now supports sending and receiving files through Telegram!** 🎉

---

## What is the File Attachments Feature?

File Attachments lets you seamlessly transfer files between your Google Drive and Telegram:

- **Send files to Izzie** via Telegram → Izzie saves them to your Google Drive
- **Request files from Google Drive** → Izzie sends them to you in Telegram

No more switching between apps or manually uploading/downloading files. Just chat with Izzie naturally!

---

## What Problems Does This Solve?

### Quick Mobile Uploads
Snap a photo of a receipt, document, or whiteboard on your phone, send it to Izzie, and instantly have it backed up in Google Drive with proper organization.

### Access Files On-the-Go
Need a file from your Drive while you're away from your computer? Just ask Izzie to send it to you in Telegram.

### Centralized File Management
All files shared with Izzie are automatically organized in your Google Drive in the `izzie/attachments` folder, making them easy to find later.

### Hands-Free File Sharing
Dictate a voice message asking for a file, and Izzie will send it right away—no typing or searching required.

---

## Getting Started

### Prerequisites

Before using file attachments, make sure you have:

1. ✅ **Telegram account linked** to Izzie
   - Go to [izzie.ai/settings](https://izzie.ai/settings)
   - Click "Link Telegram Account"
   - Send the linking code to your Izzie bot

2. ✅ **Google Drive connected** to Izzie
   - Go to [izzie.ai/settings](https://izzie.ai/settings)
   - Click "Connect Google Drive"
   - Authorize Drive access

### First-Time Setup

**No additional setup required!** Once your Telegram is linked and Google Drive is connected, you're ready to start sharing files.

---

## How to Send Files to Izzie (Inbound)

### Step 1: Open Telegram and Find Your Izzie Bot

Navigate to your Izzie bot conversation in Telegram.

### Step 2: Send a File

Click the attachment icon (📎) and choose:
- **Document** - PDFs, Word docs, Excel files, etc.
- **Photo** - Images from your camera or gallery
- **File** - Any supported file type

### Step 3: Wait for Confirmation

Izzie will respond with:
1. **"⏳ Uploading file to Google Drive..."** (upload started)
2. **"✅ File uploaded successfully! 📎 [filename] 🔗 [Drive link]"** (upload complete)

### Step 4: Access Your File

Click the Drive link in Izzie's message to open the file in Google Drive. Your file is automatically saved to `Google Drive > izzie > attachments > [your file]`.

### Example Flow

```
You: [Send photo: receipt.jpg]
Izzie: ⏳ Uploading file to Google Drive...
Izzie: ✅ File uploaded successfully!
       📎 receipt.jpg (1.2 MB)
       🔗 https://drive.google.com/file/d/abc123...
```

---

## How to Receive Files from Izzie (Outbound)

### Step 1: Ask Izzie for a File

Use natural language to request a file from your Google Drive:

**Examples:**
- "Send me the Q4 report"
- "Can you send the contract from last week?"
- "I need the presentation slides"
- "Send my expense receipts from January"

### Step 2: Izzie Searches Your Drive

Izzie will:
1. Search your Google Drive for the file
2. Download the file
3. Prepare it for transfer

### Step 3: Receive Your File

Izzie sends the file directly to your Telegram chat with a caption showing:
- 📎 Filename
- 📏 File size
- 🔗 Link to view in Drive

### Step 4: Download or View

Tap the file in Telegram to:
- View it inline (for images, PDFs)
- Download it to your device
- Share it with others

### Example Flow

```
You: Send me the budget spreadsheet
Izzie: 🔍 Found "2024_Budget.xlsx" in your Drive
       📎 Sending file...
       [File delivered: 2024_Budget.xlsx (450 KB)]
```

---

## Supported File Types

### Documents 📄
- **PDF** - Adobe PDF documents
- **Microsoft Office** - Word (.docx), Excel (.xlsx), PowerPoint (.pptx)
- **Google Workspace** - Docs, Sheets, Slides (exported as PDF)
- **Text** - Plain text files (.txt)
- **CSV** - Comma-separated values

### Images 🖼️
- **JPEG** - Photos and images
- **PNG** - Transparent images
- **GIF** - Animated images
- **WebP** - Modern image format
- **SVG** - Vector graphics

### Archives 📦
- **ZIP** - Compressed archives
- **TAR/GZ** - Unix archives

### Media 🎵
- **MP3/MP4** - Audio files
- **MP4/MOV** - Video files (under 50MB)

---

## Limitations & Restrictions

### File Size Limits

| Direction | Maximum Size | Reason |
|-----------|--------------|--------|
| **Sending to Izzie** (Telegram → Drive) | 50 MB | Telegram Bot API limit |
| **Receiving from Izzie** (Drive → Telegram) | 50 MB | Telegram Bot API limit |

**What if my file is too large?**
- Izzie will notify you: "❌ File too large (XX.XX MB). Maximum size is 50MB."
- Access the file directly from Google Drive instead
- Consider compressing the file or splitting it into smaller parts

### Rate Limits

**You can transfer up to 10 files per hour.**

Why? To prevent abuse and ensure service stability for all users.

**What happens if I exceed the limit?**
- Izzie will respond: "⚠️ Rate limit exceeded. You can upload up to 10 files per hour. Remaining: 0. Please try again later."
- Your quota resets after 1 hour
- No files are lost—just wait and retry

### Blocked File Types (Security)

For your protection, Izzie blocks potentially dangerous file types:

**Blocked Extensions:**
- `.exe`, `.bat`, `.cmd`, `.com` - Windows executables
- `.sh`, `.bash`, `.bin` - Unix executables
- `.scr`, `.vbs`, `.js` - Script files
- `.app`, `.deb`, `.rpm`, `.msi` - Installers
- `.jar` - Java archives

**Why are these blocked?**
These file types can contain malware or execute code on your computer. If you need to share these files, use Google Drive directly instead.

### Storage Quota

Files you upload to Izzie count against your **Google Drive storage quota**, not Izzie's. If you're running low on storage:
- Check your Drive quota at [google.com/drive/quota](https://google.com/drive/quota)
- Delete old files from the `izzie/attachments` folder
- Upgrade your Google Drive storage plan

---

## Examples & Use Cases

### 📸 Receipt Tracking
```
You: [Photo: receipt from lunch]
Izzie: ✅ File uploaded successfully!
       📎 telegram_photo_1707945600000.jpg
       🔗 https://drive.google.com/file/d/xyz...
```
**Use case:** Snap photos of receipts on-the-go and have them automatically backed up to Drive for expense reports.

---

### 📋 Contract Review
```
You: Send me the NDA from Acme Corp
Izzie: 🔍 Found "Acme_Corp_NDA.pdf" in your Drive
       [Sends file: Acme_Corp_NDA.pdf (1.5 MB)]
You: [Review and sign the PDF on mobile]
```
**Use case:** Access important documents while away from your desk.

---

### 📊 Quick Data Sharing
```
You: [Upload: sales_data.csv]
Izzie: ✅ File uploaded successfully!
       📎 sales_data.csv (250 KB)
You: Share this with the team in our sales channel
Izzie: [Shares Drive link with team]
```
**Use case:** Quickly share data files with your team through Izzie's integrations.

---

### 🎨 Creative Collaboration
```
You: [Upload: design_mockup_v3.png]
Izzie: ✅ File uploaded successfully!
       📎 design_mockup_v3.png (3.2 MB)
You: Add a task to review this design with Sarah
Izzie: ✅ Task created and added to your Google Tasks
```
**Use case:** Upload design files and immediately create follow-up tasks.

---

## Troubleshooting

### Problem: "File too large" error

**Symptom:** Izzie responds with "❌ File too large (XX.XX MB). Maximum size is 50MB."

**Solutions:**
1. **Compress the file** - Use a ZIP tool to reduce the file size
2. **Access from Drive** - Open the file directly in Google Drive instead
3. **Split the file** - Break large files into smaller parts
4. **Use Drive sharing** - Upload directly to Drive and share the link

---

### Problem: Rate limit reached

**Symptom:** "⚠️ Rate limit exceeded. You can upload up to 10 files per hour."

**Solutions:**
1. **Wait 1 hour** - Your quota resets automatically
2. **Prioritize urgent files** - Send only critical files first
3. **Batch uploads** - Upload multiple files together in a ZIP archive

---

### Problem: "File type not supported"

**Symptom:** "❌ File type not supported: .exe files are blocked for security reasons."

**Solutions:**
1. **Check the extension** - Ensure the file isn't an executable type
2. **Use Drive directly** - Upload executables directly to Drive (not through Izzie)
3. **Convert the file** - Use a different format (e.g., PDF instead of .docx)

---

### Problem: "Telegram not linked"

**Symptom:** "Your Telegram account isn't linked yet. Please visit izzie.ai/settings to get a linking code."

**Solutions:**
1. Go to [izzie.ai/settings](https://izzie.ai/settings)
2. Click "Link Telegram Account"
3. Copy the 6-digit linking code
4. Send the code to your Izzie bot
5. Wait for confirmation message

---

### Problem: "Google Drive not connected"

**Symptom:** "⚠️ Unable to upload file: Google Drive not connected. Please link your Google account at izzie.ai/settings."

**Solutions:**
1. Go to [izzie.ai/settings](https://izzie.ai/settings)
2. Click "Connect Google Drive"
3. Authorize Drive access
4. Grant permissions for Drive files
5. Try uploading again

---

### Problem: Upload takes too long

**Symptom:** File upload seems stuck or takes more than 30 seconds

**Possible Causes:**
- Slow internet connection
- Large file size (approaching 50MB limit)
- Drive API temporarily slow

**Solutions:**
1. **Check your connection** - Ensure you have stable internet
2. **Retry** - Cancel and send the file again
3. **Use smaller files** - Compress or reduce file size
4. **Wait a few minutes** - Try again if Drive API is slow

---

### Problem: File not appearing in Drive

**Symptom:** Izzie says file uploaded, but you can't find it in Drive

**Solutions:**
1. **Check the folder** - Look in `Google Drive > izzie > attachments`
2. **Search by name** - Use Drive's search bar to find the file
3. **Check Drive permissions** - Ensure Drive access is still connected
4. **Wait a moment** - Sometimes Drive indexing takes a few seconds
5. **Click the link** - Use the Drive link in Izzie's confirmation message

---

## Privacy & Security

### Where Are Files Stored?

**All files are stored in YOUR Google Drive**, not on Izzie's servers.

- Files are uploaded to `Google Drive > izzie > attachments`
- You retain full ownership of your files
- You can delete files at any time
- Files count against your Drive quota, not Izzie's

### Who Has Access to My Files?

**Only you have access to your files.**

- Izzie uses your Google OAuth tokens to access Drive
- Izzie cannot access files from other users
- File transfers are encrypted (TLS/SSL)
- Izzie does not store copies of your files

### How Are Files Validated?

**Izzie validates files for security:**

1. **File type checking** - Blocks dangerous extensions (.exe, .bat, etc.)
2. **Size validation** - Ensures files are under 50MB limit
3. **MIME type validation** - Verifies file format matches extension
4. **Rate limiting** - Prevents abuse (10 files per hour)

**Note:** Izzie does not currently scan files for viruses. If you're concerned about malware, scan files with your own antivirus software before opening them.

### How Do I Delete Files?

**You have full control over your files:**

1. **Delete from Drive** - Go to `izzie > attachments` and delete any file
2. **Delete from Telegram** - Deleting in Telegram doesn't affect Drive storage
3. **Empty Drive trash** - Permanently delete files from Drive's trash

---

## Tips & Best Practices

### 📌 Organize Your Files

Create subfolders inside `izzie/attachments` to organize different types of files:
- `izzie/attachments/receipts`
- `izzie/attachments/contracts`
- `izzie/attachments/photos`

### 📌 Use Descriptive Filenames

Rename files before uploading to make them easier to find later:
- ✅ `2024_Q1_Expense_Report.pdf`
- ❌ `IMG_1234.jpg`

### 📌 Compress Large Files

If a file is close to the 50MB limit, compress it first:
```bash
# On Mac/Linux
zip -r archive.zip large_file.pdf

# On Windows
# Right-click → Send to → Compressed (zipped) folder
```

### 📌 Batch Similar Files

Upload multiple related files together in a ZIP archive to save time and rate limit quota.

### 📌 Link Important Files to Tasks

After uploading a file, create a task or reminder to follow up:
```
You: [Upload: contract.pdf]
Izzie: ✅ File uploaded successfully!
You: Remind me to review this contract tomorrow at 10 AM
Izzie: ✅ Reminder set for tomorrow at 10:00 AM
```

### 📌 Use Natural Language

You can request files conversationally:
- "Send me that report from last week"
- "I need the presentation I worked on yesterday"
- "Find the budget spreadsheet Sarah shared"

---

## FAQ

### Can I upload files from my computer to Drive through Izzie?

**Not directly.** Izzie only supports file uploads via Telegram. If you're on your computer, upload files directly to Google Drive.

### Can I send files to other people through Izzie?

**Not yet.** File attachments currently only support personal transfers (you ↔ Izzie ↔ Google Drive). Sharing with others is a planned future feature.

### What happens if I delete a file from Drive after uploading it?

The file is permanently deleted from your Drive. Telegram messages with the file remain, but the Drive link will return a 404 error.

### Can I upload files to specific folders in Drive?

**Not yet.** All files go to `izzie/attachments` automatically. You can manually move them to other folders in Drive after uploading.

### Does Izzie support voice messages or videos?

**Yes!** Voice messages and videos under 50MB are supported. They'll be saved to your Drive just like other files.

### Can I download files from Dropbox or OneDrive?

**Not yet.** Only Google Drive is currently supported. Multi-cloud support is planned for the future.

### How do I know if a file uploaded successfully?

Izzie will send a confirmation message with:
- ✅ Success indicator
- 📎 Filename and size
- 🔗 Direct link to the file in Drive

If the upload fails, you'll see an error message explaining what went wrong.

### Can I upload files while offline?

**No.** Both you and Izzie need internet connectivity to transfer files. Telegram will queue your message, but the upload won't complete until you're back online.

---

## What's Next?

### Planned Features (Coming Soon)

- **Folder selection** - Upload to specific Drive folders
- **Batch operations** - Send multiple files at once
- **File previews** - See thumbnails before downloading
- **Smart organization** - Auto-tagging and sorting based on content
- **Multi-cloud support** - Dropbox, OneDrive, and more
- **Virus scanning** - Automatic malware detection
- **File sharing** - Send files to teammates through Izzie

### Have Feedback?

We'd love to hear how you're using file attachments! Contact us at:
- **Email:** support@izzie.ai
- **Telegram:** Send feedback to your Izzie bot
- **GitHub:** [github.com/izzie-ai/issues](https://github.com/izzie-ai/issues)

---

## Quick Reference

### Common Commands

| What You Say | What Izzie Does |
|--------------|-----------------|
| [Send any file] | Uploads to Drive in `izzie/attachments` |
| "Send me [filename]" | Searches Drive and sends file to Telegram |
| "Show my recent uploads" | Lists recently uploaded files |
| "Delete [filename]" | Deletes file from Drive |

### File Size Limits

- **Telegram → Drive:** 50 MB max
- **Drive → Telegram:** 50 MB max

### Rate Limits

- **10 files per hour** per user
- Resets every hour on a rolling basis

### Storage Location

- All files stored in: `Google Drive > izzie > attachments`

### Blocked File Types

- `.exe`, `.bat`, `.sh`, `.app`, `.msi`, `.deb`, `.rpm`, `.scr`, `.vbs`, `.js`, `.jar`

---

**Ready to start sharing files? Open Telegram and send your first file to Izzie!** 🚀

---

*Last updated: 2026-02-14*
*Feature version: 1.0*

🤖 *Generated with Claude Code*
