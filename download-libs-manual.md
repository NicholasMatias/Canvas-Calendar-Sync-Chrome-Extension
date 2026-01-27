# Manual Library Download Instructions

If the automatic download script fails, you can manually download the required libraries.

## Option 1: Use Browser-Compatible Date Parsing (Recommended)

Since `chrono-node` is a Node.js package, we'll use a simpler approach for the browser. The extension will use regex-based date parsing as a fallback, which works well for most exam date formats.

**You can skip downloading chrono.min.js** - the extension will work without it using built-in date parsing.

## Option 2: Download Libraries Manually

### PDF.js (Required)

1. **PDF.js Library:**
   - URL: https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js
   - Save to: `libs/pdf.min.js`

2. **PDF.js Worker (Required for PDF parsing):**
   - URL: https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js
   - Save to: `libs/pdf.worker.min.js`

### Chrono (Optional - for advanced date parsing)

If you want advanced date parsing, you can try:

1. **Option A: Use unpkg (serves main entry):**
   - URL: https://unpkg.com/chrono-node@2.9.0
   - Save to: `libs/chrono.min.js`
   - Note: This may require additional setup as it's a Node.js module

2. **Option B: Use a browser-compatible date library:**
   - Consider using a simpler date parsing approach (the extension includes fallback parsing)

## Quick Download Commands

If you have `curl` or `wget` available:

```bash
# Create libs directory
mkdir -p libs

# Download PDF.js
curl -L -o libs/pdf.min.js https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js

# Download PDF.js worker
curl -L -o libs/pdf.worker.min.js https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js
```

## Verification

After downloading, verify the files exist:
```bash
ls -lh libs/
```

You should see:
- `pdf.min.js` (should be ~300KB)
- `pdf.worker.min.js` (should be ~1MB)

The extension will work with just the PDF.js files. The date parsing will use built-in regex patterns which work well for most exam date formats.
