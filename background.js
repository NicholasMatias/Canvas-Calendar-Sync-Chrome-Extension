// Background service worker for calendar sync

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'syncToCalendar') {
    syncToCalendar(request.examDates).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async
  }
});

async function syncToCalendar(examDates) {
  if (!examDates || examDates.length === 0) {
    return { success: false, error: 'No exam dates to sync' };
  }
  
  const { calendarType } = await chrome.storage.sync.get('calendarType');
  
  if (calendarType === 'google') {
    return await syncToGoogleCalendar(examDates);
  } else if (calendarType === 'apple') {
    return await syncToAppleCalendar(examDates);
  } else {
    // Default to Apple (iCal export) if not set
    return await syncToAppleCalendar(examDates);
  }
}

async function syncToGoogleCalendar(examDates) {
  try {
    // Get OAuth token
    const token = await getGoogleAuthToken();
    
    if (!token) {
      return { success: false, error: 'Failed to authenticate with Google Calendar' };
    }
    
    let added = 0;
    let errors = [];
    
    for (const exam of examDates) {
      try {
        const examDate = new Date(exam.date);
        
        // Skip if date is invalid
        if (isNaN(examDate.getTime())) {
          errors.push(`${exam.course}: Invalid date`);
          continue;
        }
        
        const endDate = new Date(examDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours duration
        
        const event = {
          summary: `${exam.course}${exam.title ? ' - ' + exam.title : ''}`,
          description: exam.description || exam.rawText || `Important date for ${exam.course}`,
          start: {
            dateTime: examDate.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          end: {
            dateTime: endDate.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 24 * 60 }, // 1 day before
              { method: 'popup', minutes: 60 } // 1 hour before
            ]
          }
        };
        
        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(event)
        });
        
        if (response.ok) {
          added++;
        } else {
          const errorData = await response.json().catch(() => ({}));
          errors.push(`${exam.course}: ${errorData.error?.message || response.statusText || 'Unknown error'}`);
        }
      } catch (error) {
        errors.push(`${exam.course}: ${error.message}`);
      }
    }
    
    if (added > 0) {
      return { 
        success: true, 
        added, 
        total: examDates.length,
        errors: errors.length > 0 ? errors : undefined
      };
    } else {
      return { 
        success: false, 
        error: errors.join('; ') || 'Failed to add events' 
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function syncToAppleCalendar(examDates) {
  try {
    const ical = generateICal(examDates);
    const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Download iCal file
    const filename = `canvas-exams-${new Date().toISOString().split('T')[0]}.ics`;
    
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    });
    
    // Clean up after a delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
    return { 
      success: true, 
      added: examDates.length,
      message: `Downloaded ${filename}. Import it into Apple Calendar or any calendar app.`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function generateICal(examDates) {
  const now = new Date();
  const nowStr = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  let ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Canvas Exam Sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ].join('\r\n') + '\r\n';
  
  examDates.forEach((exam, index) => {
    const start = new Date(exam.date);
    
    // Skip if invalid date
    if (isNaN(start.getTime())) {
      return;
    }
    
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    
    const startStr = start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const endStr = end.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    const summary = `${exam.course}${exam.title ? ' - ' + exam.title : ''}`;
    const description = (exam.description || exam.rawText || `Important date for ${exam.course}`)
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\n/g, '\\n')
      .substring(0, 500);
    
    ical += [
      'BEGIN:VEVENT',
      `UID:canvas-exam-${index}-${Date.now()}@extension`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'END:VEVENT'
    ].join('\r\n') + '\r\n';
  });
  
  ical += 'END:VCALENDAR\r\n';
  return ical;
}

async function getGoogleAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(
      { 
        interactive: true,
        scopes: ['https://www.googleapis.com/auth/calendar']
      }, 
      (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(token);
        }
      }
    );
  });
}
