// Popup script for UI interactions with preview/edit functionality
document.addEventListener('DOMContentLoaded', async () => {
  const scanBtn = document.getElementById('scanBtn');
  const extractBtn = document.getElementById('extractBtn');
  const syncBtn = document.getElementById('syncBtn');
  const addExamBtn = document.getElementById('addExamBtn');
  const statusDiv = document.getElementById('status');
  const courseList = document.getElementById('courseList');
  const examPreview = document.getElementById('examPreview');
  const previewSection = document.getElementById('previewSection');
  
  let courses = [];
  let importantDates = [];
  let editingIndex = null;
  let showPreview = true; // Default to showing preview
  
  // Load preview preference
  chrome.storage.sync.get('showPreview', (result) => {
    showPreview = result.showPreview !== false; // Default to true
    if (!showPreview) {
      previewSection.style.display = 'none';
    }
  });
  
  function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
  }
  
  function hideStatus() {
    statusDiv.style.display = 'none';
  }
  
  function setLoading(button, textElement, isLoading) {
    if (isLoading) {
      button.disabled = true;
      const text = textElement.textContent.replace(/<span class="loading"><\/span>/, '');
      textElement.innerHTML = `<span class="loading"></span>${text}`;
    } else {
      button.disabled = false;
      textElement.innerHTML = textElement.textContent.replace(/<span class="loading"><\/span>/, '');
    }
  }
  
  // Helper function to check if we're on a Canvas page
  function isCanvasPage(tab) {
    if (!tab || !tab.url) return false;
    
    const url = tab.url.toLowerCase();
    
    // Check for instructure.com (standard Canvas hosting)
    if (url.includes('instructure.com')) return true;
    
    // Check for common Canvas subdomain patterns (e.g., canvas.tamu.edu, canvas.university.edu)
    // Matches: https://canvas.tamu.edu, https://canvas.school.edu, etc.
    if (/^https:\/\/canvas\./.test(url)) return true;
    
    // Allow HTTPS pages - content script will validate via Canvas API
    // This allows custom Canvas domains to work
    return url.startsWith('https://');
  }
  
  // Check if we're on a Canvas page
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    const isCanvas = await isCanvasPage(tab);
    if (!isCanvas) {
      showStatus('Please navigate to your Canvas website first (e.g., canvas.tamu.edu)', 'error');
      scanBtn.disabled = true;
    }
  });
  
  scanBtn.addEventListener('click', async () => {
    hideStatus();
    setLoading(scanBtn, document.getElementById('scanBtnText'), true);
    courseList.innerHTML = 'Scanning...';
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we're on a Canvas page (content script will validate via Canvas API)
      const isCanvas = isCanvasPage(tab);
      if (!isCanvas) {
        throw new Error('Please navigate to your Canvas website (e.g., canvas.tamu.edu or *.instructure.com)');
      }
      
      // For custom Canvas domains (not instructure.com), inject content script if needed
      // activeTab + scripting permissions allow us to inject scripts
      if (!tab.url.includes('instructure.com')) {
        try {
          // Try to inject content script for custom Canvas domains
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['libs/pdf.min.js', 'content.js']
          });
          // Small delay to ensure script is loaded
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (injectError) {
          // Script might already be injected, continue anyway
          console.log('Content script injection:', injectError.message);
        }
      }
      
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'scanCourses' });
      
      if (response.success) {
        courses = response.courses;
        if (courses.length === 0) {
          courseList.innerHTML = 'No courses found. Make sure you\'re logged into Canvas.';
          showStatus('No courses found', 'error');
        } else {
          displayCourses(courses);
          extractBtn.disabled = false;
          showStatus(`✓ Found ${courses.length} course(s)`, 'success');
        }
      } else {
        courseList.innerHTML = 'Error scanning courses';
        showStatus('Error: ' + response.error, 'error');
      }
    } catch (error) {
      courseList.innerHTML = 'Error: ' + error.message;
      showStatus('Error scanning courses: ' + error.message, 'error');
    } finally {
      setLoading(scanBtn, document.getElementById('scanBtnText'), false);
    }
  });
  
  extractBtn.addEventListener('click', async () => {
    hideStatus();
    setLoading(extractBtn, document.getElementById('extractBtnText'), true);
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'extractImportantDates',
        courses: courses 
      });
      
      if (response.success) {
        importantDates = response.importantDates;
        
        // Always load preview preference
        const settings = await chrome.storage.sync.get('showPreview');
        const shouldShowPreview = settings.showPreview !== false;
        showPreview = shouldShowPreview;
        
        if (importantDates.length === 0) {
          showStatus('No important dates found. Check browser console (F12) for details.', 'error');
          if (shouldShowPreview) {
            examPreview.innerHTML = `
              <div class="no-exams">
                <p>No important dates found in syllabi.</p>
                <p style="font-size: 11px; color: #666; margin-top: 10px;">
                  <strong>Tips:</strong><br>
                  • Open browser console (F12) to see detailed logs<br>
                  • Some syllabi may not have dates in a recognizable format<br>
                  • Try using "Add Manual Date" to add dates manually<br>
                  • Make sure you're logged into Canvas
                </p>
              </div>
            `;
            previewSection.style.display = 'block';
          } else {
            previewSection.style.display = 'none';
          }
        } else {
          showStatus(`✓ Found ${importantDates.length} important date(s)`, 'success');
          
          if (shouldShowPreview) {
            displayExamPreview();
            previewSection.style.display = 'block';
          } else {
            previewSection.style.display = 'none';
          }
          syncBtn.disabled = false;
        }
      } else {
        showStatus('Error: ' + response.error, 'error');
      }
    } catch (error) {
      showStatus('Error extracting dates: ' + error.message, 'error');
    } finally {
      setLoading(extractBtn, document.getElementById('extractBtnText'), false);
    }
  });
  
  syncBtn.addEventListener('click', async () => {
    hideStatus();
    setLoading(syncBtn, document.getElementById('syncBtnText'), true);
    
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'syncToCalendar',
        examDates: importantDates // Keep parameter name for backward compatibility
      });
      
      if (result.success) {
        showStatus(`✓ Successfully added ${result.added} event(s) to calendar`, 'success');
        syncBtn.disabled = true;
        if (result.message) {
          showStatus(result.message, 'info');
        }
      } else {
        showStatus('Error: ' + result.error, 'error');
      }
    } catch (error) {
      showStatus('Error syncing: ' + error.message, 'error');
    } finally {
      setLoading(syncBtn, document.getElementById('syncBtnText'), false);
    }
  });
  
  addExamBtn.addEventListener('click', () => {
    const newDate = {
      course: 'New Course',
      date: new Date().toISOString(),
      title: 'Important Date',
      description: '',
      rawText: ''
    };
    importantDates.push(newDate);
    editingIndex = importantDates.length - 1;
    displayExamPreview();
  });
  
  function displayCourses(courses) {
    if (courses.length === 0) {
      courseList.innerHTML = 'No courses found';
      return;
    }
    courseList.innerHTML = courses.map(course => 
      `<div class="course-item">📚 ${course.name}</div>`
    ).join('');
  }
  
  function displayExamPreview() {
    if (importantDates.length === 0) {
      examPreview.innerHTML = '<div class="no-exams">No dates to display. Click "Extract Important Dates" or "Add Manual Date".</div>';
      return;
    }
    
    examPreview.innerHTML = importantDates.map((dateItem, index) => {
      const date = new Date(dateItem.date);
      const dateStr = date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      const timeStr = date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
      });
      
      if (editingIndex === index) {
        // Edit mode
        const localDateTime = new Date(dateItem.date);
        localDateTime.setMinutes(localDateTime.getMinutes() - localDateTime.getTimezoneOffset());
        const localDateTimeStr = localDateTime.toISOString().slice(0, 16);
        
        return `
          <div class="exam-item editing">
            <div class="exam-field">
              <label>Course Name:</label>
              <input type="text" id="edit-course-${index}" value="${escapeHtml(dateItem.course)}">
            </div>
            <div class="exam-field">
              <label>Event Title:</label>
              <input type="text" id="edit-title-${index}" value="${escapeHtml(dateItem.title || 'Important Date')}">
            </div>
            <div class="exam-field">
              <label>Date & Time:</label>
              <input type="datetime-local" id="edit-date-${index}" value="${localDateTimeStr}">
            </div>
            <div class="exam-field">
              <label>Description:</label>
              <textarea id="edit-desc-${index}">${escapeHtml(dateItem.description || '')}</textarea>
            </div>
            <div class="save-cancel-buttons">
              <button class="btn-small save" onclick="saveExam(${index})">Save</button>
              <button class="btn-small cancel" onclick="cancelEdit()">Cancel</button>
            </div>
          </div>
        `;
      } else {
        // View mode
        return `
          <div class="exam-item">
            <div class="exam-header">
              <div>
                <div class="exam-course">${escapeHtml(dateItem.course)}</div>
                <div class="exam-details">
                  <strong>${escapeHtml(dateItem.title || 'Important Date')}</strong> - ${dateStr} at ${timeStr}
                  ${dateItem.description ? '<br>' + escapeHtml(dateItem.description.substring(0, 100)) + (dateItem.description.length > 100 ? '...' : '') : ''}
                </div>
              </div>
              <div class="exam-actions">
                <button class="btn-small" onclick="editExam(${index})">Edit</button>
                <button class="btn-small delete" onclick="deleteExam(${index})">Delete</button>
              </div>
            </div>
          </div>
        `;
      }
    }).join('');
  }
  
  // Make functions available globally for onclick handlers
  window.editExam = (index) => {
    editingIndex = index;
    displayExamPreview();
  };
  
  window.deleteExam = (index) => {
    if (confirm('Are you sure you want to delete this date?')) {
      importantDates.splice(index, 1);
      if (editingIndex === index) {
        editingIndex = null;
      } else if (editingIndex > index) {
        editingIndex--;
      }
      displayExamPreview();
      if (importantDates.length === 0) {
        syncBtn.disabled = true;
        previewSection.style.display = 'none';
      }
    }
  };
  
  window.saveExam = (index) => {
    const course = document.getElementById(`edit-course-${index}`).value.trim();
    const title = document.getElementById(`edit-title-${index}`).value.trim();
    const dateTime = document.getElementById(`edit-date-${index}`).value;
    const description = document.getElementById(`edit-desc-${index}`).value.trim();
    
    if (!course) {
      alert('Course name is required');
      return;
    }
    
    if (!dateTime) {
      alert('Date and time are required');
      return;
    }
    
    // Convert local datetime to ISO string
    const localDate = new Date(dateTime);
    const utcDate = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000);
    
    importantDates[index] = {
      course: course,
      title: title || 'Important Date',
      date: utcDate.toISOString(),
      description: description,
      rawText: description
    };
    
    editingIndex = null;
    displayExamPreview();
    showStatus('Date updated', 'success');
    setTimeout(hideStatus, 2000);
  };
  
  window.cancelEdit = () => {
    editingIndex = null;
    displayExamPreview();
  };
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Initial display if we have important dates (e.g., after page reload)
  if (importantDates.length > 0 && showPreview) {
    displayExamPreview();
    previewSection.style.display = 'block';
  }
});
