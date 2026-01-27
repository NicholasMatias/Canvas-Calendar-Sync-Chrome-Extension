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
    sendResponse({ 
      success: false, 
      error: 'This extension only works on Canvas pages. Please navigate to your Canvas website (e.g., canvas.tamu.edu).' 
    });
    return true;
  }
  
  if (request.action === 'scanCourses') {
    scanCourses().then(courses => {
      sendResponse({ success: true, courses });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'extractImportantDates') {
    extractImportantDates(request.courses).then(importantDates => {
      sendResponse({ success: true, importantDates });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

async function scanCourses() {
  const courses = [];
  const courseSet = new Set();
  
  // Method 1: Try Canvas API first (works if user is logged in)
  try {
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
        if (course.id && !courseSet.has(course.id.toString())) {
          courseSet.add(course.id.toString());
          courses.push({
            id: course.id.toString(),
            name: course.name || course.course_code || 'Unnamed Course',
            url: `${window.location.origin}/courses/${course.id}`,
            code: course.course_code
          });
        }
      });
      
      if (courses.length > 0) {
        console.log(`Found ${courses.length} courses via API`);
        return courses;
      }
    }
  } catch (e) {
    console.log('API method failed, trying DOM scraping:', e);
  }
  
  // Method 2: DOM scraping from dashboard
  const courseLinks = document.querySelectorAll('a[href*="/courses/"]');
  
  courseLinks.forEach(link => {
    const href = link.getAttribute('href');
    const match = href.match(/\/courses\/(\d+)/);
    if (match) {
      const courseId = match[1];
      if (!courseSet.has(courseId)) {
        courseSet.add(courseId);
        
        // Try to get course name from various possible locations
        let courseName = link.textContent.trim();
        if (!courseName || courseName.length < 2) {
          courseName = link.querySelector('.name')?.textContent.trim() ||
                       link.querySelector('[class*="course"]')?.textContent.trim() ||
                       link.getAttribute('title') ||
                       'Unnamed Course';
        }
        
        courses.push({
          id: courseId,
          name: courseName,
          url: href.startsWith('http') ? href : window.location.origin + href
        });
      }
    }
  });
  
  // Method 3: Check if we're on a course page and extract current course
  if (courses.length === 0) {
    const courseMatch = window.location.pathname.match(/\/courses\/(\d+)/);
    if (courseMatch) {
      const courseId = courseMatch[1];
      const courseName = document.querySelector('h1, .course-title, [class*="course-name"]')?.textContent.trim() || 
                         'Current Course';
      courses.push({
        id: courseId,
        name: courseName,
        url: window.location.href.split('/').slice(0, -1).join('/')
      });
    }
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
      
      assignments.forEach((assignment, index) => {
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
              rawText: `Assignment: ${assignment.name} due: ${assignment.due_at}`
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
              rawText: `Assignment available: ${assignment.unlock_at}`
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
              rawText: `Assignment locks: ${assignment.lock_at}`
            });
          }
        }
      });
      
      console.log(`[API] Extracted ${dates.length} dates from ${assignments.length} assignments for ${course.name}`);
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
      // Try assignments page as fallback (often has due dates)
      return await fetchAssignmentsPage(course);
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
  // Use PDF.js to parse PDF
  if (!pdfjsLib) {
    // Try to access from window
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      pdfjsLib = window.pdfjsLib;
    } else {
      console.error('PDF.js not available');
      return '';
    }
  }
  
  try {
    // Configure PDF.js worker
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');
    }
    
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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
    return '';
  }
}

function findImportantDates(text, courseName, isPDF = false) {
  const importantDates = [];
  
  if (!text || text.length < 10) {
    console.log(`Text too short (${text ? text.length : 0} chars) for ${courseName}`);
    return importantDates;
  }
  
  console.log(`Searching for dates in ${courseName} (${text.length} characters)`);
  
  // Use chrono for advanced date parsing if available
  // Note: chrono-node may not be available in browser, so we have fallback regex parsing
  if (chrono && typeof chrono.parse === 'function') {
    // Look for important date-related text patterns
    const importantKeywords = [
      // Exams and assessments
      'final exam', 'midterm exam', 'exam', 'test', 'quiz', 'final', 'midterm', 
      'assessment', 'examination', 'proctored exam',
      // Assignments and projects
      'assignment', 'homework', 'hw', 'project', 'paper', 'essay', 'report',
      'due date', 'due', 'deadline', 'submission',
      // Presentations and activities
      'presentation', 'present', 'demo', 'demonstration',
      // Other important dates
      'lab', 'laboratory', 'workshop', 'discussion', 'recitation',
      'drop date', 'withdrawal', 'add/drop', 'registration',
      'holiday', 'no class', 'class cancelled', 'break'
    ];
    
    // Split text into sentences/lines for better context
    const lines = text.split(/[.\n]/);
    
    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      
      // Check if line contains important date keywords
      const hasImportantKeyword = importantKeywords.some(keyword => lowerLine.includes(keyword));
      
      if (hasImportantKeyword) {
        try {
          // Use chrono to parse dates in this line
          const results = chrono.parse(line, new Date());
          
          results.forEach(result => {
            if (result.start) {
              const date = result.start.date();
              const title = extractDateTitle(line, result.text);
              
              importantDates.push({
                course: courseName,
                date: date.toISOString(),
                title: title,
                description: line.trim().substring(0, 200),
                rawText: line.trim()
              });
            }
          });
        } catch (e) {
          console.error('Error parsing with chrono:', e);
        }
      }
    });
  } else {
    // Fallback to regex-based parsing
    const patterns = [
      // Exams: "Final Exam: December 15, 2024"
      /(?:final|midterm|exam|test|quiz)\s+(?:exam|test|quiz)?\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi,
      // Exams: "Exam 1 - 10/20/2024"
      /(?:exam|test|final|midterm|quiz)\s+\d*\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
      // Dates with exams: "12/15/2024 - Final Exam"
      /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(?:final|exam|test|midterm|quiz)/gi,
      // Assignments: "Assignment 1 due: December 15, 2024"
      /(?:assignment|homework|hw|project|paper|essay|report)\s+\d*\s*(?:due|deadline)?\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi,
      // Assignments: "Assignment 1 - 10/20/2024"
      /(?:assignment|homework|hw|project|paper|essay|report)\s+\d*\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
      // Due dates: "Due: December 15, 2024" or "Deadline: 10/20/2024"
      /(?:due|deadline|submission)\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
      // Presentations: "Presentation: December 15, 2024"
      /(?:presentation|present|demo|demonstration)\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
      // Dates with assignments: "12/15/2024 - Assignment 1"
      /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(?:assignment|homework|hw|project|paper|essay|report)/gi,
      // General date patterns with context
      /(?:final|exam|test|midterm|quiz|assignment|homework|hw|project|paper|essay|report|presentation|due|deadline).*?([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)/gi
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const dateStr = match[1] || match[0];
        const parsedDate = parseDate(dateStr);
        if (parsedDate) {
          importantDates.push({
            course: courseName,
            date: parsedDate.toISOString(),
            title: extractDateTitle(match[0]),
            description: match[0].substring(0, 200),
            rawText: match[0]
          });
          console.log(`Found date: ${extractDateTitle(match[0])} on ${parsedDate.toLocaleDateString()}`);
        } else {
          console.log(`Could not parse date from: "${match[0]}"`);
        }
      }
    });
    
    // If still no dates found, try a more aggressive approach - look for any date patterns
    if (importantDates.length === 0) {
      console.log('No dates found with keyword matching, trying general date patterns...');
      const generalDatePatterns = [
        // MM/DD/YYYY or MM/DD/YY
        /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
        // Month DD, YYYY or Month DD
        /\b([A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/g,
        // DD Month YYYY
        /\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/g,
        // YYYY-MM-DD (ISO format)
        /\b(\d{4}-\d{1,2}-\d{1,2})\b/g
      ];
      
      generalDatePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const parsedDate = parseDate(match[1]);
          if (parsedDate) {
            // Only add if it's a reasonable date (not too far in past/future)
            const now = new Date();
            const yearDiff = Math.abs(parsedDate.getFullYear() - now.getFullYear());
            if (yearDiff <= 2) {
              // Try to find context around this date
              const contextStart = Math.max(0, match.index - 50);
              const contextEnd = Math.min(text.length, match.index + match[0].length + 50);
              const context = text.substring(contextStart, contextEnd);
              
              importantDates.push({
                course: courseName,
                date: parsedDate.toISOString(),
                title: extractDateTitle(context) || 'Important Date',
                description: context.trim().substring(0, 200),
                rawText: context.trim()
              });
              console.log(`Found date (general pattern): ${parsedDate.toLocaleDateString()} in context: "${context.substring(0, 50)}"`);
            }
          }
        }
      });
    }
  }
  
  console.log(`Total dates found for ${courseName}: ${importantDates.length}`);
  return importantDates;
}

function extractDateTitle(text, dateText = '') {
  // Extract title from text (exam, assignment, project, etc.)
  const titleMatch = text.match(/(?:final|midterm|exam|test|quiz|assignment|homework|hw|project|paper|essay|report|presentation|due|deadline)\s+(\d+|[\w\s]+?)(?:\s*[-–:]|$)/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  
  // Try to get text before date
  if (dateText) {
    const beforeDate = text.split(dateText)[0].trim();
    if (beforeDate.length > 0 && beforeDate.length < 50) {
      return beforeDate;
    }
  }
  
  // Try to extract the type of event
  const typeMatch = text.match(/(final|midterm|exam|test|quiz|assignment|homework|hw|project|paper|essay|report|presentation|due|deadline)/i);
  if (typeMatch) {
    return typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1);
  }
  
  return 'Important Date';
}

function parseDate(dateStr) {
  try {
    // Try various date formats
    let date = new Date(dateStr);
    
    // If invalid, try adding current year
    if (isNaN(date.getTime())) {
      const currentYear = new Date().getFullYear();
      date = new Date(dateStr + ', ' + currentYear);
    }
    
    // If still invalid, try with time
    if (isNaN(date.getTime())) {
      date = new Date(dateStr + ' 12:00 PM');
    }
    
    if (!isNaN(date.getTime()) && date.getFullYear() > 2000 && date.getFullYear() < 2100) {
      return date;
    }
  } catch (e) {
    // Ignore parsing errors
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
