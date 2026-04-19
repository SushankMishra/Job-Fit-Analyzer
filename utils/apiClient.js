/**
 * utils/apiClient.js
 * ─────────────────────────────────────────────────────────────────────────
 * Centralised HTTP client for all external API calls in the extension.
 *
 * Handles:
 *   • Gemini Pro API (generateContent endpoint)
 *   • API key validation tests
 *
 * All fetch calls use the Manifest V3 extension context.
 * The host permissions in manifest.json must include the API domains.
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const ApiClient = (() => {

  // ── Gemini Configuration ──────────────────────────────────────────────

  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const GEMINI_MODEL = 'gemini-1.5-flash-latest'; // Fast, cost-effective model

  /**
   * Call Gemini generateContent with a single user prompt.
   *
   * @param {string} apiKey
   * @param {string} prompt
   * @param {Object} opts         - Optional overrides
   * @param {number} opts.temperature - Defaults to 0.3 (low temperature for structured output)
   * @param {number} opts.maxOutputTokens - Defaults to 2048
   * @returns {Promise<string>}   - The text content of the first candidate
   */
  async function geminiGenerate(apiKey, prompt, opts = {}) {
    const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature     : opts.temperature     ?? 0.3,
        maxOutputTokens : opts.maxOutputTokens ?? 2048,
        topP            : 0.9,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    const response = await fetch(url, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg  = errBody?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Gemini API error: ${errMsg}`);
    }

    const data = await response.json();

    // Extract text from first candidate
    const candidate = data?.candidates?.[0];
    if (!candidate) {
      throw new Error('Gemini returned no candidates. Check API key and prompt.');
    }

    // Handle blocked content
    if (candidate.finishReason === 'SAFETY') {
      throw new Error('Gemini blocked the response due to safety filters.');
    }

    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini response had no text content.');
    }

    return text.trim();
  }

  // ── Test Functions ─────────────────────────────────────────────────────

  /**
   * Validate a Gemini API key with a minimal test prompt.
   * @param {string} apiKey
   * @returns {Promise<void>}  Throws if invalid.
   */
  async function testGemini(apiKey) {
    await geminiGenerate(apiKey, 'Say "OK" in one word.', {
      maxOutputTokens: 10,
      temperature    : 0,
    });
  }

  /**
   * Validate a YouTube Data API v3 key with a minimal search query.
   * @param {string} apiKey
   * @returns {Promise<void>}  Throws if invalid.
   */
  async function testYouTube(apiKey) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&q=test&maxResults=1&key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body?.error?.message || `HTTP ${resp.status}`);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────

  return {
    geminiGenerate,
    testGemini,
    testYouTube,
  };

})();
