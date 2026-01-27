// Content script that runs on Canvas pages
// Uses PDF.js for PDF handling and regex for date parsing (chrono is optional)

// Prevent multiple script execution
if (window.canvasDateExtractorInitialized) {
  // Script already loaded, exit early
  console.log('[Canvas Extractor] Script already initialized');
} else {
  window.canvasDateExtractorInitialized = true;
  
  // Declare variables (chrono is optional, we have regex fallback)
  var chrono = null;
  var pdfjsLib = null;

  // Initialize PDF.js library (required for PDF parsing)
  function initPDFjs() {
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      pdfjsLib = window.pdfjsLib;
      return true;
    }
    
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('libs/pdf.min.js');
      script.onload = () => {
        pdfjsLib = window.pdfjsLib;
        window._canvasPdfjsLib = pdfjsLib;
      };
      document.head.appendChild(script);
      return false;
    } catch (e) {
      console.error('Failed to load PDF.js:', e);
      return false;
    }
  }

  // Initialize PDF.js (chrono is optional - we use regex fallback)
  initPDFjs();
  
  // Store for reuse
  window._canvasPdfjsLib = pdfjsLib;
}

// Access variables (use existing if script was already loaded)
var chrono = window.chrono || null; // Optional - regex fallback works fine
var pdfjsLib = window._canvasPdfjsLib || window.pdfjsLib || null;

// Helper function to detect if we're on a Canvas page
function isCanvasInstance() {
  // Check for Canvas-specific elements/APIs
  // Method 1: Check for Canvas API endpoint
  if (window.location.pathname.includes('/api/v1/')) return true;
  
  // Method 2: Check for Canvas-specific DOM elements
  if (document.querySelector('[class*="ic-app"], [id*="application"], [data-reactid]')) return true;
  
  // Method 3: Check for Canvas in page title or meta tags
  const title = document.title.toLowerCase();
  if (title.includes('canvas') || document.querySelector('meta[name*="canvas"]')) return true;
  
  // Method 4: Check URL patterns
  const url = window.location.href.toLowerCase();
  if (url.includes('instructure.com') || /^https:\/\/canvas\./.test(url)) return true;
  
  return false;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Validate we're on a Canvas page
  if (!isCanvasInstance()) {
    sendResponse({ success: false, error: 'Not on a Canvas page' });
    return true;
  }
  
  if (request.action === 'scanCourses') {
    scanCourses().then(courses => {
      sendResponse({ success: true, courses });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async
  }
  
  if (request.action === 'extractImportantDates') {
    extractImportantDates(request.courses).then(importantDates => {
      sendResponse({ success: true, importantDates });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async
  }
});

async function scanCourses() {
  const courses = [];
  
  try {
    // Try Canvas API first
    const apiUrl = `${window.location.origin}/api/v1/users/self/courses?enrollment_state=active&per_page=100`;
    const response = await fetch(apiUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const apiCourses = await response.json();
      apiCourses.forEach(course => {
        courses.push({
          id: course.id,
          name: course.name || course.course_code || 'Unnamed Course',
          url: `${window.location.origin}/courses/${course.id}`
        });
      });
      console.log(`Found ${courses.length} courses via API`);
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (error) {
    console.log('API method failed, trying DOM scraping:', error.message);
    
    // Fallback: DOM scraping
    const courseLinks = document.querySelectorAll('a[href*="/courses/"]');
    const seen = new Set();
    
    courseLinks.forEach(link => {
      const href = link.href;
      const match = href.match(/\/courses\/(\d+)/);
      if (match) {
        const courseId = match[1];
        if (!seen.has(courseId)) {
          seen.add(courseId);
          const courseName = link.textContent.trim() || link.querySelector('.course-name')?.textContent?.trim() || 'Unnamed Course';
          courses.push({
            id: courseId,
            name: courseName,
            url: window.location.href.split('/').slice(0, -1).join('/')
          });
        }
      }
    });
  }
  
  console.log(`Found ${courses.length} courses total`);
  return courses;
}

async function extractImportantDates(courses) {
  const importantDates = [];
  
  // Wait a bit for libraries to load if needed
  let attempts = 0;
  while ((!chrono || !pdfjsLib) && attempts < 10) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  for (const course of courses) {
    try {
      console.log(`Processing course: ${course.name}`);
      
      // Method 1: Try to get assignments directly from Canvas API (most reliable)
      try {
        const assignmentDates = await fetchAssignmentsFromAPI(course);
        if (assignmentDates && assignmentDates.length > 0) {
          importantDates.push(...assignmentDates);
          console.log(`✓ Found ${assignmentDates.length} assignment dates via API for ${course.name}`);
        } else {
          console.log(`  No assignment dates found via API for ${course.name}`);
        }
      } catch (apiError) {
        console.error(`  Error fetching assignments API for ${course.name}:`, apiError);
      }
      
      // Method 2: Try to get syllabus content
      const syllabusData = await fetchSyllabus(course);
      
      if (syllabusData) {
        console.log(`Processing content from ${course.name} (source: ${syllabusData.source || 'syllabus'})`);
        const dates = findImportantDates(syllabusData.text, course.name, syllabusData.isPDF);
        importantDates.push(...dates);
        console.log(`Found ${dates.length} important dates from syllabus in ${course.name}`);
        
        // Debug: log a sample of the text if no dates found
        if (dates.length === 0 && syllabusData.text.length > 100) {
          console.log(`Sample text from ${course.name}:`, syllabusData.text.substring(0, 500));
        }
      } else {
        console.log(`No accessible content found for ${course.name} (tried syllabus, assignments, modules)`);
      }
    } catch (error) {
      console.error(`Error processing ${course.name}:`, error);
    }
  }
  
  // Remove duplicates and sort by date
  const uniqueDates = removeDuplicates(importantDates);
  return uniqueDates.sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function fetchAssignmentsFromAPI(course) {
  try {
    const apiUrl = `${window.location.origin}/api/v1/courses/${course.id}/assignments?per_page=100`;
    console.log(`[API] Fetching assignments for ${course.name}: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const assignments = await response.json();
      const dates = [];
      
      console.log(`[API] Found ${assignments.length} assignments for ${course.name}`);
      
      if (assignments.length === 0) {
        console.log(`[API] No assignments found for ${course.name}`);
        return [];
      }
      
      // Fetch submission status for all assignments to check if they're completed
      let submissionsMap = {};
      try {
        const submissionsUrl = `${window.location.origin}/api/v1/courses/${course.id}/students/submissions?student_ids[]=self&per_page=100`;
        const submissionsResponse = await fetch(submissionsUrl, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        
        if (submissionsResponse.ok) {
          const submissions = await submissionsResponse.json();
          submissions.forEach(sub => {
            // Mark as completed if submitted (workflow_state can be 'submitted', 'graded', 'pending_review')
            if (sub.workflow_state === 'submitted' || sub.workflow_state === 'graded' || sub.workflow_state === 'pending_review') {
              submissionsMap[sub.assignment_id] = true;
            }
          });
          console.log(`[API] Found ${Object.keys(submissionsMap).length} completed assignments for ${course.name}`);
        }
      } catch (subError) {
        console.log(`[API] Could not fetch submission status (this is okay):`, subError.message);
      }
      
      assignments.forEach((assignment, index) => {
        // Skip if assignment is already completed/submitted
        if (submissionsMap[assignment.id]) {
          console.log(`[API]   ⊗ Skipping completed assignment: "${assignment.name}"`);
          return;
        }
        
        // Get due date (most important)
        if (assignment.due_at) {
          const dueDate = new Date(assignment.due_at);
          // Only add if date is valid
          if (!isNaN(dueDate.getTime())) {
            dates.push({
              course: course.name,
              date: dueDate.toISOString(),
              title: assignment.name || 'Assignment',
              description: assignment.description ? assignment.description.substring(0, 200) : (assignment.name || 'Assignment due date'),
              rawText: `Assignment: ${assignment.name} due: ${assignment.due_at}`,
              assignmentId: assignment.id, // Store assignment ID for tracking
              courseId: course.id
            });
            console.log(`[API]   ✓ Due date: "${assignment.name}" on ${dueDate.toLocaleDateString()}`);
          } else {
            console.log(`[API]   ✗ Invalid date for "${assignment.name}": ${assignment.due_at}`);
          }
        } else {
          console.log(`[API]   - No due date for "${assignment.name}"`);
        }
        
        // Get lock/unlock dates if available (less common but useful)
        if (assignment.unlock_at) {
          const unlockDate = new Date(assignment.unlock_at);
          if (!isNaN(unlockDate.getTime())) {
            dates.push({
              course: course.name,
              date: unlockDate.toISOString(),
              title: `${assignment.name || 'Assignment'} - Available`,
              description: `Assignment becomes available`,
              rawText: `Assignment available: ${assignment.unlock_at}`,
              assignmentId: assignment.id,
              courseId: course.id
            });
          }
        }
        
        if (assignment.lock_at) {
          const lockDate = new Date(assignment.lock_at);
          if (!isNaN(lockDate.getTime())) {
            dates.push({
              course: course.name,
              date: lockDate.toISOString(),
              title: `${assignment.name || 'Assignment'} - Locked`,
              description: `Assignment locks`,
              rawText: `Assignment locks: ${assignment.lock_at}`,
              assignmentId: assignment.id,
              courseId: course.id
            });
          }
        }
      });
      
      console.log(`[API] Extracted ${dates.length} dates from ${assignments.length} assignments for ${course.name} (filtered ${Object.keys(submissionsMap).length} completed)`);
      return dates;
    } else {
      const errorText = await response.text().catch(() => '');
      console.log(`[API] Assignments API returned ${response.status} for ${course.name}: ${errorText.substring(0, 200)}`);
      return [];
    }
  } catch (error) {
    console.error(`[API] Error fetching assignments API for ${course.name}:`, error);
    return [];
  }
}

async function fetchSyllabus(course) {
  try {
    // Try syllabus page first
    const syllabusUrl = `${course.url}/syllabus`;
    console.log(`Fetching syllabus from: ${syllabusUrl}`);
    
    const response = await fetch(syllabusUrl, { 
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/pdf'
      }
    });
    
    if (!response.ok) {
      console.log(`Syllabus not accessible (${response.status}): ${syllabusUrl}`);
      return await fetchAssignmentsPage(course); // Fallback to assignments
    }
    
    const contentType = response.headers.get('content-type') || '';
    
    // Check if it's a PDF
    if (contentType.includes('application/pdf') || syllabusUrl.includes('.pdf')) {
      const arrayBuffer = await response.arrayBuffer();
      const text = await parsePDF(arrayBuffer);
      console.log(`Parsed PDF syllabus, extracted ${text.length} characters`);
      return { text, isPDF: true };
    } else {
      // HTML content
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract text from syllabus content area
      const syllabusContent = doc.querySelector('#syllabus, .syllabus, [class*="syllabus"], .user_content') ||
                              doc.body;
      
      const text = syllabusContent.textContent || syllabusContent.innerText || '';
      console.log(`Extracted ${text.length} characters from HTML syllabus`);
      
      if (text.length < 50) {
        // Very short syllabus, try assignments page
        console.log('Syllabus seems empty, trying assignments page...');
        const assignmentsData = await fetchAssignmentsPage(course);
        if (assignmentsData) return assignmentsData;
      }
      
      return { text, isPDF: false };
    }
  } catch (error) {
    console.error(`Error fetching syllabus for ${course.name}:`, error);
    // Try assignments page as fallback
    return await fetchAssignmentsPage(course);
  }
}

async function fetchAssignmentsPage(course) {
  // This function is now deprecated - we use fetchAssignmentsFromAPI instead
  // But keeping it as a fallback that returns null
  // The assignments are already fetched in extractImportantDates via fetchAssignmentsFromAPI
  return null;
}

async function parsePDF(arrayBuffer) {
  if (!pdfjsLib) {
    throw new Error('PDF.js library not loaded');
  }
  
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw error;
  }
}

function findImportantDates(text, courseName, isPDF = false) {
  const importantDates = [];
  
  if (!text || text.length < 10) {
    return importantDates;
  }
  
  console.log(`Searching for dates in ${courseName} (${text.length} characters)`);
  
  // Keywords that indicate important dates
  const importantKeywords = [
    'exam', 'test', 'quiz', 'midterm', 'final', 'assignment', 'homework', 'hw',
    'project', 'paper', 'essay', 'due', 'deadline', 'submission', 'presentation',
    'demo', 'lab', 'drop', 'holiday', 'break', 'reading day', 'study day'
  ];
  
  // Date patterns
  const patterns = [
    // MM/DD/YYYY or MM/DD/YY
    /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
    // Month DD, YYYY or Month DD
    /\b([A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/g,
    // DD Month YYYY
    /\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/g,
    // YYYY-MM-DD (ISO format)
    /\b(\d{4}-\d{1,2}-\d{1,2})\b/g,
    // Day, Month DD, YYYY
    /\b([A-Za-z]+day,?\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/gi
  ];
  
  // Find dates near important keywords
  const lines = text.split(/\n/);
  lines.forEach((line, lineIndex) => {
    const lowerLine = line.toLowerCase();
    const hasKeyword = importantKeywords.some(keyword => lowerLine.includes(keyword));
    
    if (hasKeyword) {
      patterns.forEach(pattern => {
        const matches = line.matchAll(pattern);
        for (const match of matches) {
          const dateStr = match[0];
          const parsedDate = parseDate(dateStr);
          if (parsedDate) {
            importantDates.push({
              course: courseName,
              date: parsedDate.toISOString(),
              title: extractDateTitle(line),
              description: line.substring(0, 200),
              rawText: line
            });
            console.log(`Found date: ${extractDateTitle(line)} on ${parsedDate.toLocaleDateString()}`);
          }
        }
      });
    }
  });
  
  // If still no dates found, try a more aggressive approach - look for any date patterns
  if (importantDates.length === 0) {
    console.log('No dates found with keyword matching, trying general date patterns...');
    const generalDatePatterns = [
      /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g, // MM/DD/YYYY or MM/DD/YY
      /\b([A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/g, // Month DD, YYYY or Month DD
      /\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/g, // DD Month YYYY
      /\b(\d{4}-\d{1,2}-\d{1,2})\b/g // YYYY-MM-DD (ISO format)
    ];
    
    generalDatePatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const dateStr = match[0];
        const parsedDate = parseDate(dateStr);
        if (parsedDate) {
          // Get context around the date (50 chars before and after)
          const matchIndex = match.index;
          const contextStart = Math.max(0, matchIndex - 50);
          const contextEnd = Math.min(text.length, matchIndex + dateStr.length + 50);
          const context = text.substring(contextStart, contextEnd);
          
          importantDates.push({
            course: courseName,
            date: parsedDate.toISOString(),
            title: extractDateTitle(context, dateStr),
            description: context,
            rawText: context
          });
        }
      }
    });
  }
  
  console.log(`Total dates found for ${courseName}: ${importantDates.length}`);
  return importantDates;
}

function extractDateTitle(text, dateText = '') {
  // Try to extract a meaningful title from the text
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const firstLine = lines[0] || text;
  
  // Remove the date itself if present
  let title = firstLine.replace(dateText, '').trim();
  
  // Clean up common prefixes
  title = title.replace(/^(exam|test|quiz|assignment|homework|project|paper|due|deadline)[:\s]*/i, '');
  title = title.trim();
  
  // If title is too short or empty, use a default
  if (title.length < 3) {
    return 'Important Date';
  }
  
  // Limit length
  return title.substring(0, 100);
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Try using chrono if available
  if (chrono && typeof chrono.parseDate === 'function') {
    try {
      const parsed = chrono.parseDate(dateStr);
      if (parsed) return parsed;
    } catch (e) {
      // Fall through to regex parsing
    }
  }
  
  // Fallback: regex-based parsing
  let date = null;
  
  // MM/DD/YYYY or MM/DD/YY
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateStr)) {
    const parts = dateStr.split('/');
    const month = parseInt(parts[0], 10) - 1;
    const day = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }
    date = new Date(year, month, day);
  }
  // Month DD, YYYY
  else if (/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}$/.test(dateStr)) {
    date = new Date(dateStr);
  }
  // YYYY-MM-DD
  else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
    date = new Date(dateStr);
  }
  // DD Month YYYY
  else if (/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(dateStr)) {
    date = new Date(dateStr);
  }
  
  // Validate date
  if (date && !isNaN(date.getTime())) {
    // Set time to noon to avoid timezone issues
    date.setHours(12, 0, 0, 0);
    return date;
  }
  
  return null;
}

function removeDuplicates(examDates) {
  const seen = new Set();
  const unique = [];
  
  examDates.forEach(exam => {
    const key = `${exam.course}-${exam.date}-${exam.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(exam);
    }
  });
  
  return unique;
}
