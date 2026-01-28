# Quick Setup Guide

## Step 1: Download Libraries

Run the download script:
```bash
node download-libs.js
```

This will automatically download:
- `libs/chrono.min.js` - For parsing dates from text (browser-compatible version)
- `libs/pdf.min.js` - For parsing PDF syllabi
- `libs/pdf.worker.min.js` - PDF.js worker file (required for PDF parsing)

## Step 2: Add Extension Icons (Optional)

Add icon files to the `icons/` folder:
- `icon16.png` (16x16)
- `icon48.png` (48x48)  
- `icon128.png` (128x128)

You can use placeholder images or create simple icons. The extension will work without them, but Chrome will show a default icon.

## Step 3: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this folder (`Agent-Experimentation`)
5. The extension should now appear in your extensions list

## Step 4: Configure Settings

1. Click the extension icon (or right-click → Options)
2. Choose your calendar type:
   - **Google Calendar**: Requires OAuth setup (see below)
   - **Apple Calendar**: Downloads .ics file (no setup needed)
3. Choose whether to show preview/edit (recommended: enabled)
4. Click "Save Settings"

## Step 5: Set Up Google Calendar (Optional)

If you chose Google Calendar:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. Enable "Google Calendar API"
4. Create OAuth 2.0 credentials:
   - Type: Web application
   - Authorized redirect URIs: `chrome-extension://YOUR_EXTENSION_ID`
5. Copy your Client ID
6. Edit `manifest.json` and add:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "scopes": ["https://www.googleapis.com/auth/calendar"]
   }
   ```
7. Reload the extension

## Step 6: Use the Extension

1. Navigate to your Canvas website
2. Make sure you're logged in
3. Click the extension icon
4. Follow the steps:
   - Scan Courses
   - Extract Exam Dates
   - Review & Edit (if enabled)
   - Sync to Calendar

## Troubleshooting

**Libraries not downloading?**
- Check your internet connection
- Try downloading manually from the URLs in `libs/README.md`

**Extension not loading?**
- Make sure all files are in the correct locations
- Check Chrome's extension error page for details
- Verify `manifest.json` is valid JSON

**Can't find courses?**
- Make sure you're on a Canvas page (instructure.com)
- Ensure you're logged into Canvas
- Try refreshing the Canvas page

**Dates not extracting?**
- Some syllabi might not have exam dates listed
- Check if the syllabus is accessible
