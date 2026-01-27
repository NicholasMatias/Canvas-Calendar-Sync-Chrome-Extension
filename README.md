# Canvas Exam Calendar Sync

Chrome extension that automatically extracts important dates (exams, assignments, projects, deadlines, etc.) from Canvas syllabi and adds them to your calendar.

## Features

- ✅ Scans all Canvas courses automatically
- ✅ Extracts important dates from both HTML and PDF syllabi
  - Exams, quizzes, tests, midterms, finals
  - Assignments, homework, projects, papers, essays
  - Presentations, demos, labs
  - Due dates, deadlines, submission dates
  - Other important academic dates
- ✅ Advanced date parsing using chrono library
- ✅ **Preview/Edit interface** - Review, edit, add, or delete dates before syncing
- ✅ Syncs to Google Calendar or exports as iCal for Apple Calendar
- ✅ Handles various date formats and naming conventions

## Setup

### 1. Install the Extension

1. Clone/download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select this folder
5. The extension icon should appear in your toolbar

### 2. Download Required Libraries

Run the download script to automatically fetch the required libraries:

```bash
node download-libs.js
```

Or manually download:

**Chrono (for date parsing - browser version):**
- Download from: https://cdn.jsdelivr.net/npm/chrono@2.7.0
- Save to: `libs/chrono.min.js`

**PDF.js (for PDF parsing):**
- Download from: https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js
- Save to: `libs/pdf.min.js`

Create a `libs` folder in the extension directory and place both files there.

**Note:** You may also need the PDF.js worker file:
- Download from: https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js
- Save to: `libs/pdf.worker.min.js`

### 3. Configure Google Calendar (Optional)

If you want to use Google Calendar sync:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Google Calendar API"
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Choose "Web application"
6. Add authorized redirect URI: `chrome-extension://YOUR_EXTENSION_ID`
7. Copy the Client ID
8. Edit `manifest.json` and add the `oauth2` section:

```json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/calendar"]
}
```

To find your extension ID: Go to `chrome://extensions/`, find the extension, and copy the ID shown.

### 4. Configure Settings

1. Click the extension icon → "Settings" (or right-click → Options)
2. Select your preferred calendar type
3. Choose whether to show preview/edit before syncing (recommended: enabled)
4. Click "Save Settings"

## Usage

1. Navigate to your Canvas website (e.g., `canvas.tamu.edu` or `https://your-school.instructure.com`)
2. Make sure you're logged in
3. Click the extension icon
4. Click **"1. Scan Canvas Courses"** - this will find all your active courses
   - Works from any Canvas page (dashboard, course page, etc.)
   - Uses Canvas API to get all your courses
5. Click **"2. Extract Important Dates"** - this will scan syllabi and extract dates
   - Automatically fetches each course's syllabus
   - Falls back to assignments/modules pages if syllabus unavailable
   - **You don't need to navigate to each course** - it fetches them automatically
6. **Review & Edit** (if preview is enabled):
   - Review all extracted exam dates
   - Click "Edit" to modify any exam (date, time, title, course, description)
   - Click "Delete" to remove exams you don't want
   - Click "+ Add Manual Exam" to add exams manually
7. Click **"3. Sync to Calendar"** - this will add them to your selected calendar

### For Google Calendar:
- You'll be prompted to authenticate on first use
- Events will be added directly to your primary calendar
- Includes reminders (1 day before and 1 hour before)

### For Apple Calendar:
- An `.ics` file will be downloaded
- Double-click the file to import into Apple Calendar (or any calendar app)
- Events include all exam information

## How It Works

1. **Course Scanning**: Uses Canvas API or DOM scraping to find all your courses
2. **Syllabus Fetching**: Accesses each course's syllabus page
3. **Content Extraction**: 
   - For HTML syllabi: Extracts text content
   - For PDF syllabi: Uses PDF.js to parse and extract text
4. **Date Parsing**: Uses chrono library to intelligently find dates in various formats
5. **Preview/Edit**: Shows all found important dates in an editable interface (if enabled)
6. **Calendar Sync**: Creates calendar events via Google Calendar API or iCal export

## Preview/Edit Feature

The preview feature (enabled by default) allows you to:
- **View** all extracted important dates in a clean interface
- **Edit** any date's details:
  - Course name
  - Event title (exam, assignment, project, etc.)
  - Date and time
  - Description
- **Delete** dates you don't want to sync
- **Add** manual date entries

You can disable this feature in Settings if you prefer to sync directly without review.

## Troubleshooting

**No courses found:**
- Make sure you're logged into Canvas
- Try refreshing the Canvas page
- Make sure you're on a Canvas page (instructure.com domain)

**No important dates found:**
- Some syllabi might not have dates listed in a recognizable format
- Check if the syllabus is accessible
- Try manually checking a course syllabus
- The date parsing might not recognize the format - try adding manually
- Make sure the syllabus contains date-related keywords (exam, assignment, due, deadline, etc.)

**Google Calendar sync fails:**
- Make sure OAuth is properly configured in manifest.json
- Check that Google Calendar API is enabled
- Try re-authenticating (the extension will prompt you)

**PDF parsing doesn't work:**
- Make sure PDF.js library is downloaded correctly
- Some PDFs might be image-based (scanned) and won't have extractable text
- Check browser console for errors

**Libraries not loading:**
- Make sure the `libs` folder exists and contains the required files
- Check that the files are named correctly
- Try reloading the extension

## Privacy

- All processing happens locally in your browser
- No data is sent to external servers (except Google Calendar API when syncing)
- Canvas API calls use your existing Canvas session
- Exam data is only stored temporarily in extension memory

## License

MIT

## Contributing

Feel free to submit issues or pull requests for improvements!
