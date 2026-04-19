/**
 * utils/downloadHelper.js
 * ─────────────────────────────────────────────────────────────────────────
 * Browser download helper for the Chrome Extension context.
 *
 * Provides:
 *   downloadText(content, filename) → triggers a .txt file download
 *
 * Implementation:
 *   Uses the Blob + URL.createObjectURL approach which is compatible
 *   with Chrome Extension popup pages.
 *
 *   The chrome.downloads API could also be used (requires 'downloads'
 *   permission which is already declared in manifest.json), but the
 *   Blob approach works without needing background page interaction.
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const DownloadHelper = (() => {

  /**
   * Trigger a browser download for a plain-text string.
   *
   * @param {string} content  - Text content to download
   * @param {string} filename - Suggested filename (e.g., 'plan.txt')
   */
  function downloadText(content, filename = 'plan.txt') {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);

    const anchor    = document.createElement('a');
    anchor.href     = url;
    anchor.download = filename;
    anchor.style.display = 'none';

    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Release the object URL after the download is triggered
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Trigger a browser download for a JSON object.
   *
   * @param {Object} data     - JSON-serialisable object
   * @param {string} filename - Suggested filename (e.g., 'data.json')
   */
  function downloadJson(data, filename = 'data.json') {
    const content = JSON.stringify(data, null, 2);
    const blob    = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url     = URL.createObjectURL(blob);

    const anchor    = document.createElement('a');
    anchor.href     = url;
    anchor.download = filename;
    anchor.style.display = 'none';

    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Use chrome.downloads API as an alternative download method.
   * Useful when popup context has issues with URL.createObjectURL.
   *
   * @param {string} content
   * @param {string} filename
   */
  function downloadViaChromeAPI(content, filename = 'plan.txt') {
    const blob    = new Blob([content], { type: 'text/plain' });
    const url     = URL.createObjectURL(blob);

    chrome.downloads.download({
      url     : url,
      filename: filename,
      saveAs  : false,
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('[DownloadHelper] Chrome API download failed:', chrome.runtime.lastError);
        // Fallback to blob approach
        downloadText(content, filename);
      } else {
        console.log('[DownloadHelper] Download started:', downloadId);
      }
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  }

  return {
    downloadText,
    downloadJson,
    downloadViaChromeAPI,
  };

})();
