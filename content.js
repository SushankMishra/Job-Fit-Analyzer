/**
 * content.js
 * ─────────────────────────────────────────────────────────────────────────
 * Content script injected into every page.
 *
 * Responsibilities:
 *   • Listen for the 'scrapeJobDescription' message from popup.js
 *   • Intelligently extract job description text from common job board
 *     page structures (LinkedIn, Indeed, Greenhouse, Lever, Workday, etc.)
 *   • Fall back to heuristic body-text extraction if no specific selector hits
 *   • Return the extracted text to the popup via sendResponse
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ── Selector Map for Popular Job Boards ──────────────────────────────────

const JOB_BOARD_SELECTORS = [
  // LinkedIn
  { host: 'linkedin.com',   selector: '.jobs-description__content, .description__text, .show-more-less-html__markup' },
  // Indeed
  { host: 'indeed.com',     selector: '#jobDescriptionText, .jobsearch-JobComponent-description' },
  // Glassdoor
  { host: 'glassdoor.com',  selector: '.jobDescriptionContent, [data-test="jobDescription"]' },
  // Greenhouse
  { host: 'greenhouse.io',  selector: '#content .job__description, .posting-description' },
  // Lever
  { host: 'lever.co',       selector: '.section-wrapper-content, .posting-description' },
  // Workday
  { host: 'myworkdayjobs.com', selector: '[data-automation-id="jobPostingDescription"]' },
  // Naukri
  { host: 'naukri.com',     selector: '.job-desc, .jd-desc' },
  // Wellfound (AngelList)
  { host: 'wellfound.com',  selector: '.jobsting-description, [data-test="JobDescription"]' },
  // Internshala
  { host: 'internshala.com', selector: '.internship_details, .job_details_section' },
  // Generic fallback selectors
  { host: null, selector: '[id*="jobDescription"], [id*="job-description"], [class*="job-description"], [class*="jobDescription"]' },
  { host: null, selector: 'article, main, [role="main"]' },
];

// ── Text Extractor ─────────────────────────────────────────────────────

/**
 * Try each selector in order; return the first non-trivially short result.
 * @returns {string} Extracted job description text.
 */
function scrapeJobDescription() {
  const currentHost = window.location.hostname;

  for (const { host, selector } of JOB_BOARD_SELECTORS) {
    // Only test host-specific selectors if the host matches
    if (host && !currentHost.includes(host)) continue;

    const el = document.querySelector(selector);
    if (el) {
      const text = el.innerText.trim();
      if (text.length > 150) {
        return cleanText(text);
      }
    }

    // Try querySelectorAll for compound selectors
    const els = document.querySelectorAll(selector);
    if (els.length > 0) {
      const combined = Array.from(els).map(e => e.innerText.trim()).join('\n\n').trim();
      if (combined.length > 150) {
        return cleanText(combined);
      }
    }
  }

  // Last resort: heuristically pick the longest <p>/<li>/<div> clusters
  return extractHeuristic();
}

/**
 * Heuristic: collect all text-rich paragraphs and divs, ranked by length.
 */
function extractHeuristic() {
  const candidates = document.querySelectorAll('p, li, h2, h3, span');
  const chunks = [];
  candidates.forEach(el => {
    const text = el.innerText.trim();
    if (text.length > 40) chunks.push(text);
  });

  // Take the top longest 30 chunks, preserving document order
  const sorted = [...chunks].sort((a, b) => b.length - a.length).slice(0, 30);
  const result = sorted.join('\n').trim();
  return result.length > 100 ? cleanText(result) : '';
}

/**
 * Clean extracted text: remove excessive whitespace, repeated newlines.
 */
function cleanText(text) {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

// ── Message Listener ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scrapeJobDescription') {
    try {
      const text = scrapeJobDescription();
      sendResponse({ text });
    } catch (err) {
      sendResponse({ text: '', error: err.message });
    }
    return true; // keep channel open
  }
});
