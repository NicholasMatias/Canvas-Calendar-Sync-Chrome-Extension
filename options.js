document.addEventListener('DOMContentLoaded', async () => {
  const calendarType = document.getElementById('calendarType');
  const showPreview = document.getElementById('showPreview');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  const googleOAuthSection = document.getElementById('googleOAuthSection');
  
  // Load saved settings
  const settings = await chrome.storage.sync.get(['calendarType', 'showPreview']);
  if (settings.calendarType) {
    calendarType.value = settings.calendarType;
  }
  if (settings.showPreview !== undefined) {
    showPreview.checked = settings.showPreview !== false; // Default to true
  }
  
  // Show/hide Google OAuth section
  function updateOAuthSection() {
    googleOAuthSection.style.display = calendarType.value === 'google' ? 'block' : 'none';
  }
  
  calendarType.addEventListener('change', updateOAuthSection);
  updateOAuthSection();
  
  saveBtn.addEventListener('click', async () => {
    await chrome.storage.sync.set({ 
      calendarType: calendarType.value,
      showPreview: showPreview.checked
    });
    status.textContent = '✓ Settings saved!';
    status.className = 'status success';
    status.style.display = 'block';
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  });
});
