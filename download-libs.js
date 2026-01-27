#!/usr/bin/env node

/**
 * Script to download required libraries for Canvas Exam Calendar Sync extension
 * Run with: node download-libs.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const libsDir = path.join(__dirname, 'libs');

// Create libs directory if it doesn't exist
if (!fs.existsSync(libsDir)) {
  fs.mkdirSync(libsDir, { recursive: true });
  console.log('Created libs directory');
}

const libraries = [
  {
    name: 'pdf.min.js',
    url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    description: 'PDF.js library for PDF parsing',
    alternatives: [
      'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'
    ],
    required: true
  },
  {
    name: 'pdf.worker.min.js',
    url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    description: 'PDF.js worker file',
    alternatives: [
      'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    ],
    required: true
  }
  // Note: chrono-node is not included as it's a Node.js module
  // The extension uses built-in regex date parsing which works well for exam dates
];

function downloadFile(url, filepath, retries = 3) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    const makeRequest = (requestUrl) => {
      https.get(requestUrl, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        } else if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirects
          file.close();
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
          }
          downloadFile(response.headers.location, filepath, retries).then(resolve).catch(reject);
        } else {
          file.close();
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
          }
          reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        }
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        if (retries > 0 && err.code === 'ENOTFOUND') {
          // Retry on DNS errors
          setTimeout(() => {
            downloadFile(url, filepath, retries - 1).then(resolve).catch(reject);
          }, 1000);
        } else {
          reject(err);
        }
      });
    };
    
    makeRequest(url);
  });
}

async function downloadLibraries() {
  console.log('Downloading required libraries...\n');
  
  for (const lib of libraries) {
    const filepath = path.join(libsDir, lib.name);
    
    // Skip if file already exists
    if (fs.existsSync(filepath)) {
      console.log(`✓ ${lib.name} already exists, skipping...`);
      continue;
    }
    
    try {
      console.log(`Downloading ${lib.description}...`);
      let downloaded = false;
      const urlsToTry = [lib.url, ...(lib.alternatives || [])];
      
      for (const url of urlsToTry) {
        try {
          console.log(`  Trying: ${url}`);
          await downloadFile(url, filepath);
          const stats = fs.statSync(filepath);
          // Check if file has content (at least 1KB)
          if (stats.size > 1024) {
            console.log(`✓ Downloaded ${lib.name} from ${new URL(url).hostname} (${(stats.size / 1024).toFixed(2)} KB)\n`);
            downloaded = true;
            break;
          } else {
            // File too small, might be an error page
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }
        } catch (err) {
          console.log(`  Failed: ${err.message}`);
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
          }
          continue;
        }
      }
      
      if (!downloaded) {
        if (lib.required) {
          throw new Error(`Failed to download from all available sources`);
        } else {
          console.log(`⚠ Skipping optional library ${lib.name}`);
        }
      }
    } catch (error) {
      if (lib.required) {
        console.error(`✗ Failed to download ${lib.name}:`, error.message);
        console.error(`  Please check your internet connection and try again.`);
        console.error(`  You can also manually download the libraries - see libs/README.md`);
        process.exit(1);
      } else {
        console.log(`⚠ Optional library ${lib.name} failed to download, continuing...`);
      }
    }
  }
  
  console.log('All libraries downloaded successfully!');
  console.log(`Libraries are located in: ${libsDir}`);
}

// Run the download
downloadLibraries().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
