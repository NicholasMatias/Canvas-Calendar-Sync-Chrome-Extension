// Popup script for UI interactions with preview/edit functionality
document.addEventListener('DOMContentLoaded', async () => {
  const scanBtn = document.getElementById('scanBtn');
  const extractBtn = document.getElementById('extractBtn');
  const syncBtn = document.getElementById('syncBtn');
  const statusDiv = document.getElementById('status');
  const courseList = document.getElementById('courseList');
  const examPreview = document.getElementById('examPreview');
  const previewSection = document.getElementById('previewSection');
  const listViewBtn = document.getElementById('listViewBtn');
  const calendarViewBtn = document.getElementById('calendarViewBtn');
  const listView = document.getElementById('listView');
  const calendarView = document.getElementById('calendarView');
  const calendarGrid = document.getElementById('calendarGrid');
  const calendarMonthYear = document.getElementById('calendarMonthYear');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const todayBtn = document.getElementById('todayBtn');
  const dayViewBtn = document.getElementById('dayViewBtn');
  const weekViewBtn = document.getElementById('weekViewBtn');
  const monthViewBtn = document.getElementById('monthViewBtn');
  const monthView = document.getElementById('monthView');
  const weekView = document.getElementById('weekView');
  const dayView = document.getElementById('dayView');
  const weekGrid = document.getElementById('weekGrid');
  const dayViewHeader = document.getElementById('dayViewHeader');
  const dayViewEvents = document.getElementById('dayViewEvents');
  const dayModal = document.getElementById('dayModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalEvents = document.getElementById('modalEvents');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  
  let courses = [];
  let importantDates = [];
  let editingIndex = null;
  let showPreview = true; // Default to showing preview
  let currentCalendarDate = new Date(); // Current date being viewed
  let currentView = 'list'; // 'list' or 'calendar'
  let currentCalendarView = 'month'; // 'day', 'week', or 'month'
  
  // Initialize calendar view state - ensure only month view is visible
  if (monthViewBtn && monthView) {
    monthViewBtn.classList.add('active');
    monthView.classList.add('active');
    if (monthView.style) monthView.style.display = 'block';
  }
  if (dayViewBtn) dayViewBtn.classList.remove('active');
  if (weekViewBtn) weekViewBtn.classList.remove('active');
  if (dayView) {
    dayView.classList.remove('active');
    if (dayView.style) dayView.style.display = 'none';
  }
  if (weekView) {
    weekView.classList.remove('active');
    if (weekView.style) weekView.style.display = 'none';
  }
  
  // Modal handlers
  modalCloseBtn.addEventListener('click', () => {
    dayModal.classList.remove('active');
  });
  
  dayModal.addEventListener('click', (e) => {
    if (e.target === dayModal) {
      dayModal.classList.remove('active');
    }
  });
  
  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dayModal.classList.contains('active')) {
      dayModal.classList.remove('active');
    }
  });
  
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
            if (currentView === 'calendar') {
              renderCalendar();
            }
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
  
  // View toggle handlers
  listViewBtn.addEventListener('click', () => {
    currentView = 'list';
    listViewBtn.classList.add('active');
    calendarViewBtn.classList.remove('active');
    listView.classList.add('active');
    calendarView.classList.remove('active');
  });
  
  calendarViewBtn.addEventListener('click', () => {
    currentView = 'calendar';
    calendarViewBtn.classList.add('active');
    listViewBtn.classList.remove('active');
    calendarView.classList.add('active');
    listView.classList.remove('active');
    // Initialize calendar view to month if not set
    if (!currentCalendarView) {
      currentCalendarView = 'month';
    }
    renderCalendar();
  });
  
  // Calendar view toggle
  if (dayViewBtn && weekViewBtn && monthViewBtn) {
    dayViewBtn.addEventListener('click', () => {
      currentCalendarView = 'day';
      dayViewBtn.classList.add('active');
      weekViewBtn.classList.remove('active');
      monthViewBtn.classList.remove('active');
      if (dayView) {
        dayView.classList.add('active');
        dayView.style.display = 'block';
      }
      if (weekView) {
        weekView.classList.remove('active');
        weekView.style.display = 'none';
      }
      if (monthView) {
        monthView.classList.remove('active');
        monthView.style.display = 'none';
      }
      renderCalendar();
    });
    
    weekViewBtn.addEventListener('click', () => {
      currentCalendarView = 'week';
      weekViewBtn.classList.add('active');
      dayViewBtn.classList.remove('active');
      monthViewBtn.classList.remove('active');
      if (weekView) {
        weekView.classList.add('active');
        weekView.style.display = 'block';
      }
      if (dayView) {
        dayView.classList.remove('active');
        dayView.style.display = 'none';
      }
      if (monthView) {
        monthView.classList.remove('active');
        monthView.style.display = 'none';
      }
      renderCalendar();
    });
    
    monthViewBtn.addEventListener('click', () => {
      currentCalendarView = 'month';
      monthViewBtn.classList.add('active');
      dayViewBtn.classList.remove('active');
      weekViewBtn.classList.remove('active');
      if (monthView) {
        monthView.classList.add('active');
        monthView.style.display = 'block';
      }
      if (dayView) {
        dayView.classList.remove('active');
        dayView.style.display = 'none';
      }
      if (weekView) {
        weekView.classList.remove('active');
        weekView.style.display = 'none';
      }
      renderCalendar();
    });
  }
  
  // Calendar navigation
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentCalendarView === 'day') {
        currentCalendarDate.setDate(currentCalendarDate.getDate() - 1);
      } else if (currentCalendarView === 'week') {
        currentCalendarDate.setDate(currentCalendarDate.getDate() - 7);
      } else {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
      }
      renderCalendar();
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentCalendarView === 'day') {
        currentCalendarDate.setDate(currentCalendarDate.getDate() + 1);
      } else if (currentCalendarView === 'week') {
        currentCalendarDate.setDate(currentCalendarDate.getDate() + 7);
      } else {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
      }
      renderCalendar();
    });
  }
  
  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      currentCalendarDate = new Date();
      renderCalendar();
    });
  }
  
  // Set up calendar day click handler (event delegation - only once)
  calendarGrid.addEventListener('click', (e) => {
    const dayElement = e.target.closest('.calendar-day');
    if (dayElement && !dayElement.classList.contains('other-month')) {
      const year = parseInt(dayElement.dataset.year);
      const month = parseInt(dayElement.dataset.month);
      const day = parseInt(dayElement.dataset.day);
      if (year && month !== undefined && day) {
        openDayModal(year, month, day);
      }
    }
  });
  
  // Set up modal event handlers (event delegation - only once)
  modalEvents.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-edit-btn')) {
      const index = parseInt(e.target.dataset.eventIndex);
      editEventFromModal(index);
    } else if (e.target.classList.contains('modal-delete-btn')) {
      const index = parseInt(e.target.dataset.eventIndex);
      deleteEventFromModal(index);
    }
  });
  
  // Set up exam preview event handlers (event delegation - only once)
  examPreview.addEventListener('click', (e) => {
    if (e.target.classList.contains('exam-edit-btn')) {
      const index = parseInt(e.target.dataset.examIndex);
      editExam(index);
    } else if (e.target.classList.contains('exam-delete-btn')) {
      const index = parseInt(e.target.dataset.examIndex);
      deleteExam(index);
    } else if (e.target.classList.contains('exam-save-btn')) {
      const index = parseInt(e.target.dataset.examIndex);
      saveExam(index);
    } else if (e.target.classList.contains('exam-cancel-btn')) {
      cancelEdit();
    }
  });
  
  // Render calendar view
  function renderCalendar() {
    // Ensure only the active view is visible
    if (currentCalendarView === 'day') {
      if (dayView) {
        dayView.style.display = 'block';
        dayView.classList.add('active');
      }
      if (weekView) {
        weekView.style.display = 'none';
        weekView.classList.remove('active');
      }
      if (monthView) {
        monthView.style.display = 'none';
        monthView.classList.remove('active');
      }
      renderDayView();
    } else if (currentCalendarView === 'week') {
      if (weekView) {
        weekView.style.display = 'block';
        weekView.classList.add('active');
      }
      if (dayView) {
        dayView.style.display = 'none';
        dayView.classList.remove('active');
      }
      if (monthView) {
        monthView.style.display = 'none';
        monthView.classList.remove('active');
      }
      renderWeekView();
    } else {
      if (monthView) {
        monthView.style.display = 'block';
        monthView.classList.add('active');
      }
      if (dayView) {
        dayView.style.display = 'none';
        dayView.classList.remove('active');
      }
      if (weekView) {
        weekView.style.display = 'none';
        weekView.classList.remove('active');
      }
      renderMonthView();
    }
  }
  
  function renderDayView() {
    if (!dayViewHeader || !dayViewEvents || !calendarMonthYear) return;
    
    const date = currentCalendarDate;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const fullDate = `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    dayViewHeader.textContent = fullDate;
    calendarMonthYear.textContent = fullDate;
    
    // Get events for this day
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const dateKey = `${year}-${month}-${day}`;
    
    const dayEvents = importantDates
      .map((event, index) => {
        const eventDate = new Date(event.date);
        if (eventDate.getFullYear() === year && 
            eventDate.getMonth() === month && 
            eventDate.getDate() === day) {
          return { ...event, index };
        }
        return null;
      })
      .filter(event => event !== null)
      .sort((a, b) => {
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        return timeA - timeB;
      });
    
    if (dayEvents.length === 0) {
      dayViewEvents.innerHTML = '<div class="no-exams">No events scheduled for this day</div>';
    } else {
      dayViewEvents.innerHTML = dayEvents.map(event => {
        const eventDate = new Date(event.date);
        const timeStr = eventDate.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit' 
        });
        const dateStr = eventDate.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        });
        
        return `
          <div class="modal-event-item">
            <div class="modal-event-course">${escapeHtml(event.course)}</div>
            <div class="modal-event-title">${escapeHtml(event.title || 'Important Date')}</div>
            <div class="modal-event-time">${dateStr} at ${timeStr}</div>
            ${event.description ? `<div class="modal-event-description">${escapeHtml(event.description.substring(0, 200))}${event.description.length > 200 ? '...' : ''}</div>` : ''}
            <div class="modal-event-actions">
              <button class="btn-small modal-edit-btn" data-event-index="${event.index}">Edit</button>
              <button class="btn-small delete modal-delete-btn" data-event-index="${event.index}">Delete</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }
  
  function renderWeekView() {
    if (!weekGrid || !calendarMonthYear) return;
    
    const date = currentCalendarDate;
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    
    // Get start of week (Sunday)
    const startOfWeek = new Date(date);
    startOfWeek.setDate(day - date.getDay());
    
    // Update header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const startMonth = startOfWeek.getMonth();
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const endMonth = endOfWeek.getMonth();
    
    if (startMonth === endMonth) {
      calendarMonthYear.textContent = `${monthNames[startMonth]} ${startOfWeek.getDate()} - ${endOfWeek.getDate()}, ${year}`;
    } else {
      calendarMonthYear.textContent = `${monthNames[startMonth]} ${startOfWeek.getDate()} - ${monthNames[endMonth]} ${endOfWeek.getDate()}, ${year}`;
    }
    
    let html = '';
    
    
    // Get events by date
    const eventsByDate = {};
    importantDates.forEach((event, index) => {
      const eventDate = new Date(event.date);
      const dateKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
      if (!eventsByDate[dateKey]) {
        eventsByDate[dateKey] = [];
      }
      eventsByDate[dateKey].push({ ...event, index });
    });
    
    // Render each day of the week
    for (let i = 0; i < 7; i++) {
      const currentDay = new Date(startOfWeek);
      currentDay.setDate(startOfWeek.getDate() + i);
      const dayYear = currentDay.getFullYear();
      const dayMonth = currentDay.getMonth();
      const dayDate = currentDay.getDate();
      const dateKey = `${dayYear}-${dayMonth}-${dayDate}`;
      const dayEvents = eventsByDate[dateKey] || [];
      const isToday = currentDay.toDateString() === new Date().toDateString();
      
      let dayClass = 'calendar-day';
      if (isToday) {
        dayClass += ' today';
      }
      
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][currentDay.getDay()];
      html += `<div class="${dayClass}" data-year="${dayYear}" data-month="${dayMonth}" data-day="${dayDate}">`;
      html += `<div class="calendar-day-number"><span class="day-name">${dayName}</span> <span class="day-date">${dayDate}</span></div>`;
      html += `<div class="calendar-day-events">`;
      
      const maxVisible = 3;
      dayEvents.slice(0, maxVisible).forEach(event => {
        const eventDate = new Date(event.date);
        const timeStr = eventDate.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true
        });
        const title = escapeHtml(event.title || 'Important Date');
        const course = escapeHtml(event.course);
        // Shorter title for horizontal display in week view
        const fullTitle = title.length > 15 ? title.substring(0, 12) + '...' : title;
        
        html += `<div class="calendar-event" title="${course} - ${title} at ${timeStr}">
          <span class="calendar-event-time">${timeStr}</span>${fullTitle}
        </div>`;
      });
      
      if (dayEvents.length > maxVisible) {
        html += `<div class="calendar-event-more">+${dayEvents.length - maxVisible} more</div>`;
      }
      
      if (dayEvents.length === 0) {
        html += `<div style="flex: 1; min-height: 20px;"></div>`;
      }
      
      html += `</div></div>`;
    }
    
    weekGrid.innerHTML = html;
  }
  
  function renderMonthView() {
    if (!calendarGrid || !calendarMonthYear) return;
    
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    calendarMonthYear.textContent = `${monthNames[month]} ${year}`;
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday
    
    // Get today's date for highlighting
    const today = new Date();
    const isTodayMonth = today.getMonth() === month && today.getFullYear() === year;
    
    // Group events by date
    const eventsByDate = {};
    importantDates.forEach((event, index) => {
      const eventDate = new Date(event.date);
      const dateKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
      if (!eventsByDate[dateKey]) {
        eventsByDate[dateKey] = [];
      }
      eventsByDate[dateKey].push({ ...event, index });
    });
    
    // Build calendar grid
    let html = '';
    
    // Days of the month (no empty cells)
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = `${year}-${month}-${day}`;
      const dayEvents = eventsByDate[dateKey] || [];
      const isToday = isTodayMonth && day === today.getDate();
      
      let dayClass = 'calendar-day';
      if (isToday) {
        dayClass += ' today';
      }
      
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
      // Use grid-column-start to position the first day correctly
      const gridColumnStart = day === 1 ? startingDayOfWeek + 1 : 'auto';
      const gridStyle = day === 1 ? `style="grid-column-start: ${gridColumnStart};"` : '';
      
      html += `<div class="${dayClass}" ${gridStyle} data-date="${dateKey}" data-year="${year}" data-month="${month}" data-day="${day}">`;
      html += `<div class="calendar-day-number"><span class="day-name">${dayName}</span> <span class="day-date">${day}</span></div>`;
      html += `<div class="calendar-day-events">`;
      
      // Show up to 4 events, then "more"
      const maxVisible = 4;
      const visibleEvents = dayEvents.slice(0, maxVisible);
      
      visibleEvents.forEach(event => {
        const eventDate = new Date(event.date);
        const timeStr = eventDate.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true
        });
        const title = escapeHtml(event.title || 'Important Date');
        const course = escapeHtml(event.course);
        // Shorter title for horizontal display
        const fullTitle = title.length > 15 ? title.substring(0, 12) + '...' : title;
        
        html += `<div class="calendar-event" title="${course} - ${title} at ${timeStr}">
          <span class="calendar-event-time">${timeStr}</span>${fullTitle}
        </div>`;
      });
      
      if (dayEvents.length > maxVisible) {
        html += `<div class="calendar-event-more" title="Click to see all ${dayEvents.length} events">+${dayEvents.length - maxVisible} more</div>`;
      }
      
      if (dayEvents.length === 0) {
        html += `<div style="flex: 1; min-height: 20px;"></div>`;
      }
      
      html += `</div></div>`;
    }
    
    calendarGrid.innerHTML = html;
  }
  
  // Set up week grid click handler
  if (weekGrid) {
    weekGrid.addEventListener('click', (e) => {
      const dayElement = e.target.closest('.calendar-day');
      if (dayElement) {
        const year = parseInt(dayElement.dataset.year);
        const month = parseInt(dayElement.dataset.month);
        const day = parseInt(dayElement.dataset.day);
        if (year && month !== undefined && day) {
          openDayModal(year, month, day);
        }
      }
    });
  }
  
  // Open modal for a specific day
  function openDayModal(year, month, day) {
    const date = new Date(year, month, day);
    const dateKey = `${year}-${month}-${day}`;
    
    // Find all events for this day
    const dayEvents = importantDates
      .map((event, index) => {
        const eventDate = new Date(event.date);
        if (eventDate.getFullYear() === year && 
            eventDate.getMonth() === month && 
            eventDate.getDate() === day) {
          return { ...event, index };
        }
        return null;
      })
      .filter(event => event !== null)
      .sort((a, b) => {
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        return timeA - timeB;
      });
    
    // Update modal title
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[date.getDay()];
    modalTitle.textContent = `${dayName}, ${monthNames[month]} ${day}, ${year}`;
    
    // Display events
    if (dayEvents.length === 0) {
      modalEvents.innerHTML = '<div class="modal-empty">No events scheduled for this day</div>';
    } else {
      modalEvents.innerHTML = dayEvents.map(event => {
        const eventDate = new Date(event.date);
        const timeStr = eventDate.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit' 
        });
        const dateStr = eventDate.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        });
        
        return `
          <div class="modal-event-item">
            <div class="modal-event-course">${escapeHtml(event.course)}</div>
            <div class="modal-event-title">${escapeHtml(event.title || 'Important Date')}</div>
            <div class="modal-event-time">${dateStr} at ${timeStr}</div>
            ${event.description ? `<div class="modal-event-description">${escapeHtml(event.description.substring(0, 150))}${event.description.length > 150 ? '...' : ''}</div>` : ''}
            <div class="modal-event-actions">
              <button class="btn-small modal-edit-btn" data-event-index="${event.index}">Edit</button>
              <button class="btn-small delete modal-delete-btn" data-event-index="${event.index}">Delete</button>
            </div>
          </div>
        `;
      }).join('');
    }
    
    // Show modal
    dayModal.classList.add('active');
  }
  
  // Edit event from modal
  function editEventFromModal(index) {
    dayModal.classList.remove('active');
    currentView = 'list';
    listViewBtn.classList.add('active');
    calendarViewBtn.classList.remove('active');
    listView.classList.add('active');
    calendarView.classList.remove('active');
    editingIndex = index;
    displayExamPreview();
    // Scroll to the event
    setTimeout(() => {
      const eventElement = document.querySelector(`.exam-item:nth-child(${index + 1})`);
      if (eventElement) {
        eventElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };
  
  // Delete event from modal
  function deleteEventFromModal(index) {
    if (confirm('Are you sure you want to delete this event?')) {
      importantDates.splice(index, 1);
      if (editingIndex === index) {
        editingIndex = null;
      } else if (editingIndex > index) {
        editingIndex--;
      }
      
      // Re-open modal with updated events
      const eventDate = new Date(importantDates[index]?.date || new Date());
      if (importantDates.length > 0 && index < importantDates.length) {
        // If there are still events, update the modal
        const date = new Date(eventDate);
        window.openDayModal(date.getFullYear(), date.getMonth(), date.getDate());
      } else {
        // Close modal if no events left
        dayModal.classList.remove('active');
      }
      
      displayExamPreview();
      if (currentView === 'calendar') {
        renderCalendar();
      }
      if (importantDates.length === 0) {
        syncBtn.disabled = true;
        previewSection.style.display = 'none';
      }
    }
  };
  
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
      examPreview.innerHTML = '<div class="no-exams">No dates to display. Click "Extract Important Dates".</div>';
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
              <button class="btn-small save exam-save-btn" data-exam-index="${index}">Save</button>
              <button class="btn-small cancel exam-cancel-btn">Cancel</button>
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
                <button class="btn-small exam-edit-btn" data-exam-index="${index}">Edit</button>
                <button class="btn-small delete exam-delete-btn" data-exam-index="${index}">Delete</button>
              </div>
            </div>
          </div>
        `;
      }
    }).join('');
  }
  
  // Edit exam
  function editExam(index) {
    editingIndex = index;
    displayExamPreview();
  };
  
  function deleteExam(index) {
    if (confirm('Are you sure you want to delete this date?')) {
      importantDates.splice(index, 1);
      if (editingIndex === index) {
        editingIndex = null;
      } else if (editingIndex > index) {
        editingIndex--;
      }
      displayExamPreview();
      if (currentView === 'calendar') {
        renderCalendar();
      }
      if (importantDates.length === 0) {
        syncBtn.disabled = true;
        previewSection.style.display = 'none';
      }
    }
  };
  
  function saveExam(index) {
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
    if (currentView === 'calendar') {
      renderCalendar();
    }
    showStatus('Date updated', 'success');
    setTimeout(hideStatus, 2000);
  };
  
  function cancelEdit() {
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
