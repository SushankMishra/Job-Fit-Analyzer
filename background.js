/**
 * background.js
 * ─────────────────────────────────────────────────────────────────────────
 * Manifest V3 Service Worker for the Agentic Job-Fit Analyzer.
 *
 * Responsibilities:
 *   • Listen for installation events and set default storage values
 *   • Handle any cross-context messages that cannot go through popup ↔ content
 *   • Serve as the persistent coordinator if popup is closed mid-run
 *     (future: offscreen document for long-running analysis)
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ── Install / Update ──────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set sensible defaults on first install
    chrome.storage.local.set({
      theme    : 'light',
      maxSkills: '5',
    }, () => {
      console.log('[AgentExtension] Extension installed. Default settings applied.');
    });
  }

  if (details.reason === 'update') {
    console.log(`[AgentExtension] Extension updated to ${chrome.runtime.getManifest().version}`);
  }
});

// ── Message Router ────────────────────────────────────────────────────────

/**
 * Route messages between popup ↔ content script ↔ background.
 *
 * Currently handles:
 *   action: 'ping'          → health-check, responds { ok: true }
 *   action: 'getTabInfo'    → returns current active tab URL & title
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }

  if (message.action === 'getTabInfo') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        sendResponse({ url: tabs[0].url, title: tabs[0].title });
      } else {
        sendResponse({ url: null, title: null });
      }
    });
    return true; // keep channel open for async response
  }

  // Forward scrapeJobDescription to the content script of the active tab
  if (message.action === 'forwardScrape') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        sendResponse({ error: 'No active tab' });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: 'scrapeJobDescription' }, (response) => {
        sendResponse(response || { error: 'No response from content script' });
      });
    });
    return true;
  }
});

// ── Startup Log ───────────────────────────────────────────────────────────

self.addEventListener('activate', () => {
  console.log('[AgentExtension] Service worker activated.');
});
