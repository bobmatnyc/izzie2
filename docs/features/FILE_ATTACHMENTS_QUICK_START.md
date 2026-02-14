# File Attachments Quick Start

**Get started with file transfers in 60 seconds!** ⚡

---

## Prerequisites Checklist

Before you begin:
- [ ] Telegram account linked at [izzie.ai/settings](https://izzie.ai/settings)
- [ ] Google Drive connected at [izzie.ai/settings](https://izzie.ai/settings)

---

## Send Files to Izzie (30 seconds)

### 1. Open Telegram
Find your Izzie bot conversation

### 2. Send a File
Click 📎 → Choose file → Send

### 3. Wait for Confirmation
```
Izzie: ⏳ Uploading file to Google Drive...
Izzie: ✅ File uploaded successfully!
       📎 your-file.pdf (1.5 MB)
       🔗 https://drive.google.com/...
```

**Done!** Your file is in `Google Drive > izzie > attachments`

---

## Get Files from Drive (30 seconds)

### 1. Ask Izzie
```
You: Send me the Q4 report
```

### 2. Receive File
```
Izzie: 🔍 Found "Q4_Report_2024.pdf"
       [Sends file to Telegram]
```

### 3. Download
Tap the file in Telegram to view or download

**Done!** File delivered to your device

---

## What Files Can I Send?

### ✅ Supported
- Documents: PDF, Word, Excel, PowerPoint
- Images: JPEG, PNG, GIF, WebP
- Archives: ZIP, TAR, GZ
- Media: MP3, MP4, MOV (under 50MB)

### ❌ Blocked (Security)
- Executables: .exe, .bat, .sh, .app, .msi
- Scripts: .vbs, .js, .jar

---

## Limits

| Limit | Value | Why |
|-------|-------|-----|
| **Max file size** | 50 MB | Telegram Bot API limit |
| **Max files per hour** | 10 files | Prevent abuse |
| **Storage** | Your Drive quota | Files stored in your Drive |

---

## Common Issues

### "File too large"
**Solution:** Compress the file or upload directly to Drive

### "Rate limit exceeded"
**Solution:** Wait 1 hour for quota reset

### "Telegram not linked"
**Solution:** Go to [izzie.ai/settings](https://izzie.ai/settings) and link Telegram

### "Google Drive not connected"
**Solution:** Go to [izzie.ai/settings](https://izzie.ai/settings) and connect Drive

---

## Examples

### 📸 Upload Photo
```
You: [Send photo from camera]
Izzie: ✅ File uploaded successfully!
       📎 telegram_photo_1707945600000.jpg
```

### 📄 Request Document
```
You: Send me the contract from Acme
Izzie: [Sends: Acme_Contract.pdf]
```

### 📦 Upload Archive
```
You: [Send: project_files.zip]
Izzie: ✅ File uploaded successfully!
       📎 project_files.zip (12.3 MB)
```

---

## Tips

- **Rename files** before uploading for easier searching
- **Compress large files** to stay under the 50MB limit
- **Use natural language** to request files ("Send me that report from last week")
- **Click Drive links** in confirmations to open files directly

---

## Need More Help?

📖 **Full documentation:** [docs/features/FILE_ATTACHMENTS.md](/docs/features/FILE_ATTACHMENTS.md)

💬 **Support:** support@izzie.ai

🐛 **Report issues:** [github.com/izzie-ai/issues](https://github.com/izzie-ai/issues)

---

**You're all set! Start sharing files with Izzie now.** 🚀
