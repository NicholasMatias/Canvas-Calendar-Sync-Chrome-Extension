# Libraries Directory

This directory should contain the following JavaScript libraries:

## Required Libraries

1. **pdf.min.js** - PDF parsing library (REQUIRED)
   - Download from: https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js
   - Or run: `node download-libs.js`

2. **pdf.worker.min.js** - PDF.js worker file (REQUIRED for PDF parsing)
   - Download from: https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js
   - Or run: `node download-libs.js`

## Optional Libraries

**Note:** The extension works without chrono! It uses built-in regex-based date parsing which handles most exam date formats well.

If you want to try advanced date parsing (optional):
- The extension includes fallback regex date parsing that works for most exam date formats
- chrono-node is a Node.js module and doesn't work directly in browsers
- The extension will work fine without it

## Quick Setup

Run the download script:
```bash
node download-libs.js
```

This will download the required PDF.js libraries. The extension will work with just these files!
