/**
 * Background service worker for SlackSnap extension
 */

/**
 * Handle extension icon click
 */
chrome.action.onClicked.addListener(async (tab) => {
  try {
    console.log('🚀 Extension icon clicked!');
    console.log('Tab info:', { id: tab.id, url: tab.url, title: tab.title });
    
    // Check if we're on a Slack page
    if (!tab.url.includes('slack.com')) {
      console.log('❌ Not on a Slack page, cannot export messages');
      console.log('Current URL:', tab.url);
      return;
    }
    
    console.log('✅ On Slack page, starting export for tab:', tab.id);
    
    // Send message to content script to start export
    console.log('Sending EXPORT_MESSAGES to content script...');

    let exportResponse = null; // Track export result across scopes

    try {
      exportResponse = await chrome.tabs.sendMessage(tab.id, {
        action: 'EXPORT_MESSAGES'
      });
      
      console.log('Response from content script:', exportResponse);
    } catch (messageError) {
      console.error('❌ Could not reach content script:', messageError.message);
      console.log('This usually means:');
      console.log('1. Content script not loaded on this page');
      console.log('2. Content script has JavaScript errors');
      console.log('3. Page URL doesn\'t match content script pattern');
      console.log('4. Content script crashed during loading');
      
      // Try to inject content script manually
      console.log('🔧 Attempting to inject content script manually...');
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/config.js', 'src/utils.js', 'src/content.js']
        });
        
        console.log('✅ Manual injection successful, retrying message...');
        
        // Wait a moment for script to initialize
        setTimeout(async () => {
          try {
            const retryResponse = await chrome.tabs.sendMessage(tab.id, {
              action: 'EXPORT_MESSAGES'
            });
            console.log('✅ Retry successful:', retryResponse);
          } catch (retryError) {
            console.error('❌ Retry failed:', retryError.message);
          }
        }, 1000);
        
      } catch (injectionError) {
        console.error('❌ Manual injection failed:', injectionError.message);
        console.log('Check if you have permission to access this page');
      }
    }
    
    if (exportResponse && exportResponse.success) {
      console.log('✅ Export completed successfully via', exportResponse.method);
    } else {
      console.error('❌ Export failed:', exportResponse?.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error('❌ Failed to handle extension click:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
  }
});

/**
 * Handle messages from content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Background received message:', message);
  
  if (message.action === 'DOWNLOAD_FILE') {
    handleFileDownload(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('Download failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
  
  if (message.action === 'CONTENT_SCRIPT_READY') {
    console.log('✅ Content script ready on tab:', sender.tab?.id);
    return;
  }
  
  console.log('❓ Unknown message from content script:', message.action);
});

/**
 * Handle file download request
 * @param {Object} data - Download data containing filename and content
 * @returns {Promise<void>}
 */
async function handleFileDownload(data) {
  try {
    console.log('📥 Starting background file download (fallback method)...');
    const { filename, content, directory } = data;
    console.log('Download details:', {
      filename,
      contentLength: content?.length,
      directory,
      hasContent: !!content
    });
    
    if (!content) {
      throw new Error('No content provided for download');
    }
    
    // Convert content to data URL (works in service workers)
    const mimeType = data.mimeType || 'text/markdown';
    const dataUrl = `data:${mimeType};charset=utf-8,` + encodeURIComponent(content);
    console.log('📝 Created data URL');
    
    // Ensure directory path is properly formatted
    let downloadPath = filename;
    if (directory && directory.trim()) {
      // Clean directory name and ensure proper path format
      const cleanDirectory = directory.trim().replace(/[\/\\]/g, '');
      downloadPath = `${cleanDirectory}/${filename}`;
    }
    console.log('📂 Download path:', downloadPath);
    
    const downloadOptions = {
      url: dataUrl,
      filename: downloadPath,
      saveAs: false,
      conflictAction: 'uniquify' // Auto-rename if file exists
    };
    
    console.log('📤 Download options:', downloadOptions);
    const downloadId = await chrome.downloads.download(downloadOptions);
    
    console.log('✅ Background download started with ID:', downloadId);
    
  } catch (error) {
    console.error('❌ Failed background download:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('SlackSnap extension installed');
    
    // Set default configuration
    chrome.storage.sync.set({
      downloadDirectory: "slack-exports",
      fileNameFormat: "YYYYMMDD-HHmm-{channel}.md",
      includeTimestamps: true,
      includeThreadReplies: true,
      historyDays: 7,
        incrementalExport: true,
        includeJsonExport: true,
      channels: [],
      lastExportTimestamps: {},
      combinedExport: false
    });
  }
}); 